// js/dailyBatch.js
// Winnowic Daily Batch System
// Schema notes:
//   topic_attempts: { user_id, question_id, unit, is_correct (bool), exams (text[]) }
//   questions:      { id, unit, exams (text[]), is_active (bool) }
//   daily_batches:  { id, user_id, exam, question_ids (jsonb), batch_date (date),
//                     questions_total, questions_completed, generated_at, completed_at }

import { supabase } from './supabase.js';

const BATCH_SIZE = 10;

// ─────────────────────────────────────────────
// PUBLIC: Get today's batch (or generate one)
// ─────────────────────────────────────────────

export async function getDailyBatch(exam) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().split('T')[0];

  // Return existing batch if already generated today
  const { data: existing } = await supabase
    .from('daily_batches')
    .select('*')
    .eq('user_id', user.id)
    .eq('exam', exam)
    .eq('batch_date', today)
    .maybeSingle();

  if (existing) return existing;

  return await generateBatch(user.id, exam);
}

// ─────────────────────────────────────────────
// PUBLIC: Mark batch as complete
// ─────────────────────────────────────────────

export async function markBatchComplete(batchId, questionsCompleted) {
  const { error } = await supabase
    .from('daily_batches')
    .update({
      completed_at: new Date().toISOString(),
      questions_completed: questionsCompleted
    })
    .eq('id', batchId);

  if (error) console.error('markBatchComplete error:', error);
}

// ─────────────────────────────────────────────
// PUBLIC: Check if today's batch is done
// ─────────────────────────────────────────────

export async function isTodayBatchComplete(exam) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('daily_batches')
    .select('completed_at, questions_completed, questions_total')
    .eq('user_id', user.id)
    .eq('exam', exam)
    .eq('batch_date', today)
    .maybeSingle();

  if (!data) return false;
  return !!data.completed_at || data.questions_completed >= data.questions_total;
}

// ─────────────────────────────────────────────
// INTERNAL: Generate a new batch
// ─────────────────────────────────────────────

async function generateBatch(userId, exam) {

  // ── 1. Get user's recent attempts for this exam ──
  // exams is stored as text[] so we use .contains()
  const { data: attempts, error: attemptsError } = await supabase
    .from('topic_attempts')
    .select('question_id, unit, is_correct')   // is_correct matches your schema
    .eq('user_id', userId)
    .contains('exams', [exam])
    .order('created_at', { ascending: false })
    .limit(300);

  if (attemptsError) {
    console.error('generateBatch - attempts fetch error:', attemptsError);
  }

  // ── 2. Compute accuracy by unit ──
  const unitStats = {};

  for (const a of (attempts || [])) {
    if (!unitStats[a.unit]) {
      unitStats[a.unit] = { correct: 0, total: 0 };
    }
    unitStats[a.unit].total++;
    if (a.is_correct) unitStats[a.unit].correct++;   // is_correct not correct
  }

  // ── 3. Rank units: lower accuracy = higher priority ──
  const rankedUnits = Object.entries(unitStats)
    .map(([unit, s]) => ({
      unit,
      accuracy: s.total > 0 ? s.correct / s.total : 0,
      attempts: s.total
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  // ── 4. Build slot allocation ──
  //    40% weakest unit
  //    30% second weakest
  //    20% third weakest
  //    10% random (any unit, freshness > weakness)
  const allocation = buildAllocation(rankedUnits);

  // ── 5. Fetch question IDs, avoiding recently seen questions ──
  const recentIds = new Set((attempts || []).map(a => a.question_id));
  const questionIds = await fetchQuestionsForAllocation(exam, allocation, recentIds);

  if (questionIds.length === 0) {
    console.warn('generateBatch: no questions found for exam', exam);
    return null;
  }

  // ── 6. Persist the batch ──
  console.log('Attempting batch insert for:', userId, exam, questionIds.length, 'questions');
  const { data: batch, error: insertError } = await supabase
    .from('daily_batches')
    .insert({
      user_id: userId,
      exam,
      question_ids: questionIds,         // jsonb array of UUIDs
      questions_total: questionIds.length,
      batch_date: new Date().toISOString().split('T')[0]
    })
    .select()
    .single();

  if (insertError) {
    console.error('generateBatch - insert error:', insertError);
    return null;
  }

  return batch;
}

// ─────────────────────────────────────────────
// INTERNAL: Build unit → slot count allocation
// ─────────────────────────────────────────────

function buildAllocation(rankedUnits) {
  // If user is brand new (no attempts), return null unit = random questions
  if (rankedUnits.length === 0) {
    return [{ unit: null, count: BATCH_SIZE }];
  }

  const slots = [
    { index: 0, ratio: 0.40 },
    { index: 1, ratio: 0.30 },
    { index: 2, ratio: 0.20 },
    { index: -1, ratio: 0.10 } // -1 means random, ignores unit
  ];

  const result = [];
  let assigned = 0;

  for (const slot of slots) {
    // Skip unit slots that don't exist (e.g. user only has 1 unit)
    if (slot.index >= 0 && slot.index >= rankedUnits.length) continue;

    const count = Math.max(1, Math.round(BATCH_SIZE * slot.ratio));
    assigned += count;

    result.push({
      unit: slot.index === -1 ? null : rankedUnits[slot.index].unit,
      count
    });
  }

  // If rounding left us short, add to weakest slot
  const shortfall = BATCH_SIZE - assigned;
  if (shortfall > 0 && result.length > 0) {
    result[0].count += shortfall;
  }

  return result;
}

// ─────────────────────────────────────────────
// INTERNAL: Fetch question IDs for each slot
// ─────────────────────────────────────────────

async function fetchQuestionsForAllocation(exam, allocation, recentIds) {
  const allIds = [];

  for (const slot of allocation) {
    // Oversample by 3x so we can filter out recently-seen questions
    const fetchCount = slot.count * 3;

    let query = supabase
      .from('questions')
      .select('id')
      .contains('exams', [exam])       // exams is text[], use .contains()
      .eq('is_active', true)
      .limit(fetchCount);

    if (slot.unit) {
      query = query.eq('unit', slot.unit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('fetchQuestionsForAllocation error:', error);
      continue;
    }

    if (!data || data.length === 0) continue;

    // Prefer questions the user hasn't seen recently
    const unseen = data.filter(q => !recentIds.has(q.id));
    const pool = unseen.length >= slot.count ? unseen : data;

    // Shuffle the pool
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);

    allIds.push(...shuffled.slice(0, slot.count).map(q => q.id));
  }

  return allIds;
}

export async function getBatchStreak(userId, exam) {
    const { data } = await supabase
        .from('daily_batches')
        .select('batch_date, completed_at')
        .eq('user_id', userId)
        .eq('exam', exam)
        .not('completed_at', 'is', null)
        .order('batch_date', { ascending: false })
        .limit(60);

    if (!data || data.length === 0) return 0;

    let streak = 0;
    let expected = new Date().toISOString().split('T')[0];

    for (const batch of data) {
        if (batch.batch_date === expected) {
            streak++;
            const d = new Date(expected);
            d.setDate(d.getDate() - 1);
            expected = d.toISOString().split('T')[0];
        } else {
            break;
        }
    }
    return streak;
}
