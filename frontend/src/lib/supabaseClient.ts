import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://yjmrjbiqzjxyhfwvlhqd.supabase.co";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_re_KHJqPpkijuKZVoDXLxw_G1gS03zu";

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey
);


