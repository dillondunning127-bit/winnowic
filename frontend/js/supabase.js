import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = 'https://mxzacyfkisblfqbxvkjj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_22h5msL9UyhxjfDaCh9ncw_KWk8ThB8';

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
