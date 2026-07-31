-- GeoPulse consolidated schema (apply in order, or use supabase/migrations via CLI)

-- ================= migrations/20251111220459_386659ee-e55b-490e-97bc-743bfb73ddf3.sql =================
-- Create analysis_results table for storing satellite analysis
CREATE TABLE public.analysis_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  region TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  area_analyzed TEXT,
  change_percent DECIMAL,
  summary TEXT,
  ai_analysis JSONB,
  coordinates JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create search_queries table for GeoSearch
CREATE TABLE public.search_queries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  query TEXT NOT NULL,
  ai_interpretation TEXT,
  results JSONB,
  confidence_level INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

-- Create policies for analysis_results
CREATE POLICY "Users can view their own analysis results"
ON public.analysis_results
FOR SELECT
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can create analysis results"
ON public.analysis_results
FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Create policies for search_queries
CREATE POLICY "Users can view their own search queries"
ON public.search_queries
FOR SELECT
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can create search queries"
ON public.search_queries
FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Create index for faster queries
CREATE INDEX idx_analysis_results_user_id ON public.analysis_results(user_id);
CREATE INDEX idx_analysis_results_event_type ON public.analysis_results(event_type);
CREATE INDEX idx_search_queries_user_id ON public.search_queries(user_id);
-- ================= migrations/20251209002521_d1d45e09-6824-470a-8aa3-ed1c6e656c78.sql =================
-- Drop existing permissive RLS policies
DROP POLICY IF EXISTS "Users can view their own analysis results" ON public.analysis_results;
DROP POLICY IF EXISTS "Users can create analysis results" ON public.analysis_results;
DROP POLICY IF EXISTS "Users can view their own search queries" ON public.search_queries;
DROP POLICY IF EXISTS "Users can create search queries" ON public.search_queries;

-- Create new strict RLS policies for analysis_results
CREATE POLICY "Users can view their own analysis results" 
ON public.analysis_results 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create analysis results" 
ON public.analysis_results 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Create new strict RLS policies for search_queries
CREATE POLICY "Users can view their own search queries" 
ON public.search_queries 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create search queries" 
ON public.search_queries 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);
-- ================= migrations/20251209003052_104388c9-b531-4a09-97aa-16323a9758e2.sql =================
-- Clean up any existing NULL user_id records before adding constraint
DELETE FROM public.analysis_results WHERE user_id IS NULL;
DELETE FROM public.search_queries WHERE user_id IS NULL;

-- Make user_id columns NOT NULL to prevent anonymous data storage
ALTER TABLE public.analysis_results 
ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.search_queries 
ALTER COLUMN user_id SET NOT NULL;
-- ================= migrations/20251209113936_44228b42-6467-46a2-bcb9-5ebe2e6cabf7.sql =================
-- Create the update_updated_at_column function first
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create saved locations table for watchlist feature
CREATE TABLE public.saved_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  event_types TEXT[] DEFAULT ARRAY['deforestation'],
  monitoring_enabled BOOLEAN DEFAULT false,
  last_checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own saved locations" 
ON public.saved_locations 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own saved locations" 
ON public.saved_locations 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved locations" 
ON public.saved_locations 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved locations" 
ON public.saved_locations 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create comparison results table
CREATE TABLE public.comparison_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  location_name TEXT NOT NULL,
  coordinates JSON,
  period1_start DATE NOT NULL,
  period1_end DATE NOT NULL,
  period2_start DATE NOT NULL,
  period2_end DATE NOT NULL,
  event_type TEXT NOT NULL,
  period1_change NUMERIC,
  period2_change NUMERIC,
  comparison_summary TEXT,
  ai_analysis JSON,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.comparison_results ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own comparisons" 
ON public.comparison_results 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own comparisons" 
ON public.comparison_results 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comparisons" 
ON public.comparison_results 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create chat messages table for AI assistant
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own messages" 
ON public.chat_messages 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own messages" 
ON public.chat_messages 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages" 
ON public.chat_messages 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX idx_saved_locations_user_id ON public.saved_locations(user_id);
CREATE INDEX idx_comparison_results_user_id ON public.comparison_results(user_id);
CREATE INDEX idx_chat_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX idx_chat_messages_conversation_id ON public.chat_messages(conversation_id);

-- Trigger for updating saved_locations updated_at
CREATE TRIGGER update_saved_locations_updated_at
BEFORE UPDATE ON public.saved_locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ================= migrations/20260124225527_305f35ea-6dcb-4caa-8be3-36131f45322a.sql =================
-- Create a table for shared reports (publicly accessible via unique link)
CREATE TABLE IF NOT EXISTS public.shared_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id TEXT NOT NULL UNIQUE DEFAULT md5(random()::text || clock_timestamp()::text),
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
-- ================= migrations/20260125170714_2f04f76d-bd7f-4b0b-b73d-277f8927688a.sql =================
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
-- ================= migrations/20260129115749_2fe4947d-b48a-4fdf-a794-805c42f75877.sql =================
-- Create storage bucket for demo recordings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('demo-recordings', 'demo-recordings', true, 104857600, ARRAY['video/webm', 'video/mp4']);

-- Create table to track demo recordings metadata
CREATE TABLE public.demo_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_public BOOLEAN NOT NULL DEFAULT false,
  share_id TEXT UNIQUE DEFAULT NULL
);

-- Enable RLS
ALTER TABLE public.demo_recordings ENABLE ROW LEVEL SECURITY;

-- Users can view their own recordings
CREATE POLICY "Users can view their own recordings"
ON public.demo_recordings
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own recordings
CREATE POLICY "Users can create their own recordings"
ON public.demo_recordings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own recordings
CREATE POLICY "Users can update their own recordings"
ON public.demo_recordings
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own recordings
CREATE POLICY "Users can delete their own recordings"
ON public.demo_recordings
FOR DELETE
USING (auth.uid() = user_id);

-- Anyone can view public recordings via share_id
CREATE POLICY "Anyone can view public recordings"
ON public.demo_recordings
FOR SELECT
USING (is_public = true AND share_id IS NOT NULL);

-- Storage policies for demo recordings bucket
CREATE POLICY "Users can upload their own recordings"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'demo-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own recordings storage"
ON storage.objects
FOR SELECT
USING (bucket_id = 'demo-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public recordings are viewable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'demo-recordings');

CREATE POLICY "Users can delete their own recordings storage"
ON storage.objects
FOR DELETE
USING (bucket_id = 'demo-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
-- ================= migrations/20260131185503_857d0f52-c68c-450c-a61c-776780e69c06.sql =================
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
-- ================= migrations/20260201134049_b4970f90-d0d8-440b-ad28-8b9a7030fd60.sql =================
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
-- ================= migrations/20260201134122_70d71941-4b2c-4b62-885b-ed25abae11e1.sql =================
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
-- ================= migrations/20260218010149_2329d728-8d62-4dc2-9369-6185ffa96534.sql =================

-- Weather observations table for storing ingested weather/environmental data
CREATE TABLE public.weather_observations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  region_name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  observation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  temperature_c NUMERIC,
  rainfall_mm NUMERIC,
  soil_moisture NUMERIC,
  wind_speed_kmh NUMERIC,
  humidity_percent NUMERIC,
  ndvi_value NUMERIC,
  ndwi_value NUMERIC,
  nbr_value NUMERIC,
  data_source TEXT DEFAULT 'open-meteo',
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Monitoring thresholds per user per region
CREATE TABLE public.monitoring_thresholds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  region_name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  hazard_type TEXT NOT NULL, -- flood, drought, fire, storm, heatwave
  metric TEXT NOT NULL, -- rainfall_mm, temperature_c, ndvi_value, etc.
  operator TEXT NOT NULL DEFAULT '>', -- >, <, >=, <=
  threshold_value NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Hazard alerts generated when thresholds are exceeded
CREATE TABLE public.hazard_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  threshold_id UUID REFERENCES public.monitoring_thresholds(id) ON DELETE SET NULL,
  region_name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  hazard_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'moderate', -- low, moderate, high, critical
  title TEXT NOT NULL,
  description TEXT,
  metric_name TEXT,
  metric_value NUMERIC,
  threshold_value NUMERIC,
  ai_analysis JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Alert notification preferences
CREATE TABLE public.alert_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  dashboard_enabled BOOLEAN NOT NULL DEFAULT true,
  email_address TEXT,
  min_severity TEXT NOT NULL DEFAULT 'moderate', -- low, moderate, high, critical
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.weather_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazard_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_preferences ENABLE ROW LEVEL SECURITY;

-- Weather observations: public read (environmental data), no public write
CREATE POLICY "Anyone can read weather observations"
  ON public.weather_observations FOR SELECT USING (true);

CREATE POLICY "Service role can insert weather observations"
  ON public.weather_observations FOR INSERT
  WITH CHECK (true);

-- Monitoring thresholds: user-scoped CRUD
CREATE POLICY "Users can view their own thresholds"
  ON public.monitoring_thresholds FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own thresholds"
  ON public.monitoring_thresholds FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own thresholds"
  ON public.monitoring_thresholds FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own thresholds"
  ON public.monitoring_thresholds FOR DELETE USING (auth.uid() = user_id);

-- Hazard alerts: user-scoped
CREATE POLICY "Users can view their own alerts"
  ON public.hazard_alerts FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create alerts"
  ON public.hazard_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
  ON public.hazard_alerts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alerts"
  ON public.hazard_alerts FOR DELETE USING (auth.uid() = user_id);

-- Allow service-role alert creation (for edge functions)
CREATE POLICY "Service can create alerts"
  ON public.hazard_alerts FOR INSERT WITH CHECK (true);

-- Alert preferences: user-scoped
CREATE POLICY "Users can view their own preferences"
  ON public.alert_preferences FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own preferences"
  ON public.alert_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.alert_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_monitoring_thresholds_updated_at
  BEFORE UPDATE ON public.monitoring_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_alert_preferences_updated_at
  BEFORE UPDATE ON public.alert_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for hazard alerts (live dashboard updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.hazard_alerts;

-- ================= migrations/20260218010221_47181429-503a-4020-8fc6-5ce444d47297.sql =================

-- Fix: Drop overly permissive INSERT on weather_observations and replace with service-role only
DROP POLICY "Service role can insert weather observations" ON public.weather_observations;

-- Only allow inserts when called from service role (edge functions use service role key)
CREATE POLICY "Service role inserts weather observations"
  ON public.weather_observations FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Fix: Drop overly permissive service INSERT on hazard_alerts
DROP POLICY "Service can create alerts" ON public.hazard_alerts;

-- Replace with service-role restricted policy
CREATE POLICY "Service role creates alerts"
  ON public.hazard_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');
