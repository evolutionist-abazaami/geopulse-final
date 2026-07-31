-- Fix the security definer view by recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.public_demo_recordings;

-- Recreate view with explicit SECURITY INVOKER (safer)
CREATE VIEW public.public_demo_recordings 
WITH (security_invoker = true)
AS
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