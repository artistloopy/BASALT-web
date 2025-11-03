import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const FALLBACK_FILE = path.resolve(process.cwd(), 'data', 'community-comments.json');

async function readFallback() {
  try {
    const txt = await fs.readFile(FALLBACK_FILE, 'utf-8');
    return JSON.parse(txt || '[]');
  } catch {
    return [];
  }
}
async function writeFallback(arr: unknown) {
  try {
    await fs.mkdir(path.dirname(FALLBACK_FILE), { recursive: true });
    await fs.writeFile(FALLBACK_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err) {
    console.error('writeFallback comments error', err);
  }
}

async function trySupabaseQuery(SUPABASE_URL: string | undefined, SERVICE_ROLE_KEY: string | undefined, cb: (supabase: any) => Promise<any>) {
  try {
    const supabase = createClient(SUPABASE_URL as string, SERVICE_ROLE_KEY as string);
    return await cb(supabase);
  } catch (e) {
    return { error: e };
  }
}

function isMissingColumnError(err: any, columnName = 'author_id') {
  if (!err) return false;
  const msg = String(err?.message || err?.error || err).toLowerCase();
  return msg.includes(columnName.toLowerCase()) || msg.includes('42703') || msg.includes('column') && msg.includes('does not exist');
}

export async function GET({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const postId = url.searchParams.get('postId');
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || '10')));
    if (!postId) return new Response(JSON.stringify({ error: 'Missing postId' }), { status: 400 });

    const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || (globalThis as any)?.__astro?.env?.PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    const ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || (globalThis as any)?.__astro?.env?.PUBLIC_SUPABASE_ANON_KEY;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    if (SUPABASE_URL && (SERVICE_ROLE_KEY || ANON_KEY)) {
      const key = SERVICE_ROLE_KEY || ANON_KEY;
      let res: any = await trySupabaseQuery(SUPABASE_URL, key, async (supabase) => {
        // try with author_id and parent_id first
        return supabase
          .from('comments')
          .select('id,post_id,parent_id,author_id,author_display,content,created_at', { count: 'exact' })
          .eq('post_id', postId)
          .order('created_at', { ascending: false })
          .range(from, to);
      });

      // if DB complains about missing author_id column, retry without it
      if (res && res.error && isMissingColumnError(res.error, 'author_id')) {
        console.warn('GET /api/comments - author_id column missing, retrying without author_id');
        res = await trySupabaseQuery(SUPABASE_URL, key, async (supabase) => {
          return supabase
            .from('comments')
            .select('id,post_id,parent_id,author_display,content,created_at', { count: 'exact' })
            .eq('post_id', postId)
            .order('created_at', { ascending: false })
            .range(from, to);
        });
      }

      if (!res || res.error || res.data === undefined) {
        console.warn('GET /api/comments supabase error, falling back to file', res?.error || 'no-res');
      } else {
        return new Response(JSON.stringify({ data: res.data || [], total: res.count || 0, page, limit }), { status: 200 });
      }
    }

    // fallback to local file
    const local = await readFallback();
    const all = Array.isArray(local) ? local.filter((c: any) => String(c.post_id) === String(postId)) : [];
    const total = all.length;
    const slice = all.slice(from, to + 1);
    return new Response(JSON.stringify({ data: slice, total, page, limit }), { status: 200 });
  } catch (err) {
    console.error('api/comments GET error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    let body: Record<string, unknown> | null = null;
    try {
      body = await request.json();
    } catch (parseErr) {
      console.error('api/comments POST - invalid JSON body', String(parseErr));
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body', details: String(parseErr) }), { status: 400 });
    }

  const { post_id, content, parent_id } = body || {};
    if (!post_id) return new Response(JSON.stringify({ error: 'Missing post_id' }), { status: 400 });
    if (!content || typeof content !== 'string' || !content.trim()) return new Response(JSON.stringify({ error: 'Missing content' }), { status: 400 });

    const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || (globalThis as any)?.__astro?.env?.PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    // Validate Authorization header and fetch user
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    let user: any = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (SUPABASE_URL) {
        const userResp = await fetch(new URL('/auth/v1/user', SUPABASE_URL).toString(), {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (userResp.ok) {
          user = await userResp.json();
        } else {
          return new Response(JSON.stringify({ error: 'Invalid or expired access token' }), { status: 401 });
        }
      }
    } else {
      return new Response(JSON.stringify({ error: 'Missing Authorization Bearer token' }), { status: 401 });
    }

  // prefer `display_name` if present in user_metadata (Supabase UI may store display name there),
  // then username or name, then fallback to email local-part
    const display = (user?.user_metadata && (user.user_metadata.display_name || user.user_metadata.username || user.user_metadata.name)) || (user?.email ? user.email.split('@')[0] : null) || '匿名';
    const author_id = user?.id ?? null;
    const payload: any = {
      post_id: String(post_id),
      content: String(content).trim().slice(0, 2000),
      author_display: display,
      created_at: new Date().toISOString(),
    };
    // attach author_id only if present
    if (author_id) payload.author_id = author_id;
    // attach parent_id if provided (allow nested replies)
    if (parent_id) payload.parent_id = String(parent_id);

    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      let res: any = await trySupabaseQuery(SUPABASE_URL, SERVICE_ROLE_KEY, async (supabase) => {
        return await supabase.from('comments').insert([payload]).select('*');
      });

      // if insert failed because author_id column doesn't exist, retry without author_id
      if (res && res.error && isMissingColumnError(res.error, 'author_id')) {
        console.warn('POST /api/comments - author_id column missing, retrying insert without author_id');
        const payload2 = { ...payload };
        delete payload2.author_id;
        // keep parent_id if present
        res = await trySupabaseQuery(SUPABASE_URL, SERVICE_ROLE_KEY, async (supabase) => {
          return await supabase.from('comments').insert([payload2]).select('*');
        });
      }

      if (res && !res.error && res.data) {
        return new Response(JSON.stringify({ data: res.data }), { status: 200 });
      }
      console.warn('POST /api/comments supabase insert failed', res?.error || res);
    }

  // fallback: write to local file
  const local = await readFallback();
  const id = 'local-' + Date.now().toString(36);
  const row = { id, ...payload };
    local.unshift(row);
    await writeFallback(local);
    return new Response(JSON.stringify({ data: [row] }), { status: 200 });
  } catch (err) {
    console.error('api/comments POST error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
