# Removing Lovable-specific dependencies

After these changes GeoPulse has **zero** runtime or build dependency on Lovable.

## 1. npm packages

| Package | Where | Action |
|---|---|---|
| `@lovable.dev/cloud-auth-js` | `package.json` deps | **Remove** — replaced by `supabase.auth.signInWithOAuth` (see `AUTH_MIGRATION.md`) |
| `lovable-tagger` | `package.json` devDeps + `vite.config.ts` | **Remove** — dev-only component tagger, no runtime effect |

```bash
npm remove @lovable.dev/cloud-auth-js lovable-tagger
```

`vite.config.ts` — delete both lines:

```diff
-import { componentTagger } from "lovable-tagger";
...
-    mode === 'development' && componentTagger(),
```

## 2. Source files

| Path | Action |
|---|---|
| `src/integrations/lovable/` | **Delete** the whole folder |
| `src/pages/Auth.tsx` | Swap the `lovable.auth.signInWithOAuth` call for `supabase.auth.signInWithOAuth` |
| `src/integrations/supabase/client.ts` | Keep. It is plain `@supabase/supabase-js`; only the env values change. The "auto-generated" header comment can be deleted. |
| `src/integrations/supabase/types.ts` | Keep, and regenerate on your own project: `supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts` |

## 3. Edge Functions

`supabase/functions/generate-visualization/index.ts` optionally calls the
**Lovable AI Gateway** (`https://ai.gateway.lovable.dev`) when `LOVABLE_API_KEY`
is present, and falls back to the direct Gemini API otherwise.

- **Simplest**: just don't set `LOVABLE_API_KEY` in your project — the code
  already skips the gateway block and uses Gemini directly.
- **Cleanest**: delete the gateway branch (around lines 445-500) so only the
  direct Gemini path remains.

No other function references Lovable. All 7 functions are standard Deno +
`npm:@supabase/supabase-js` and deploy with the stock Supabase CLI.

## 4. Hosting / config

| Item | Action |
|---|---|
| `supabase/config.toml` `project_id` | Replace with your own project ref |
| `.env` | Replace `VITE_SUPABASE_*` with your project's URL and anon key |
| Lovable badge / preview URLs | Not present in code; served only by Lovable hosting |
| Images referencing Lovable CDN | `rg "lovableproject\|lovable.app\|gpteng" src/ index.html` — re-host any hits (og:image, favicons) on your own domain |

## 5. Frontend hosting

The app is a static Vite SPA — `npm run build` emits `dist/`. Deploy to Vercel,
Netlify, Cloudflare Pages, S3+CloudFront, or nginx. The only requirement is an
SPA rewrite (all paths → `/index.html`) so React Router deep links work.
