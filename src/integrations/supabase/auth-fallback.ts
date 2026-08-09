// This previously installed a "local auth fallback" that silently faked
// sign-up/sign-in into the browser's localStorage whenever real Supabase
// Auth failed (which it did for a while, due to an invalid API key). That
// caused real, hard-to-diagnose problems: users appeared "signed in" to
// accounts that never existed in Supabase, none of their work was ever
// actually saved, and OAuth was hard-disabled with a fixed error message.
//
// Real Supabase Auth is fully configured and working now, so this is
// retired - `supabase.auth` is used directly and unmodified. This function
// is kept as a no-op purely so `client.ts` (auto-generated, not meant to be
// hand-edited) doesn't need to change.
export function installLocalAuthFallback(supabase: any) {
  // One-time cleanup: clear any fake local session/account data left over
  // from when the fallback was active, so a returning browser doesn't stay
  // stuck holding a "session" that was never real.
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    window.localStorage.removeItem("geopulse-local-session");
    window.localStorage.removeItem("geopulse-local-users");
  }
  return supabase.auth;
}
