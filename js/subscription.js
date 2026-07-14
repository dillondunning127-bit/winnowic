import { supabase } from "./supabase.js";
export async function checkDiagnosticsAccess(exam) {
    const hasSubAccess = await checkExamAccess(exam);
    if (hasSubAccess) return true;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: activeReward } = await supabase
        .from('reward_unlocks')
        .select('expires_at')
        .eq('user_id', user.id)
        .eq('reward_type', 'premium_diagnostics_24h')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

    return !!activeReward;
}
export async function checkExamAccess(exam) {
const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  const { data, error } = await supabase
    .from("subscriptions")
    .select("exam, end_date, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error || !data || data.length === 0) return false;

  const now = new Date();

  // Normalize exam (safety)
  const targetExam = exam.trim().toUpperCase();

  for (let sub of data) {

    const subExam = sub.exam?.toUpperCase();

    // Skip expired subscriptions
    if (sub.end_date && new Date(sub.end_date) < now) {
      continue;
    }

    // ✅ ALL ACCESS (overrides everything)
    if (subExam === "ALL") return true;

    // ✅ SAT subscription
    if (targetExam === "SAT_MATH" && subExam === "SAT_MATH") {
      return true;
    }

    // ✅ AP one-time purchase (exact match)
    if (subExam === targetExam) {
      return true;
    }
  }
  return false;
}

export async function getUserExams() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("subscriptions")
    .select("exam, end_date, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  const now = new Date();
  const exams = [];

  for (let sub of data || []) {
    if (sub.end_date && new Date(sub.end_date) < now) continue;

    if (sub.exam === "ALL") {
      return ["ALL"];
    }

    exams.push(sub.exam);
  }

  // Include reward-based diagnostics access alongside real subscriptions
  const { data: activeReward } = await supabase
    .from('reward_unlocks')
    .select('expires_at')
    .eq('user_id', user.id)
    .eq('reward_type', 'premium_diagnostics_24h')
    .gt('expires_at', now.toISOString())
    .maybeSingle();

  if (activeReward && !exams.includes('SAT_MATH')) {
    exams.push('SAT_MATH');
  }

  return exams;
}