
# BASALT — Community & Resources

![BASALT screenshot](public/assets/images/hero-image.png)

This repository powers the BASALT website (local project name: `lonely-limb`). It is built with
Astro + Tailwind and provides a small community forum, a resource center for file downloads,
and a blog. The site will persist data to Supabase when configured; otherwise it falls back to
local JSON files so the UI remains browseable.

Key features

- Community forum: posts, comments and likes (Supabase-backed when keys are present).
- Resource Center: server-side listing from Supabase storage (with safe client fallbacks).
- Blog and static pages powered by Astro; image optimization and SEO helpers included.

If you need to re-skin or adapt the theme, most layout and UI lives under `src/components/` and
`src/layouts/`.
# BASALT — Community & Resources

![BASALT screenshot](public/assets/images/hero-image.png)

This repository powers the BASALT website (local project: `lonely-limb`). It is built with
Astro + Tailwind and provides a community forum, a resource center for downloads, and a blog.
When Supabase is configured the site persists data; otherwise local JSON fallbacks allow
read-only browsing.

Quick start

```bash
pnpm install
pnpm run dev
```

Open http://localhost:4321 to preview locally.

What you'll find in this project

- `src/pages/community.astro` — community UI and client logic for posts/comments/likes
- `src/pages/resource-center/index.astro` — resource listing (SSR + client fallbacks)
- `src/pages/api/*` — simple API routes used by the client (comments, posts, storage list)
- `data/` — local JSON fallbacks used when Supabase is not configured

Environment variables

Set these in your host (Netlify/Vercel/local) for full functionality:

- `PUBLIC_SUPABASE_URL` — your Supabase project URL
- `PUBLIC_SUPABASE_ANON_KEY` — anon key for client-side reads
- `SUPABASE_SERVICE_ROLE_KEY` — (server-only) service role key for privileged API calls
- `RESOURCE_BUCKET_NAME` — (optional) bucket name used by Resource Center

If missing, the site falls back to demo/local data and a lightweight supabase shim.

Deploying to Netlify

1. Connect the repo to Netlify.
2. Add required env vars in Netlify site settings (Build & deploy → Environment).
3. Deploy (build command: `pnpm run build`).

Diagnostic tip: visit `/api/posts/debug` on your deploy to check which env vars are set and
whether Supabase queries succeed.

Example:

```bash
curl -sS https://<your-site>.netlify.app/api/posts/debug | jq .
```

If posts are visible locally but not on Netlify, the debug endpoint will usually show missing
keys or query errors. The most common fixes are adding the missing env vars or implementing
`/api/posts` fallback to `data/community-posts.json`.

Contributing

Contributions welcome. Open an issue or PR. If you'd like, I can add a safe `/api/posts`
fallback or additional diagnostics — tell me which and I'll implement it.

License

See `LICENSE.md` (MIT).
