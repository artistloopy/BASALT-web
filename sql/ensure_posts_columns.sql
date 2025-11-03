-- Ensure posts table has compatible author columns and populate display name
-- Run this in Supabase SQL editor as a single script (it is idempotent)

-- add compatibility columns if missing
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS author_display text;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS author_email text;

-- ensure likes and created_at exist (some older schemas may be missing them)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS likes integer DEFAULT 0 NOT NULL;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;

-- populate author_display from author_email when possible
UPDATE public.posts
  SET author_display = split_part(author_email, '@', 1)
  WHERE author_display IS NULL AND author_email IS NOT NULL;

-- Optional: ensure index and policies (safe drops then create)
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts (created_at DESC);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow authenticated insert" ON public.posts;
CREATE POLICY "allow authenticated insert" ON public.posts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "allow select" ON public.posts;
CREATE POLICY "allow select" ON public.posts
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "allow update likes" ON public.posts;
CREATE POLICY "allow update likes" ON public.posts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
