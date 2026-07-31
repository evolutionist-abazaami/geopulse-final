-- GeoPulse storage configuration
-- Bucket: demo-recordings (PRIVATE, 100 MB limit)
-- Run AFTER 01_schema_and_rls.sql on your own Supabase / self-hosted Postgres.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'demo-recordings',
  'demo-recordings',
  false,
  104857600, -- 100 MB
  ARRAY['video/webm', 'video/mp4', 'video/x-matroska']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Clean slate for policies (idempotent)
DROP POLICY IF EXISTS "Demo recordings SELECT access" ON storage.objects;
DROP POLICY IF EXISTS "Demo recordings INSERT access" ON storage.objects;
DROP POLICY IF EXISTS "Demo recordings UPDATE access" ON storage.objects;
DROP POLICY IF EXISTS "Demo recordings DELETE access" ON storage.objects;

-- Owner-scoped read; files are stored under <user_id>/<filename>
CREATE POLICY "Demo recordings SELECT access"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'demo-recordings'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Demo recordings INSERT access"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'demo-recordings'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Demo recordings UPDATE access"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'demo-recordings'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Demo recordings DELETE access"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'demo-recordings'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- NOTE: public sharing of a recording is done by generating a signed URL
-- server-side (24h) for rows where demo_recordings.is_public = true.
-- The bucket itself must stay private.
