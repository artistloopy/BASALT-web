#!/usr/bin/env node
// scripts/fill_comments_authors.js
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fill_comments_authors.js
// This script will attempt to match comments without author_id to auth.users using common fields
// and update comments with author_id + normalized author_display when a unique match is found.

import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const OUT_UNRESOLVED = path.resolve(process.cwd(), 'data', 'comments-unresolved.json');

function normalize(s) {
  if (!s) return '';
  return String(s).trim().toLowerCase();
}

async function writeUnresolved(arr) {
  try {
    await fs.mkdir(path.dirname(OUT_UNRESOLVED), { recursive: true });
    await fs.writeFile(OUT_UNRESOLVED, JSON.stringify(arr, null, 2), 'utf-8');
    console.log('Wrote unresolved to', OUT_UNRESOLVED);
  } catch (e) {
    console.error('Failed writing unresolved file', e);
  }
}

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env');
    process.exit(1);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  // 1) fetch comments missing author_id
  console.log('Fetching comments missing author_id...');
  const cRes = await sb.from('comments').select('id,author_display,created_at,post_id').is('author_id', null).limit(10000);
  if (cRes.error) {
    console.error('Error fetching comments:', cRes.error);
    // if missing column, abort
    if (String(cRes.error.message).toLowerCase().includes('author_id') || String(cRes.error.code) === '42703') {
      console.error('Database does not have author_id column. Run migration before attempting batch fill.');
    }
    process.exit(1);
  }
  const comments = cRes.data || [];
  console.log('Found', comments.length, 'comments to analyze');

  if (comments.length === 0) {
    console.log('Nothing to do. Exiting');
    return;
  }

  // 2) fetch all users via admin endpoint if available
  console.log('Fetching users from auth.users...');
  let users = [];
  try {
    // try admin SDK method
    if (sb.auth && sb.auth.admin && typeof sb.auth.admin.listUsers === 'function') {
      const list = await sb.auth.admin.listUsers();
      users = (list?.data?.users) || list?.data || [];
    }
  } catch (e) {
    console.debug('admin.listUsers unavailable or failed', e?.message || e);
  }
  if (!users || users.length === 0) {
    // fallback to direct table query (service role should allow this)
    const uRes = await sb.from('auth.users').select('id,email,user_metadata');
    if (uRes.error) {
      console.error('Failed to fetch auth.users:', uRes.error);
      process.exit(1);
    }
    users = uRes.data || [];
  }
  console.log('Loaded', users.length, 'users');

  // build indices
  const mapByEmailLocal = new Map();
  const mapByUsername = new Map();
  const mapByDisplay = new Map();

  for (const u of users) {
    const id = u.id || u.user_id || u.uid || u.uid;
    const email = u.email || (u.user_metadata && u.user_metadata.email) || null;
    const meta = u.user_metadata || {};
    const local = email ? normalize(email.split('@')[0]) : null;
    const username = normalize(meta.username || meta.name || meta.display_name || meta.full_name || '');
    const disp = normalize(meta.display_name || meta.name || meta.username || '');
    if (local) {
      if (!mapByEmailLocal.has(local)) mapByEmailLocal.set(local, []);
      mapByEmailLocal.get(local).push(u);
    }
    if (username) {
      if (!mapByUsername.has(username)) mapByUsername.set(username, []);
      mapByUsername.get(username).push(u);
    }
    if (disp) {
      if (!mapByDisplay.has(disp)) mapByDisplay.set(disp, []);
      mapByDisplay.get(disp).push(u);
    }
  }

  const unresolved = [];
  let updated = 0;
  for (const c of comments) {
    const raw = String(c.author_display || '').trim();
    const key = normalize(raw);
    let candidates = [];
    if (key && mapByDisplay.has(key)) candidates = mapByDisplay.get(key).slice();
    if ((!candidates || candidates.length === 0) && key && mapByUsername.has(key)) candidates = mapByUsername.get(key).slice();
    if ((!candidates || candidates.length === 0) && key && mapByEmailLocal.has(key)) candidates = mapByEmailLocal.get(key).slice();

    if (candidates.length === 1) {
      const u = candidates[0];
      const normalizedDisplay = (u.user_metadata && (u.user_metadata.display_name || u.user_metadata.username || u.user_metadata.name)) || (u.email ? u.email.split('@')[0] : (u.id ? String(u.id).slice(0,8) : ''));
      const upd = await sb.from('comments').update({ author_id: u.id, author_display: normalizedDisplay }).eq('id', c.id).select('*');
      if (upd.error) {
        console.error('Failed to update comment', c.id, upd.error);
        unresolved.push({ comment: c, reason: 'update-failed', error: String(upd.error) });
      } else {
        updated++;
        console.log('Updated comment', c.id, '=>', u.id);
      }
    } else {
      // ambiguous or not found
      unresolved.push({ comment: c, candidates: (candidates || []).map(x => ({ id: x.id, email: x.email, user_metadata: x.user_metadata })) });
    }
  }

  console.log('Done. Updated:', updated, 'Unresolved:', unresolved.length);
  await writeUnresolved(unresolved);
}

main().catch((e) => { console.error('Fatal error', e); process.exit(1); });
