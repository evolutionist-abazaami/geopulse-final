
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
