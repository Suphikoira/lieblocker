/*
  # Create lie verifications table

  1. New Tables
    - `lie_verifications`
      - `id` (uuid, primary key)
      - `lie_id` (uuid, foreign key to detected_lies)
      - `user_id` (uuid, foreign key to auth.users)
      - `verification_type` (text) - confirmed, disputed, false_positive
      - `notes` (text) - Optional user notes
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `lie_verifications` table
    - Users can verify lies and see all verifications
    - Unique constraint on lie_id + user_id (one verification per user per lie)
*/

CREATE TABLE IF NOT EXISTS lie_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lie_id uuid REFERENCES detected_lies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  verification_type text NOT NULL CHECK (verification_type IN ('confirmed', 'disputed', 'false_positive')),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(lie_id, user_id)
);

-- Enable RLS
ALTER TABLE lie_verifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Lie verifications are publicly readable"
  ON lie_verifications
  FOR SELECT
  TO anon, authenticated
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

CREATE POLICY "Service role can manage lie verifications"
  ON lie_verifications
  FOR ALL
  TO service_role
  USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lie_verifications_lie_id ON lie_verifications(lie_id);
CREATE INDEX IF NOT EXISTS idx_lie_verifications_user_id ON lie_verifications(user_id);