-- =========================================================
-- Telegram Online Tracker — Database Schema
-- Run this in the Supabase SQL Editor
-- =========================================================

-- Status events table
CREATE TABLE IF NOT EXISTS status_events (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    display_name    TEXT,
    status          TEXT NOT NULL CHECK (status IN ('Online', 'Offline')),
    was_last_seen   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Index for fast queries by user + time (DESC for recent-first)
CREATE INDEX IF NOT EXISTS idx_status_events_user_created
    ON status_events (user_id, created_at DESC);

-- Index for dashboard date-range filtering
CREATE INDEX IF NOT EXISTS idx_status_events_created
    ON status_events (created_at DESC);

-- Enable Supabase Realtime for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE status_events;

-- Row Level Security
ALTER TABLE status_events ENABLE ROW LEVEL SECURITY;

-- Allow anonymous reads (for the dashboard)
CREATE POLICY "Allow anonymous read" ON status_events
    FOR SELECT USING (true);

-- Allow inserts (tracker uses the service key)
CREATE POLICY "Allow service insert" ON status_events
    FOR INSERT WITH CHECK (true);
