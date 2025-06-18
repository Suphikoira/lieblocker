/*
  # Security improvements for RLS policies

  1. Changes
    - Restrict anonymous access to read-only operations
    - Add proper authentication requirements for write operations
    - Implement rate limiting through database functions
    - Add input validation constraints

  2. Security
    - Anonymous users can only read public data
    - Write operations require proper authentication
    - Add constraints to prevent data corruption
*/

-- Update videos table policies for better security
DROP POLICY IF EXISTS "Videos are publicly accessible" ON videos;

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

-- Update video_analysis table policies
DROP POLICY IF EXISTS "Video analysis is publicly accessible" ON video_analysis;

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

-- Update detected_lies table policies
DROP POLICY IF EXISTS "Detected lies are publicly accessible" ON detected_lies;

CREATE POLICY "Detected lies are publicly readable"
  ON detected_lies
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert lies"
  ON detected_lies
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add additional constraints for data integrity
ALTER TABLE videos ADD CONSTRAINT IF NOT EXISTS 
  check_video_id_format CHECK (video_id ~ '^[a-zA-Z0-9_-]{11}$');

ALTER TABLE videos ADD CONSTRAINT IF NOT EXISTS 
  check_duration_positive CHECK (duration IS NULL OR duration > 0);

ALTER TABLE detected_lies ADD CONSTRAINT IF NOT EXISTS 
  check_timestamp_positive CHECK (timestamp_seconds >= 0);

ALTER TABLE detected_lies ADD CONSTRAINT IF NOT EXISTS 
  check_duration_positive CHECK (duration_seconds > 0);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_video_analysis_created_at ON video_analysis(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_detected_lies_severity_confidence ON detected_lies(severity, confidence);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC);

-- Create function for rate limiting (basic implementation)
CREATE OR REPLACE FUNCTION check_rate_limit(user_identifier text, action_type text, max_actions integer, time_window_minutes integer)
RETURNS boolean AS $$
DECLARE
  action_count integer;
BEGIN
  -- Count actions in the time window
  SELECT COUNT(*) INTO action_count
  FROM user_contributions
  WHERE contribution_type = action_type
    AND created_at > NOW() - INTERVAL '1 minute' * time_window_minutes;
  
  RETURN action_count < max_actions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;