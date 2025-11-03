-- Create comments table for community forum
-- Run this in Supabase SQL editor (make sure role has permission)

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL,
  author_id uuid NULL,
  author_display text NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Optional index to speed ordering by created_at
CREATE INDEX IF NOT EXISTS idx_comments_post_created_at ON public.comments (post_id, created_at DESC);

-- Enable Row Level Security and simple policies
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- allow anyone to SELECT comments
DROP POLICY IF EXISTS "allow select" ON public.comments;
CREATE POLICY "allow select" ON public.comments
  FOR SELECT
  TO public
  USING (true);

-- allow authenticated users to INSERT comments
DROP POLICY IF EXISTS "allow authenticated insert" ON public.comments;
CREATE POLICY "allow authenticated insert" ON public.comments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- allow comment authors to UPDATE or DELETE their own comments
DROP POLICY IF EXISTS "allow author update delete" ON public.comments;
CREATE POLICY "allow author update delete" ON public.comments
  FOR ALL
  TO authenticated
  USING (author_id IS NOT NULL AND author_id = auth.uid())
  WITH CHECK (author_id IS NOT NULL AND author_id = auth.uid());

-- Notes:
-- 1) If you want stricter policies (e.g. only comment authors can DELETE/UPDATE), add policies
--    that check stored author_id or other claims.
-- 2) If your project uses text-based post IDs (not UUID), adjust post_id type accordingly.
-- 3) To use gen_random_uuid(), ensure the pgcrypto extension is enabled in your database.
--    Alternatively use uuid_generate_v4() with the uuid-ossp extension.
