import { createClient } from '@supabase/supabase-js';

export async function GET({ request }) {
  try {
    const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || (globalThis?.__astro?.env?.PUBLIC_SUPABASE_URL);
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    const BUCKET = process.env.RESOURCE_BUCKET_NAME || 'resources';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Server-side Supabase not configured. Set SUPABASE_SERVICE_ROLE_KEY.' }), { status: 500 });
    }

    const url = new URL(request.url);
    const prefix = url.searchParams.get('prefix') || '';

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // list objects in the configured bucket (prefix optional)
    const res = await supabase.storage.from(BUCKET).list(prefix, { limit: 200 });
    if (res.error) {
      return new Response(JSON.stringify({ error: res.error.message || res.error }), { status: 500 });
    }

    // return file list to client
    return new Response(JSON.stringify({ data: res.data || [] }), { status: 200 });
  } catch (err) {
    console.error('api/storage/list error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
