/*
  # Create user contributions table

  1. New Tables
    - `user_contributions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `analysis_id` (uuid, foreign key to video_analysis)
      - `contribution_type` (text) - analysis, verification, report
      - `api_cost_cents` (integer) - Cost of API calls in cents
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `user_contributions` table
    - Users can only see their own contributions
*/

CREATE TABLE IF NOT EXISTS user_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id uuid REFERENCES video_analysis(id) ON DELETE CASCADE,
  contribution_type text DEFAULT 'analysis' CHECK (contribution_type IN ('analysis', 'verification', 'report')),
  api_cost_cents integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_contributions ENABLE ROW LEVEL SECURITY;

-- Policies
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

CREATE POLICY "Service role can manage user contributions"
  ON user_contributions
  FOR ALL
  TO service_role
  USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_contributions_user_id ON user_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_contributions_analysis_id ON user_contributions(analysis_id);