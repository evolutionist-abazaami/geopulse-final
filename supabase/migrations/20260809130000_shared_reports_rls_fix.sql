-- The previous "fix" (20260125170714) claimed to scope shared_reports SELECT
-- to a specific share_id but left the USING clause identical to the fully
-- public policy it replaced (is_active = true AND not expired). RLS USING
-- clauses can't see the caller's WHERE filter, so that policy still allowed
-- `select * from shared_reports` to return every active report to anyone
-- holding the public anon key.
--
-- Fix: remove public SELECT on the base table entirely (owners can still see
-- their own rows), and expose public single-report lookup only through a
-- SECURITY DEFINER function - the same pattern already used here for
-- increment_shared_report_view.

DROP POLICY IF EXISTS "Public can view specific shared report by share_id" ON public.shared_reports;
DROP POLICY IF EXISTS "Anyone can view active shared reports" ON public.shared_reports;

CREATE POLICY "Owners can view their own shared reports"
ON public.shared_reports
FOR SELECT
USING (auth.uid() = created_by);

CREATE OR REPLACE FUNCTION public.get_shared_report(p_share_id text)
RETURNS SETOF public.shared_reports
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
  FROM public.shared_reports
  WHERE share_id = p_share_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon, authenticated;
