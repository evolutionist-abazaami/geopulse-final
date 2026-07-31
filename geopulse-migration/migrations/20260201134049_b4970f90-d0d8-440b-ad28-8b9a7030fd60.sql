-- Fix overlapping storage policies for demo-recordings bucket
-- Drop all existing demo-recordings storage policies first
DROP POLICY IF EXISTS "Users can upload their own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own recordings storage" ON storage.objects;
DROP POLICY IF EXISTS "Public recordings are viewable" ON storage.objects;
DROP POLICY IF EXISTS "Recordings access policy" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own recordings storage" ON storage.objects;
DROP POLICY IF EXISTS "Demo recordings SELECT access" ON storage.objects;
DROP POLICY IF EXISTS "Demo recordings INSERT access" ON storage.objects;
DROP POLICY IF EXISTS "Demo recordings DELETE access" ON storage.objects;

-- Create consolidated, secure storage policies

-- SELECT: Owners can view their files, public files accessible via metadata validation
CREATE POLICY "Demo recordings SELECT access"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'demo-recordings' 
  AND (
    -- Owner access (authenticated users can view their own files)
    auth.uid()::text = (storage.foldername(name))[1]
    -- OR public access (validated against database metadata)
    OR EXISTS (
      SELECT 1 FROM public.demo_recordings
      WHERE file_path = name 
        AND is_public = true 
        AND share_id IS NOT NULL
    )
  )
);

-- INSERT: Authenticated users can upload to their own folder only
CREATE POLICY "Demo recordings INSERT access"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'demo-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- DELETE: Users can delete their own files only
CREATE POLICY "Demo recordings DELETE access"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'demo-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Ensure bucket is private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'demo-recordings';

-- Create a view to mask file paths for public access
-- This prevents exposure of internal storage structure
CREATE OR REPLACE VIEW public.public_demo_recordings AS
SELECT 
  id,
  title,
  description,
  duration_seconds,
  share_id,
  created_at,
  -- Generate a public URL instead of exposing raw file_path
  CASE 
    WHEN is_public = true AND share_id IS NOT NULL 
    THEN share_id
    ELSE NULL 
  END as public_access_id
FROM public.demo_recordings
WHERE is_public = true AND share_id IS NOT NULL;

-- Add RLS to the view (views inherit from base table but we add explicit)
-- Note: Views with SECURITY INVOKER use the policies of underlying tables