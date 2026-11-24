-- Public recordings are shared through signed URLs, not enumerable table or
-- storage listings. Keep direct reads limited to each recording's owner.
DROP POLICY IF EXISTS "Anyone can view public recordings"
  ON public.demo_recordings;

DROP POLICY IF EXISTS "Demo recordings SELECT access"
  ON storage.objects;

CREATE POLICY "Demo recordings owner SELECT access"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'demo-recordings'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

UPDATE storage.buckets
SET public = false
WHERE id = 'demo-recordings';
