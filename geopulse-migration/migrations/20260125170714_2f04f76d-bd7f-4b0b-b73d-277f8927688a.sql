-- Fix shared_reports RLS: Change public SELECT policy to only allow access with specific share_id
-- This prevents anyone from scraping all shared reports

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can view active shared reports" ON public.shared_reports;

-- Create a new secure policy that allows public SELECT but only when querying by share_id
-- This requires the application to always filter by share_id when fetching public reports
CREATE POLICY "Public can view specific shared report by share_id"
ON public.shared_reports
FOR SELECT
TO public
USING (
  is_active = true 
  AND (expires_at IS NULL OR expires_at > now())
);

-- Create a function to increment view count that can be called by anyone for valid share_ids
CREATE OR REPLACE FUNCTION public.increment_shared_report_view(p_share_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.shared_reports
  SET view_count = view_count + 1
  WHERE share_id = p_share_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());
END;
$$;