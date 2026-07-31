# Authentication: Lovable Cloud Auth → standard Supabase Auth

Only **one** file in GeoPulse depends on Lovable auth: `src/integrations/lovable/index.ts`,
used by `src/pages/Auth.tsx` for the Google sign-in button. Email/password sign-in
already uses plain `supabase.auth.*` and needs no changes.

## 1. Configure providers in your own Supabase project

Dashboard → Authentication → Providers:

- **Email**: enabled. Decide on "Confirm email" (Lovable Cloud had it on).
- **Google**: create OAuth credentials in Google Cloud Console
  (Consent screen + OAuth Client ID → Web application).
  - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
  - Paste Client ID + Secret into Supabase → Providers → Google.
- Dashboard → Authentication → URL Configuration:
  - Site URL: `https://your-domain.com`
  - Redirect URLs: `https://your-domain.com/**`, `http://localhost:8080/**`

## 2. Replace the Lovable auth shim

Delete `src/integrations/lovable/` entirely, then in `src/pages/Auth.tsx`:

```diff
-import { lovable } from "@/integrations/lovable";
```

and replace the Google handler body with:

```ts
const { error } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: `${window.location.origin}/`,
  },
});
if (error) {
  toast({ title: "Google sign-in failed", description: error.message, variant: "destructive" });
}
// On success the browser redirects; onAuthStateChange delivers the session on return.
```

Then remove the dependency:

```bash
npm remove @lovable.dev/cloud-auth-js
```

## 3. Password reset (currently missing)

`resetPasswordForEmail` needs a landing page. Add a public `/reset-password` route that
calls `supabase.auth.updateUser({ password })`, and call:

```ts
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/reset-password`,
});
```

## 4. Migrating existing users

Lovable Cloud runs on managed Supabase, so `auth.users` is a normal Supabase table.

- **Same project, just detached hosting** → nothing to do; users come along.
- **New Supabase project** → you cannot read `auth.users` password hashes from
  Lovable Cloud. Options:
  1. Ask Lovable support for an `auth.users` export (hashes are bcrypt and are
     accepted by Supabase's `auth.users` import), or
  2. Re-invite users: create rows with the Admin API
     (`supabase.auth.admin.createUser({ email, email_confirm: true })`) preserving
     the original `id` (critical — every RLS policy keys off `user_id`), then send
     each user a password-reset email.

Preserving the original user `id` is mandatory: every table
(`analysis_results`, `saved_locations`, `hazard_alerts`, `demo_recordings`, …)
stores `user_id` and all RLS policies compare it to `auth.uid()`.

## 5. Hardening worth doing during the move

- Enable leaked-password protection (HIBP) in Auth → Providers → Email.
- Keep anonymous sign-ups disabled.
- Tighten policies whose role is `public` to `authenticated` (see
  `01_schema_and_rls.sql`); they are already `auth.uid()`-scoped, so this is a
  defence-in-depth change, not a behavioural one.
