-- Tracked Targets — managed from the dashboard
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS tracked_targets (
  id BIGSERIAL PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  display_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with current targets
INSERT INTO tracked_targets (phone_number, display_name) VALUES
  ('+201015686607', 'Target 1'),
  ('+201099880388', 'Target 2')
ON CONFLICT (phone_number) DO NOTHING;

-- Allow read/write via anon key (dashboard uses anon key)
ALTER TABLE tracked_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access" ON tracked_targets
  FOR ALL USING (true) WITH CHECK (true);
