import { createClient } from '@supabase/supabase-js';

export async function POST({ request }) {
  try {
    const body = await request.json();
    const { path, expires } = body || {};

    if (!path || typeof path !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing path' }), { status: 400 });
    }

    const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || (globalThis?.__astro?.env?.PUBLIC_SUPABASE_URL);
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    const BUCKET = process.env.RESOURCE_BUCKET_NAME || 'resources';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Server-side Supabase not configured. Set SUPABASE_SERVICE_ROLE_KEY.' }), { status: 500 });
    }

    // basic sanitization to avoid odd paths
    if (path.includes('..')) {
      return new Response(JSON.stringify({ error: 'Invalid path' }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const ttl = typeof expires === 'number' && expires > 0 ? Math.min(expires, 60 * 60) : 60 * 5; // default 5 minutes

    const res = await supabase.storage.from(BUCKET).createSignedUrl(path, ttl);
    if (res.error) {
      return new Response(JSON.stringify({ error: res.error.message || res.error }), { status: 500 });
    }

  // normalize returned signed url (be permissive about returned shape)
  // use `any` to avoid strict type errors from different supabase client versions
  // Return the provider data as-is; client will pick the correct field name (signedUrl / signedURL / signed_url)
  return new Response(JSON.stringify({ data: res.data }), { status: 200 });
  } catch (err) {
    console.error('api/storage/signed-url error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
