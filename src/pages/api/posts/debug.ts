import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

const FALLBACK_FILE = path.resolve(process.cwd(), 'data', 'community-posts.json');

async function readFallback() {
  try {
    const txt = await fs.readFile(FALLBACK_FILE, 'utf-8');
    return JSON.parse(txt || '[]');
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    const ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    type KeyReport = { ok: boolean; count: number | null; sample?: unknown[] | null; error?: string | null };
    type Report = {
      env: { has_supabase_url: boolean; has_service_role: boolean; has_anon: boolean };
      fallback_count: number | null;
      service_role?: KeyReport;
      anon?: KeyReport;
    };

    const report: Report = {
      env: {
        has_supabase_url: Boolean(SUPABASE_URL),
        has_service_role: Boolean(SERVICE_ROLE_KEY),
        has_anon: Boolean(ANON_KEY),
      },
      fallback_count: null,
    };

    // fallback file
    const fallback = await readFallback();
    report.fallback_count = Array.isArray(fallback) ? fallback.length : null;

    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      try {
        const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        const { data, error } = await sb.from('posts').select('id,title,author_display,created_at,likes').order('created_at', { ascending: false }).limit(10);
        if (error) throw error;
        report.service_role = { ok: true, count: Array.isArray(data) ? data.length : null, sample: data };
      } catch (err) {
        let msg = 'unknown';
        if (err instanceof Error) msg = err.message; else msg = String(err);
        report.service_role = { ok: false, count: null, error: msg };
      }
    }

    if (SUPABASE_URL && ANON_KEY) {
      try {
        const sb2 = createClient(SUPABASE_URL, ANON_KEY);
        const { data, error } = await sb2.from('posts').select('id,title,author_display,created_at,likes').order('created_at', { ascending: false }).limit(10);
        if (error) throw error;
        report.anon = { ok: true, count: Array.isArray(data) ? data.length : null, sample: data };
      } catch (err) {
        let msg = 'unknown';
        if (err instanceof Error) msg = err.message; else msg = String(err);
        report.anon = { ok: false, count: null, error: msg };
      }
    }

    return new Response(JSON.stringify(report, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
