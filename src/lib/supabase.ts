// src/lib/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = String(import.meta.env.PUBLIC_SUPABASE_URL || '');
const PUBLIC_ANON = String(import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '');

function makeNoopClient() {
  const noop = {
    auth: {
      async getUser() { return { data: { user: null } }; },
      async getSession() { return { data: { session: null } }; },
      onAuthStateChange() { return { data: null, subscription: { unsubscribe() {} } }; },
      async signOut() { return { error: null }; },
      async setSession() { return { error: null }; },
      async signInWithPassword() { return { error: { message: 'Not configured' } }; },
    },
    from() {
      return {
        select: async () => ({ data: [], error: null }),
        insert: async () => ({ data: [], error: null }),
        update: async () => ({ data: [], error: null }),
        delete: async () => ({ data: [], error: null }),
        order: () => this,
        limit: () => this,
      };
    },
  } as unknown as SupabaseClient;
  return noop;
}

// browser/client supabase (anon key)
export const supabase = (typeof window !== 'undefined' && SUPABASE_URL && PUBLIC_ANON)
  ? createClient(SUPABASE_URL, PUBLIC_ANON, { auth: { persistSession: true, detectSessionInUrl: true } })
  : makeNoopClient();

// server-side factory (use in server API routes)
// Note: do NOT export the server client to browser code. Call createServerClient() only inside server code.
export function createServerSupabase() {
  const SERVICE_ROLE = String(process.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!SUPABASE_URL || !SERVICE_ROLE) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

export default supabase;