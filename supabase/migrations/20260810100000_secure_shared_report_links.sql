ALTER TABLE public.shared_reports
  ALTER COLUMN share_id SET DEFAULT (gen_random_uuid()::text);

DROP POLICY IF EXISTS "Anyone can view active shared reports"
  ON public.shared_reports;
DROP POLICY IF EXISTS "Public can view specific shared report by share_id"
  ON public.shared_reports;

CREATE POLICY "Owners can view their own shared reports"
ON public.shared_reports
FOR SELECT
USING (auth.uid() = created_by);

DROP FUNCTION IF EXISTS public.get_shared_report(text);

CREATE FUNCTION public.get_shared_report(p_share_id text)
RETURNS TABLE (
  id uuid,
  share_id text,
  report_type text,
  title text,
  location_name text,
  event_type text,
  report_data jsonb,
  created_at timestamptz,
  expires_at timestamptz,
  view_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    report.id,
    report.share_id,
    report.report_type,
    report.title,
    report.location_name,
    report.event_type,
    report.report_data,
    report.created_at,
    report.expires_at,
    report.view_count
  FROM public.shared_reports AS report
  WHERE report.share_id = p_share_id
    AND report.is_active = true
    AND (report.expires_at IS NULL OR report.expires_at > now())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_shared_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon, authenticated;
