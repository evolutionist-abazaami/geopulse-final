-- Drop existing policy first
DROP POLICY IF EXISTS "Recordings access policy" ON storage.objects;

-- Ensure bucket is private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'demo-recordings';

-- Create proper RLS policy that validates against metadata table
CREATE POLICY "Recordings access policy"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'demo-recordings' 
  AND (
    -- Allow owner access (user_id is the first folder in the path)
    auth.uid()::text = (storage.foldername(name))[1]
    -- OR allow public access only if explicitly marked public in metadata
    OR EXISTS (
      SELECT 1 FROM public.demo_recordings
      WHERE file_path = name
        AND is_public = true
        AND share_id IS NOT NULL
    )
  )
);