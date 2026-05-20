-- migration: 011_expanded_statuses.sql
-- Description: Relaxes the 3-status constraint to allow new diagnostic statuses.

ALTER TABLE monitoring_logs DROP CONSTRAINT IF EXISTS monitoring_logs_status_check;
ALTER TABLE monitoring_logs ADD CONSTRAINT monitoring_logs_status_check
  CHECK (status IN ('ONLINE', 'DEGRADED', 'CRITICAL', 'MONITORING_ISSUE', 'SUSPECTED_OUTAGE', 'UNKNOWN', 'OFFLINE'));
