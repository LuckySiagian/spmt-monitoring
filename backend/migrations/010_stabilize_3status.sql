-- migration: 010_stabilize_3status.sql
-- Description: Renames is_browser_ok to is_browser_accessible and enforces 3-status constraint.

-- 1. Rename column
ALTER TABLE monitoring_logs RENAME COLUMN is_browser_ok TO is_browser_accessible;

-- 2. Update status CHECK constraint to strictly 3 statuses
ALTER TABLE monitoring_logs DROP CONSTRAINT IF EXISTS monitoring_logs_status_check;
ALTER TABLE monitoring_logs ADD CONSTRAINT monitoring_logs_status_check
  CHECK (status IN ('ONLINE', 'CRITICAL', 'OFFLINE'));

-- 3. Cleanup any legacy WARNING/DEGRADED/UNKNOWN data (optional but recommended)
UPDATE monitoring_logs SET status = 'CRITICAL' WHERE status IN ('WARNING', 'DEGRADED');
UPDATE monitoring_logs SET status = 'OFFLINE' WHERE status = 'UNKNOWN';
