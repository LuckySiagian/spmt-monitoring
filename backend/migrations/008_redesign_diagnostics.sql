-- migration: 008_redesign_diagnostics.sql
-- Description: Updates status constraints and root cause field size for redesigned diagnostics.

-- 1. Increase root_cause field size to TEXT for richer human narratives
ALTER TABLE monitoring_logs ALTER COLUMN root_cause TYPE TEXT;
ALTER TABLE incident_root_causes ALTER COLUMN cause TYPE TEXT;

-- 2. Update status CHECK constraint to include WARNING and DEGRADED
ALTER TABLE monitoring_logs DROP CONSTRAINT IF EXISTS monitoring_logs_status_check;
ALTER TABLE monitoring_logs ADD CONSTRAINT monitoring_logs_status_check
  CHECK (status IN (
    'ONLINE', 'WARNING', 'DEGRADED', 'CRITICAL', 'OFFLINE', 'UNKNOWN',
    -- Legacy statuses
    'SERVER_DOWN', 'WEB_DOWN', 'DNS_ERROR', 'SSL_INVALID', 'SLOW'
  ));
