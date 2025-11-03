import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

type SupabaseUser = { id?: string | null; email?: string | null; user_metadata?: Record<string, unknown> };

const FALLBACK_FILE = path.resolve(process.cwd(), 'data', 'community-posts.json');

async function readFallback() {
  try {
    const txt = await fs.readFile(FALLBACK_FILE, 'utf-8');
    return JSON.parse(txt || '[]');
  } catch {
    return [];
  }
}

async function writeFallback(arr) {
  try {
    await fs.mkdir(path.dirname(FALLBACK_FILE), { recursive: true });
    await fs.writeFile(FALLBACK_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err) {
    console.error('writeFallback error', err);
  }
}

async function trySupabaseQuery(SUPABASE_URL, SERVICE_ROLE_KEY, cb) {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    return await cb(supabase);
  } catch (e) {
    return { error: e };
  }
}

function isMissingColumnError(err, columnName = 'author_id') {
  if (!err) return false;
  const msg = String(err?.message || err?.error || err).toLowerCase();
  return msg.includes(columnName.toLowerCase()) || msg.includes('42703') || (msg.includes('column') && msg.includes('does not exist'));
}

export async function GET() {
  try {
    // Prefer server-side env. In most hosting setups process.env is available.
    const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || (globalThis?.__astro?.env?.PUBLIC_SUPABASE_URL);
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    const ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || (globalThis?.__astro?.env?.PUBLIC_SUPABASE_ANON_KEY);

    // Prefer service role for server-side reads (full access). If missing, fall back to the anon public key
    // so the server can still read the public posts table rather than returning the local fallback file.
    if (SUPABASE_URL && (SERVICE_ROLE_KEY || ANON_KEY)) {
      const key = SERVICE_ROLE_KEY || ANON_KEY;
      const res = await trySupabaseQuery(SUPABASE_URL, key, async (supabase) => {
  // request author fields if present (include author_id when available)
  return await supabase.from('posts').select('id,title,content,author_display,author_email,author_id,created_at,likes').order('created_at', { ascending: false }).limit(100);
      });
      if (!res || res.error || res.data === undefined) {
        console.warn('GET /api/posts supabase error, falling back to file', res?.error || 'no-res');
        const local = await readFallback();
        return new Response(JSON.stringify({ data: local }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: res.data }), { status: 200 });
    }

    // fallback to local file store
    const local = await readFallback();
    return new Response(JSON.stringify({ data: local }), { status: 200 });
  } catch (err) {
    console.error('api/posts GET error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}

export async function DELETE({ request }) {
  try {
    // parse body
    let body = null;
    try { body = await request.json(); } catch (e) { /* ignore */ }
    const id = body?.id || null;
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

    const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || (globalThis?.__astro?.env?.PUBLIC_SUPABASE_URL);
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    // Require Authorization
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Missing Authorization Bearer token' }), { status: 401 });
    const token = authHeader.slice(7);

    // validate token and get user
    let user = null;
    if (SUPABASE_URL) {
      const userResp = await fetch(new URL('/auth/v1/user', SUPABASE_URL).toString(), { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
      if (!userResp.ok) return new Response(JSON.stringify({ error: 'Invalid or expired access token' }), { status: 401 });
      user = await userResp.json();
    }

    // Try delete with service role or user token
    if (SUPABASE_URL && (SERVICE_ROLE_KEY || token)) {
      const key = SERVICE_ROLE_KEY || token;
      // First try author_id match (preferred)
      let res = await trySupabaseQuery(SUPABASE_URL, key, async (supabase) => {
        return await supabase.from('posts').delete().eq('id', id).eq('author_id', user?.id).select('*');
      });

      // If DB complains about missing column author_id, retry using author_display/email matching
      if (res && res.error && isMissingColumnError(res.error, 'author_id')) {
        const display = (user?.user_metadata && (user.user_metadata.username || user.user_metadata.name)) || (user?.email ? user.email.split('@')[0] : null);
        res = await trySupabaseQuery(SUPABASE_URL, key, async (supabase) => {
          // try matching by author_display first
          let r = await supabase.from('posts').delete().eq('id', id).eq('author_display', display).select('*');
          if (r && !r.error && r.data && r.data.length) return r;
          // next try matching by author_email if available
          if (user?.email) {
            r = await supabase.from('posts').delete().eq('id', id).eq('author_email', user.email).select('*');
            return r;
          }
          return r;
        });
      }

      if (res && !res.error && res.data && res.data.length) {
        return new Response(JSON.stringify({ data: res.data }), { status: 200 });
      }
      // If no rows affected, respond forbidden or not found
      if (res && !res.error && (!res.data || res.data.length === 0)) {
        return new Response(JSON.stringify({ error: 'Not allowed or not found' }), { status: 403 });
      }
      console.warn('DELETE /api/posts supabase error', res?.error || res);
    }

    // fallback to file store
    const local = await readFallback();
    const idx = local.findIndex((r) => String(r.id) === String(id));
    if (idx === -1) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    const target = local[idx];
    // allow delete in fallback only if author matches display or email
    const display = (user?.user_metadata && (user.user_metadata.username || user.user_metadata.name)) || (user?.email ? user.email.split('@')[0] : null);
    if (target.author_id && user?.id && String(target.author_id) !== String(user.id)) {
      return new Response(JSON.stringify({ error: 'Not allowed' }), { status: 403 });
    }
    if (!target.author_id && target.author_display && display && String((target.author_display || '')).trim() !== String(display).trim()) {
      return new Response(JSON.stringify({ error: 'Not allowed' }), { status: 403 });
    }
    // delete
    local.splice(idx, 1);
    await writeFallback(local);
    return new Response(JSON.stringify({ data: [target] }), { status: 200 });
  } catch (err) {
    console.error('api/posts DELETE error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    // defend against empty/malformed JSON bodies so the endpoint doesn't throw
  let body: Record<string, unknown> | null = null;
    try {
      body = await request.json();
    } catch (parseErr) {
      // try to capture raw text for debugging
      let raw = null;
  try { raw = await request.text(); } catch { /* ignore */ }
      console.error('api/posts POST - invalid JSON body', String(parseErr), { raw });
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body', details: String(parseErr) }), { status: 400 });
    }
    const { title, content, likes } = body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return new Response(JSON.stringify({ error: 'Missing title' }), { status: 400 });
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return new Response(JSON.stringify({ error: 'Missing content' }), { status: 400 });
    }

    // Prefer server-side env. In most hosting setups process.env is available.
    const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || (globalThis?.__astro?.env?.PUBLIC_SUPABASE_URL);
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    // Validate incoming Authorization Bearer token and fetch user
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    let user: SupabaseUser | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (SUPABASE_URL) {
        const userResp = await fetch(new URL('/auth/v1/user', SUPABASE_URL).toString(), {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (userResp.ok) {
          const json = await userResp.json();
          user = json as SupabaseUser;
        } else {
          return new Response(JSON.stringify({ error: 'Invalid or expired access token' }), { status: 401 });
        }
      }
    } else {
      return new Response(JSON.stringify({ error: 'Missing Authorization Bearer token' }), { status: 401 });
    }

    // derive a friendly display name from the user object
    const display = (user?.user_metadata && (user.user_metadata.username || user.user_metadata.name)) || (user?.email ? user.email.split('@')[0] : null);
    const payload = {
      title: String(title).trim().slice(0, 200),
      content: String(content).trim().slice(0, 10000),
      author_display: display,
      likes: typeof likes === 'number' ? likes : 0,
      created_at: new Date().toISOString(),
    };

    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      // Try inserting with author_display first. If the posts table doesn't have that column
      // (older schema), attempt a fallback insert that uses author_email or no author column.
      const res = await trySupabaseQuery(SUPABASE_URL, SERVICE_ROLE_KEY, async (supabase) => {
        return await supabase.from('posts').insert([payload]).select('*');
      });

      if (res && !res.error && res.data) {
        return new Response(JSON.stringify({ data: res.data }), { status: 200 });
      }

      // If error mentions missing column 'author_display', retry with a compatible payload
      const errMsg = (res && res.error && (res.error.message || String(res.error))) || '';
      if (errMsg.toLowerCase().includes('author_display') || errMsg.toLowerCase().includes('author_display')) {
        const fallbackPayload: Record<string, unknown> = {
          title: payload.title,
          content: payload.content,
          likes: payload.likes,
          created_at: payload.created_at,
        };
        if (user?.email) fallbackPayload.author_email = user.email;

        const res2 = await trySupabaseQuery(SUPABASE_URL, SERVICE_ROLE_KEY, async (supabase) => {
          return await supabase.from('posts').insert([fallbackPayload]).select('*');
        });
        if (res2 && !res2.error && res2.data) {
          return new Response(JSON.stringify({ data: res2.data }), { status: 200 });
        }
        console.warn('POST /api/posts fallback insert failed', res2?.error || res2);
      } else {
        console.warn('POST /api/posts supabase error, falling back to file', res?.error || 'no-res');
      }
    }

    // fallback: write to local JSON file
    const local = await readFallback();
    const id = 'local-' + Date.now().toString(36);
    const row = { id, ...payload };
    local.unshift(row);
    await writeFallback(local);
    return new Response(JSON.stringify({ data: [row] }), { status: 200 });
  } catch (err) {
    console.error('api/posts POST error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}

export async function PATCH({ request }) {
  try {
    let body: Record<string, unknown> | null = null;
    try {
      body = await request.json();
    } catch (parseErr) {
      console.error('api/posts PATCH - invalid JSON body', String(parseErr));
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body', details: String(parseErr) }), { status: 400 });
    }
    const { id, likes } = body || {};
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

    const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || (globalThis?.__astro?.env?.PUBLIC_SUPABASE_URL);
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    // Require Authorization Bearer token so only authenticated users can like
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization Bearer token' }), { status: 401 });
    }
    const token = authHeader.slice(7);

    // validate token (optional: will fail if token invalid)
    if (SUPABASE_URL) {
      const userResp = await fetch(new URL('/auth/v1/user', SUPABASE_URL).toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!userResp.ok) {
        return new Response(JSON.stringify({ error: 'Invalid or expired access token' }), { status: 401 });
      }
    }

    // Try to update using service role if available, otherwise use the user's token
    if (SUPABASE_URL && (SERVICE_ROLE_KEY || token)) {
      const key = SERVICE_ROLE_KEY || token;
      const res = await trySupabaseQuery(SUPABASE_URL, key, async (supabase) => {
        return await supabase.from('posts').update({ likes }).eq('id', id).select('*');
      });
      if (!res || res.error || !res.data) {
        console.warn('PATCH /api/posts supabase error, falling back to file', res?.error || 'no-res');
      } else {
        return new Response(JSON.stringify({ data: res.data }), { status: 200 });
      }
    }

    // fallback to file
    const local = await readFallback();
    const idx = local.findIndex((r) => String(r.id) === String(id));
    if (idx === -1) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    local[idx].likes = likes;
    await writeFallback(local);
    return new Response(JSON.stringify({ data: [local[idx]] }), { status: 200 });
  } catch (err) {
    console.error('api/posts PATCH error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
