-- Clean up any existing NULL user_id records before adding constraint
DELETE FROM public.analysis_results WHERE user_id IS NULL;
DELETE FROM public.search_queries WHERE user_id IS NULL;

-- Make user_id columns NOT NULL to prevent anonymous data storage
ALTER TABLE public.analysis_results 
ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.search_queries 
ALTER COLUMN user_id SET NOT NULL;