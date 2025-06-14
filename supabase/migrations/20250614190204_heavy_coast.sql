/*
  # Initial Schema for LieBlocker Backend

  1. New Tables
    - `videos`
      - `id` (uuid, primary key)
      - `video_id` (text, unique) - YouTube video ID
      - `title` (text) - Video title
      - `channel_name` (text) - Channel name
      - `duration` (integer) - Video duration in seconds
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `video_analysis`
      - `id` (uuid, primary key)
      - `video_id` (uuid, foreign key to videos)
      - `analysis_version` (text) - Version of analysis algorithm
      - `total_lies_detected` (integer) - Total number of lies found
      - `analysis_duration_minutes` (integer) - How many minutes were analyzed
      - `confidence_threshold` (decimal) - Minimum confidence used
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `detected_lies`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key to video_analysis)
      - `timestamp_seconds` (integer) - When the lie occurs in the video
      - `duration_seconds` (integer) - How long the lie lasts
      - `claim_text` (text) - The false claim
      - `explanation` (text) - Why it's false
      - `confidence` (decimal) - AI confidence score (0.0-1.0)
      - `severity` (text) - low, medium, high
      - `category` (text) - health, science, political, etc.
      - `created_at` (timestamp)

    - `user_contributions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `analysis_id` (uuid, foreign key to video_analysis)
      - `contribution_type` (text) - 'analysis', 'verification', 'report'
      - `api_cost_cents` (integer) - Cost in cents for API usage
      - `created_at` (timestamp)

    - `lie_verifications`
      - `id` (uuid, primary key)
      - `lie_id` (uuid, foreign key to detected_lies)
      - `user_id` (uuid, foreign key to auth.users)
      - `verification_type` (text) - 'confirmed', 'disputed', 'false_positive'
      - `notes` (text) - Optional verification notes
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to read data
    - Add policies for users to contribute analysis
    - Add policies for users to verify lies

  3. Indexes
    - Index on video_id for fast lookups
    - Index on timestamp_seconds for efficient range queries
    - Index on confidence and severity for filtering
*/

-- Create videos table
CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text UNIQUE NOT NULL,
  title text,
  channel_name text,
  duration integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create video_analysis table
CREATE TABLE IF NOT EXISTS video_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  analysis_version text DEFAULT '2.1',
  total_lies_detected integer DEFAULT 0,
  analysis_duration_minutes integer DEFAULT 20,
  confidence_threshold decimal DEFAULT 0.85,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create detected_lies table
CREATE TABLE IF NOT EXISTS detected_lies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES video_analysis(id) ON DELETE CASCADE,
  timestamp_seconds integer NOT NULL,
  duration_seconds integer DEFAULT 10,
  claim_text text NOT NULL,
  explanation text NOT NULL,
  confidence decimal NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  category text DEFAULT 'other',
  created_at timestamptz DEFAULT now()
);

-- Create user_contributions table
CREATE TABLE IF NOT EXISTS user_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id uuid REFERENCES video_analysis(id) ON DELETE CASCADE,
  contribution_type text DEFAULT 'analysis' CHECK (contribution_type IN ('analysis', 'verification', 'report')),
  api_cost_cents integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create lie_verifications table
CREATE TABLE IF NOT EXISTS lie_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lie_id uuid REFERENCES detected_lies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  verification_type text NOT NULL CHECK (verification_type IN ('confirmed', 'disputed', 'false_positive')),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(lie_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE detected_lies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lie_verifications ENABLE ROW LEVEL SECURITY;

-- Create policies for videos (public read)
CREATE POLICY "Videos are publicly readable"
  ON videos
  FOR SELECT
  TO authenticated, anon
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

-- Create policies for video_analysis (public read)
CREATE POLICY "Video analysis is publicly readable"
  ON video_analysis
  FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can insert analysis"
  ON video_analysis
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policies for detected_lies (public read)
CREATE POLICY "Detected lies are publicly readable"
  ON detected_lies
  FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can insert lies"
  ON detected_lies
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policies for user_contributions (users can read their own)
CREATE POLICY "Users can read their own contributions"
  ON user_contributions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contributions"
  ON user_contributions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create policies for lie_verifications (public read, authenticated write)
CREATE POLICY "Lie verifications are publicly readable"
  ON lie_verifications
  FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can insert verifications"
  ON lie_verifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own verifications"
  ON lie_verifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_videos_video_id ON videos(video_id);
CREATE INDEX IF NOT EXISTS idx_video_analysis_video_id ON video_analysis(video_id);
CREATE INDEX IF NOT EXISTS idx_detected_lies_analysis_id ON detected_lies(analysis_id);
CREATE INDEX IF NOT EXISTS idx_detected_lies_timestamp ON detected_lies(timestamp_seconds);
CREATE INDEX IF NOT EXISTS idx_detected_lies_confidence ON detected_lies(confidence);
CREATE INDEX IF NOT EXISTS idx_detected_lies_severity ON detected_lies(severity);
CREATE INDEX IF NOT EXISTS idx_user_contributions_user_id ON user_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_contributions_analysis_id ON user_contributions(analysis_id);
CREATE INDEX IF NOT EXISTS idx_lie_verifications_lie_id ON lie_verifications(lie_id);
CREATE INDEX IF NOT EXISTS idx_lie_verifications_user_id ON lie_verifications(user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_analysis_updated_at
  BEFORE UPDATE ON video_analysis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();