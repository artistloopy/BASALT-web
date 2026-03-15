import { createClient } from '@supabase/supabase-js';

export async function GET({ request }) {
  try {
    const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || (globalThis?.__astro?.env?.PUBLIC_SUPABASE_URL);
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    const BUCKET = process.env.RESOURCE_BUCKET_NAME || 'resources';

    // If server-side keys are missing, return an empty list (200) so client can fall back to demo files
    if (!SUPABASE_URL || !(SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY)) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }

    const url = new URL(request.url);
    const prefix = url.searchParams.get('prefix') || '';

  const key = SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(SUPABASE_URL, String(key));

    // list objects in the configured bucket (prefix optional)
    const res = await supabase.storage.from(BUCKET).list(prefix, { limit: 200 });
    if (res.error) {
      console.warn('api/storage/list supabase error, returning empty list', res.error);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }

    // return file list to client
    return new Response(JSON.stringify({ data: res.data || [] }), { status: 200 });
  } catch (err) {
    console.error('api/storage/list error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
