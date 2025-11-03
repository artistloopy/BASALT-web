import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase env vars are not set: PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY');
}

let supabaseClient;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  // lightweight shim so importing modules won't crash when env is not configured.
  const noop = async () => ({ data: null, error: { message: 'Supabase not configured' } });
  const noopGetUser = async () => ({ data: { user: null } });
  const authShim = {
    getUser: noopGetUser,
    signOut: async () => ({}),
    signUp: noop,
    signInWithPassword: noop,
    onAuthStateChange: (_cb) => ({ data: null }),
  };

  const queryShim = () => {
    const chain = {
      select: async () => ({ data: [], error: null }),
      insert: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
      update: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
      order: () => chain,
      limit: () => chain,
      eq: () => chain,
      // for compatibility
      then: (cb) => cb({ data: [], error: null }),
    };
    return chain;
  };

  supabaseClient = {
    auth: authShim,
    from: (_table) => queryShim(),
  };
}

export const supabase = supabaseClient;
export default supabase;
