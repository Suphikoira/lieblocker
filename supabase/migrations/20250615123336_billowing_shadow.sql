/*
  # Create video analysis table

  1. New Tables
    - `video_analysis`
      - `id` (uuid, primary key)
      - `video_id` (uuid, foreign key to videos)
      - `analysis_version` (text) - Version of analysis algorithm
      - `total_lies_detected` (integer) - Total number of lies found
      - `analysis_duration_minutes` (integer) - How many minutes were analyzed
      - `confidence_threshold` (numeric) - Minimum confidence threshold used
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `video_analysis` table
    - Add policies for public read and authenticated insert
*/

CREATE TABLE IF NOT EXISTS video_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  analysis_version text DEFAULT '2.1',
  total_lies_detected integer DEFAULT 0,
  analysis_duration_minutes integer DEFAULT 20,
  confidence_threshold numeric DEFAULT 0.85,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE video_analysis ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Video analysis is publicly readable"
  ON video_analysis
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert analysis"
  ON video_analysis
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can manage video analysis"
  ON video_analysis
  FOR ALL
  TO service_role
  USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_video_analysis_video_id ON video_analysis(video_id);

-- Update trigger
CREATE TRIGGER update_video_analysis_updated_at
  BEFORE UPDATE ON video_analysis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();