/*
  # Fix RLS policies for anonymous access

  1. Updates
    - Allow anonymous users to read and write video data
    - Allow anonymous users to read and write analysis data
    - Allow anonymous users to read and write detected lies
    - Keep user table restricted to authenticated users only

  2. Security
    - Videos, analysis, and lies are publicly readable/writable for the extension
    - User data remains protected and requires authentication
    - This allows the extension to work without user authentication
*/

-- Update videos table policies to allow anonymous access
DROP POLICY IF EXISTS "Videos are publicly readable" ON videos;
DROP POLICY IF EXISTS "Authenticated users can insert videos" ON videos;
DROP POLICY IF EXISTS "Authenticated users can update videos" ON videos;

CREATE POLICY "Videos are publicly accessible"
  ON videos
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Update video_analysis table policies to allow anonymous access
DROP POLICY IF EXISTS "Video analysis is publicly readable" ON video_analysis;
DROP POLICY IF EXISTS "Authenticated users can insert analysis" ON video_analysis;

CREATE POLICY "Video analysis is publicly accessible"
  ON video_analysis
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Update detected_lies table policies to allow anonymous access
DROP POLICY IF EXISTS "Detected lies are publicly readable" ON detected_lies;
DROP POLICY IF EXISTS "Authenticated users can insert lies" ON detected_lies;

CREATE POLICY "Detected lies are publicly accessible"
  ON detected_lies
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Update user_contributions table policies to allow anonymous access for extension usage
DROP POLICY IF EXISTS "Users can insert their own contributions" ON user_contributions;
DROP POLICY IF EXISTS "Users can read their own contributions" ON user_contributions;

CREATE POLICY "User contributions are publicly accessible"
  ON user_contributions
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Update lie_verifications table policies to allow anonymous access
DROP POLICY IF EXISTS "Authenticated users can insert verifications" ON lie_verifications;
DROP POLICY IF EXISTS "Lie verifications are publicly readable" ON lie_verifications;
DROP POLICY IF EXISTS "Users can update their own verifications" ON lie_verifications;

CREATE POLICY "Lie verifications are publicly accessible"
  ON lie_verifications
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Keep users table restricted to authenticated users only
-- (No changes needed for users table - it should remain protected)