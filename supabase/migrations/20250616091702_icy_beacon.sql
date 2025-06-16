/*
  # Create users table with RLS policies

  1. New Tables
    - `users`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `users` table
    - Add policies for authenticated users to manage their own data
    - Add update trigger for updated_at column

  3. Changes
    - Uses IF NOT EXISTS checks to prevent duplicate policy errors
    - Handles existing policies gracefully
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DO $$
BEGIN
  -- Drop policies if they exist
  DROP POLICY IF EXISTS "Users can read own data" ON users;
  DROP POLICY IF EXISTS "Users can insert own data" ON users;
  DROP POLICY IF EXISTS "Users can update own data" ON users;
END $$;

-- Create policies
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own data"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create update trigger if it doesn't exist
DO $$
BEGIN
  -- Drop trigger if it exists
  DROP TRIGGER IF EXISTS update_users_updated_at ON users;
  
  -- Create the trigger
  CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
END $$;