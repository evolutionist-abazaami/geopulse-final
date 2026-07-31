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