
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
