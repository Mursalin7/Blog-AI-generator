import { createClient } from "@supabase/supabase-js";

export const createSupabaseClient = (accessToken?: string) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isServerClient = Boolean(accessToken);

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase URL and publishable key must be configured.");
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: !isServerClient,
      detectSessionInUrl: !isServerClient,
      persistSession: !isServerClient,
    },
    ...(accessToken
      ? {
          global: {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        }
      : {}),
  });
};
