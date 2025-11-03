-- Create posts table for community forum
-- Run this in Supabase SQL editor (make sure role has permission)

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL,
  author_display text NULL,
  -- compatibility: older deployments may have used author_email
  author_email text NULL,
  likes integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Optional index to speed ordering by created_at
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts (created_at DESC);

-- Example Row Level Security (RLS) policies
-- Allow all users to SELECT
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- allow authenticated users to INSERT posts (we accept a display name on insert)
DROP POLICY IF EXISTS "allow authenticated insert" ON public.posts;
CREATE POLICY "allow authenticated insert" ON public.posts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- allow anyone to SELECT
DROP POLICY IF EXISTS "allow select" ON public.posts;
CREATE POLICY "allow select" ON public.posts
  FOR SELECT
  TO public
  USING (true);

-- allow authenticated users to update likes for rows (you may choose a stricter policy)
DROP POLICY IF EXISTS "allow update likes" ON public.posts;
CREATE POLICY "allow update likes" ON public.posts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Notes:
-- 1) If you use Supabase's default JWT claims, auth.uid() returns the current user's UUID.
-- 2) You may want to tighten UPDATE/DELETE policies to restrict who can edit posts (e.g. only author or admins).
-- 3) If your Supabase project does not have the pgcrypto extension (for gen_random_uuid),
--    use uuid_generate_v4() and enable "uuid-ossp" extension instead.

-- Example to enable pgcrypto (requires DB admin):
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Migration tip: run the CREATE TABLE statement in Supabase SQL editor, then test with the web UI.
