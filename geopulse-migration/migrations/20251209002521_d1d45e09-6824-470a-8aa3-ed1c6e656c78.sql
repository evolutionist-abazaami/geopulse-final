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