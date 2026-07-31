-- Create a table for shared reports (publicly accessible via unique link)
CREATE TABLE public.shared_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  report_type TEXT NOT NULL DEFAULT 'comparison',
  title TEXT NOT NULL,
  location_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  report_data JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  view_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Create index for fast lookups by share_id
CREATE INDEX idx_shared_reports_share_id ON public.shared_reports(share_id);

-- Enable RLS
ALTER TABLE public.shared_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active shared reports (public links)
CREATE POLICY "Anyone can view active shared reports"
ON public.shared_reports
FOR SELECT
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Policy: Authenticated users can create shared reports
CREATE POLICY "Authenticated users can create shared reports"
ON public.shared_reports
FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Policy: Users can update their own shared reports
CREATE POLICY "Users can update own shared reports"
ON public.shared_reports
FOR UPDATE
USING (auth.uid() = created_by);

-- Policy: Users can delete their own shared reports
CREATE POLICY "Users can delete own shared reports"
ON public.shared_reports
FOR DELETE
USING (auth.uid() = created_by);