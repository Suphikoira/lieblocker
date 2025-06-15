/*
  # Create detected lies table

  1. New Tables
    - `detected_lies`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key to video_analysis)
      - `timestamp_seconds` (integer) - When the lie occurs in the video
      - `duration_seconds` (integer) - How long the lie lasts
      - `claim_text` (text) - The actual false claim
      - `explanation` (text) - Why it's false
      - `confidence` (numeric) - AI confidence score (0.0-1.0)
      - `severity` (text) - low, medium, high
      - `category` (text) - Type of misinformation
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `detected_lies` table
    - Add policies for public read and authenticated insert
*/

CREATE TABLE IF NOT EXISTS detected_lies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES video_analysis(id) ON DELETE CASCADE,
  timestamp_seconds integer NOT NULL,
  duration_seconds integer DEFAULT 10,
  claim_text text NOT NULL,
  explanation text NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  category text DEFAULT 'other',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE detected_lies ENABLE ROW LEVEL SECURITY;

-- Policies
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

CREATE POLICY "Service role can manage detected lies"
  ON detected_lies
  FOR ALL
  TO service_role
  USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_detected_lies_analysis_id ON detected_lies(analysis_id);
CREATE INDEX IF NOT EXISTS idx_detected_lies_timestamp ON detected_lies(timestamp_seconds);
CREATE INDEX IF NOT EXISTS idx_detected_lies_confidence ON detected_lies(confidence);
CREATE INDEX IF NOT EXISTS idx_detected_lies_severity ON detected_lies(severity);