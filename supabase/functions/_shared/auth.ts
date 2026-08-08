import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Authorizes a request as either a real signed-in Supabase user (EarlyWarning
 * requires login, so its manual "Ingest Weather Now"/"Check Hazards Now"
 * buttons always carry a real session token) or the pg_cron-triggered
 * scheduled job presenting the shared secret. Without this, `verify_jwt=false`
 * means anyone with the bare function URL could trigger ingestion/evaluation
 * (and the Groq calls evaluate-hazards makes) for every user, unthrottled.
 */
export async function authorizeUserOrCron(req: Request, supabase: SupabaseClient): Promise<boolean> {
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (cronSecret && providedSecret && providedSecret === cronSecret) {
    return true;
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabase.auth.getUser(token);
    if (data?.user) return true;
  }

  return false;
}
