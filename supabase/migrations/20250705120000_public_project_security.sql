/*
  # Public project security policies

  This migration updates the Row Level Security policies for a public collaborative project
  where anonymous users can contribute analysis data but cannot modify or delete existing data.

  1. Security Model
    - Anonymous users: Can INSERT new analysis data only (no UPDATE/DELETE)
    - Authenticated users: Can read all data
    - Service role: Full access for admin operations

  2. Data Protection
    - Prevents modification of existing analysis results
    - Allows community contributions while protecting data integrity
    - Implements proper access controls for a public project

  3. Tables Updated
    - videos: Anonymous can insert, all can read
    - video_analysis: Anonymous can insert, all can read  
    - detected_lies: Anonymous can insert, all can read
*/

-- Drop existing overly restrictive policies
DROP POLICY IF EXISTS "Service role can manage videos" ON videos;
DROP POLICY IF EXISTS "Authenticated users can read videos" ON videos;
DROP POLICY IF EXISTS "Anonymous users can read basic video info" ON videos;

DROP POLICY IF EXISTS "Service role can manage video analysis" ON video_analysis;
DROP POLICY IF EXISTS "Authenticated users can read analysis" ON video_analysis;
DROP POLICY IF EXISTS "Anonymous users can read analysis results" ON video_analysis;

DROP POLICY IF EXISTS "Service role can manage detected lies" ON detected_lies;
DROP POLICY IF EXISTS "Authenticated users can read lies" ON detected_lies;
DROP POLICY IF EXISTS "Anonymous users can read lies" ON detected_lies;

-- VIDEOS TABLE - Public collaborative policies
CREATE POLICY "Anyone can read videos"
  ON videos
  FOR SELECT
  USING (true);

CREATE POLICY "Anonymous can contribute videos"
  ON videos
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Service role can manage videos"
  ON videos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- VIDEO_ANALYSIS TABLE - Public collaborative policies  
CREATE POLICY "Anyone can read video analysis"
  ON video_analysis
  FOR SELECT
  USING (true);

CREATE POLICY "Anonymous can contribute analysis"
  ON video_analysis
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Service role can manage video analysis"
  ON video_analysis
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DETECTED_LIES TABLE - Public collaborative policies
CREATE POLICY "Anyone can read detected lies"
  ON detected_lies
  FOR SELECT
  USING (true);

CREATE POLICY "Anonymous can contribute lies"
  ON detected_lies
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Service role can manage detected lies"
  ON detected_lies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add data validation constraints to prevent abuse
ALTER TABLE videos 
  ADD CONSTRAINT videos_video_id_length CHECK (char_length(video_id) <= 100),
  ADD CONSTRAINT videos_title_length CHECK (char_length(title) <= 500),
  ADD CONSTRAINT videos_channel_length CHECK (char_length(channel_name) <= 200);

ALTER TABLE video_analysis
  ADD CONSTRAINT analysis_version_length CHECK (char_length(analysis_version) <= 10),
  ADD CONSTRAINT lies_count_reasonable CHECK (total_lies_detected >= 0 AND total_lies_detected <= 1000),
  ADD CONSTRAINT duration_reasonable CHECK (analysis_duration_minutes >= 0 AND analysis_duration_minutes <= 480),
  ADD CONSTRAINT confidence_valid CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1);

ALTER TABLE detected_lies
  ADD CONSTRAINT claim_text_length CHECK (char_length(claim_text) <= 1000),
  ADD CONSTRAINT explanation_length CHECK (char_length(explanation) <= 2000),
  ADD CONSTRAINT timestamp_positive CHECK (timestamp_seconds >= 0),
  ADD CONSTRAINT duration_reasonable CHECK (duration_seconds >= 1 AND duration_seconds <= 300),
  ADD CONSTRAINT confidence_valid CHECK (confidence >= 0 AND confidence <= 1),
  ADD CONSTRAINT severity_valid CHECK (severity IN ('low', 'medium', 'high')),
  ADD CONSTRAINT category_length CHECK (char_length(category) <= 50);

-- Create indexes for better performance with public access
CREATE INDEX IF NOT EXISTS idx_videos_video_id ON videos(video_id);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at);
CREATE INDEX IF NOT EXISTS idx_video_analysis_video_id ON video_analysis(video_id);
CREATE INDEX IF NOT EXISTS idx_video_analysis_created_at ON video_analysis(created_at);
CREATE INDEX IF NOT EXISTS idx_detected_lies_analysis_id ON detected_lies(analysis_id);
CREATE INDEX IF NOT EXISTS idx_detected_lies_timestamp ON detected_lies(timestamp_seconds);

-- Add a function to clean up potential spam/duplicate entries (for admin use)
CREATE OR REPLACE FUNCTION cleanup_duplicate_videos() RETURNS void AS $$
BEGIN
  -- Remove duplicate videos keeping the oldest one
  DELETE FROM videos 
  WHERE id NOT IN (
    SELECT DISTINCT ON (video_id) id 
    FROM videos 
    ORDER BY video_id, created_at ASC
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role only
REVOKE ALL ON FUNCTION cleanup_duplicate_videos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_duplicate_videos() TO service_role;
