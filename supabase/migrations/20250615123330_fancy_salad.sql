/*
  # Create videos table

  1. New Tables
    - `videos`
      - `id` (uuid, primary key)
      - `video_id` (text, unique) - YouTube video ID
      - `title` (text) - Video title
      - `channel_name` (text) - Channel name
      - `duration` (integer) - Video duration in seconds
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `videos` table
    - Add policy for public read access
    - Add policy for authenticated users to insert/update
*/

CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text UNIQUE NOT NULL,
  title text,
  channel_name text,
  duration integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Videos are publicly readable"
  ON videos
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert videos"
  ON videos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update videos"
  ON videos
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage videos"
  ON videos
  FOR ALL
  TO service_role
  USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_videos_video_id ON videos(video_id);

-- Update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();