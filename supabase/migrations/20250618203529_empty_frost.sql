/*
  # Fix severity constraint to match application usage

  1. Changes
    - Update detected_lies_severity_check constraint to include 'critical' severity
    - This aligns the database constraint with the application's severity levels

  2. Security
    - Maintains data integrity while allowing proper severity classification
*/

-- Drop the existing constraint
ALTER TABLE detected_lies DROP CONSTRAINT IF EXISTS detected_lies_severity_check;

-- Add the updated constraint with 'critical' included
ALTER TABLE detected_lies ADD CONSTRAINT detected_lies_severity_check 
  CHECK (severity IN ('low', 'medium', 'high', 'critical'));