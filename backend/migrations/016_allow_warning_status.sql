-- migration: 016_allow_warning_status.sql
-- Description: Adds 'WARNING' to the allowed monitoring_logs.status set.
-- Required by the deterministic DNS+HTTP engine: HEALTHY/WARNING/CRITICAL/OFFLINE.
-- Migration 011 expanded statuses but omitted 'WARNING', so inserting a WARNING
-- row would fail the CHECK constraint. This migration permits it.

ALTER TABLE monitoring_logs DROP CONSTRAINT IF EXISTS monitoring_logs_status_check;
ALTER TABLE monitoring_logs ADD CONSTRAINT monitoring_logs_status_check
  CHECK (status IN ('ONLINE', 'WARNING', 'DEGRADED', 'CRITICAL', 'MONITORING_ISSUE', 'SUSPECTED_OUTAGE', 'UNKNOWN', 'OFFLINE'));
