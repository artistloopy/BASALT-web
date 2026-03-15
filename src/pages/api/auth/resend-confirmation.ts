import { createClient } from '@supabase/supabase-js';

// Ensure this route runs server-side so POST bodies and headers are available
export const prerender = false;

export async function POST({ request }) {
  try {
    // parse body safely to avoid uncaught JSON parse errors
  let body: unknown = {};
    try {
      const text = await request.text();
  body = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      console.warn('resend-confirmation: invalid JSON body', parseErr);
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
  const { email } = (body as unknown as Record<string, unknown>) || {};
      if (!email || typeof email !== 'string') {
        // log headers and received body to help debug missing-email calls
        try {
          console.warn('resend-confirmation: missing email in request', { headers: Object.fromEntries(request.headers.entries ? request.headers.entries() : []), received: body });
        } catch (e) {
          console.warn('resend-confirmation: missing email (headers log failed)', e);
        }
        const respBody: Record<string, unknown> = { error: 'Missing email' };
        if (process.env.NODE_ENV !== 'production') respBody.received = body;
        return new Response(JSON.stringify(respBody), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

    const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 });
    }


    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Try to generate a confirmation link via admin API (typed guard)
    // soft-typed guard to call admin.generateLink if available
  const adminApi = (supabase.auth as unknown) as { admin?: { generateLink?: (opts: { type: string; email: string }) => Promise<{ data?: unknown; error?: unknown }>; } };
    if (adminApi && adminApi.admin && typeof adminApi.admin.generateLink === 'function') {
      const res = await adminApi.admin.generateLink({ type: 'signup', email });
      if (res?.error) {
        const err = res.error as unknown;
        let msg = String(err);
        if (typeof err === 'object' && err !== null) {
          // attempt to read common message fields
          const e = err as Record<string, unknown>;
          if (typeof e.message === 'string') msg = e.message;
          else if (typeof e.msg === 'string') msg = e.msg;
        }
        return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      // Try to extract a usable link from the admin response so client can open or copy it for debugging
      let link: string | null = null;
      try {
        // common field names in various supabase-js versions
        const dataObj = res?.data as unknown;
        let extracted: string | null = null;
        if (dataObj && typeof dataObj === 'object') {
          const dd = dataObj as Record<string, unknown>;
          if (typeof dd['action_link'] === 'string') extracted = dd['action_link'] as string;
          else if (typeof dd['link'] === 'string') extracted = dd['link'] as string;
        }
        if (!extracted && typeof res?.data === 'string') extracted = String(res.data);
        link = extracted;
      } catch {
        link = null;
      }

      return new Response(JSON.stringify({ ok: true, link: link, raw: res }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Fallback: try to look up the user and trigger an update that re-sends confirmation is not supported via client lib
    return new Response(JSON.stringify({ error: 'Server does not support generateLink. Ensure supabase-js version supports auth.admin.generateLink.' }), { status: 501 });
  } catch (err) {
    console.error('resend-confirmation error', err);
    // If it's a SyntaxError coming from JSON parsing elsewhere, return a specific message
    if (err instanceof SyntaxError) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body: ' + err.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
