-- migration: 007_advanced_observability.sql
-- Description: Adds advanced observability metrics and new status support.

-- Add new columns to monitoring_logs
ALTER TABLE monitoring_logs 
ADD COLUMN tls_latency_ms INTEGER,
ADD COLUMN ttfb_latency_ms INTEGER,
ADD COLUMN recommendation TEXT,
ADD COLUMN health_score INTEGER DEFAULT 100,
ADD COLUMN confidence INTEGER DEFAULT 100,
ADD COLUMN is_browser_ok BOOLEAN DEFAULT TRUE;

-- Update the status check constraint if it exists (pgx doesn't usually create them by default unless specified in init)
-- Based on previous migrations, it's just a VARCHAR.

-- Add index for performance on dashboard queries
CREATE INDEX IF NOT EXISTS idx_monitoring_logs_composite ON monitoring_logs (website_id, checked_at DESC);
