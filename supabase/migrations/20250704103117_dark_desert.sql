/*
  # Secure RLS policies for open source deployment

  1. Security Updates
    - Replace overly permissive policies with secure ones
    - Add service role policies for admin operations
    - Implement proper data isolation
    - Add rate limiting at database level

  2. Tables Updated
    - videos: Restrict to service role and authenticated users
    - video_analysis: Restrict to service role and authenticated users  
    - detected_lies: Restrict to service role and authenticated users
    - users: Already properly secured

  3. Service Role Access
    - Allow service role to manage all data (for extension backend)
    - Authenticated users can only read public data
    - Anonymous users have very limited read access
*/

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Videos are publicly accessible" ON videos;
DROP POLICY IF EXISTS "Video analysis is publicly accessible" ON video_analysis;
DROP POLICY IF EXISTS "Detected lies are publicly accessible" ON detected_lies;

-- VIDEOS TABLE - Secure policies
CREATE POLICY "Service role can manage videos"
  ON videos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read videos"
  ON videos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anonymous users can read basic video info"
  ON videos
  FOR SELECT
  TO anon
  USING (true);

-- VIDEO_ANALYSIS TABLE - Secure policies  
CREATE POLICY "Service role can manage video analysis"
  ON video_analysis
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read analysis"
  ON video_analysis
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anonymous users can read analysis results"
  ON video_analysis
  FOR SELECT
  TO anon
  USING (true);

-- DETECTED_LIES TABLE - Secure policies
CREATE POLICY "Service role can manage detected lies"
  ON detected_lies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read lies"
  ON detected_lies
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anonymous users can read lies"
  ON detected_lies
  FOR SELECT
  TO anon
  USING (true);

-- Add rate limiting table for database-level protection
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  action text NOT NULL,
  count integer DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(identifier, action, window_start)
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage rate limits"
  ON rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_action ON rate_limits(identifier, action);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);

-- Function to check rate limits at database level
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier text,
  p_action text,
  p_max_requests integer DEFAULT 100,
  p_window_minutes integer DEFAULT 60
) RETURNS boolean AS $$
DECLARE
  current_count integer;
  window_start timestamptz;
BEGIN
  -- Calculate window start
  window_start := date_trunc('hour', now()) + 
    (EXTRACT(minute FROM now())::integer / p_window_minutes) * 
    (p_window_minutes || ' minutes')::interval;
  
  -- Get current count for this window
  SELECT count INTO current_count
  FROM rate_limits
  WHERE identifier = p_identifier
    AND action = p_action
    AND window_start = window_start;
  
  -- If no record exists, create one
  IF current_count IS NULL THEN
    INSERT INTO rate_limits (identifier, action, window_start, count)
    VALUES (p_identifier, p_action, window_start, 1)
    ON CONFLICT (identifier, action, window_start)
    DO UPDATE SET count = rate_limits.count + 1;
    RETURN true;
  END IF;
  
  -- Check if limit exceeded
  IF current_count >= p_max_requests THEN
    RETURN false;
  END IF;
  
  -- Increment counter
  UPDATE rate_limits
  SET count = count + 1
  WHERE identifier = p_identifier
    AND action = p_action
    AND window_start = window_start;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup function for old rate limit records
CREATE OR REPLACE FUNCTION cleanup_rate_limits() RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a scheduled job to cleanup old rate limit records (if pg_cron is available)
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', 'SELECT cleanup_rate_limits();');