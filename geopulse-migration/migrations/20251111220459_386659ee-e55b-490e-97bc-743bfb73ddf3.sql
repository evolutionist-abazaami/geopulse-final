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