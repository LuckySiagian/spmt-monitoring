-- migration: 009_severity_resolution_v2.sql
-- Description: Adds debug metadata fields for audit diagnosis.

ALTER TABLE monitoring_logs ADD COLUMN IF NOT EXISTS final_severity_reason TEXT;
ALTER TABLE monitoring_logs ADD COLUMN IF NOT EXISTS resolver_stage TEXT;

-- Update existing logs to have a default value
UPDATE monitoring_logs SET final_severity_reason = 'Legacy Log', resolver_stage = 'Initial' WHERE final_severity_reason IS NULL;
