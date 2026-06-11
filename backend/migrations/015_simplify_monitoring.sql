-- Migration 015: Simplify monitoring to 4 core parameters
-- Focus: DNS, ICMP, HTTP Status Code, Last Checked Time

-- Add new simplified columns to monitoring_logs
ALTER TABLE monitoring_logs 
ADD COLUMN IF NOT EXISTS http_status_code_v2 INTEGER,
ADD COLUMN IF NOT EXISTS http_error_message VARCHAR(1000);

-- Backup existing data (optional)
-- CREATE TABLE monitoring_logs_backup AS SELECT * FROM monitoring_logs;

-- We'll keep old columns for backward compatibility but only use new ones
COMMENT ON COLUMN monitoring_logs.http_status_code_v2 IS 'HTTP status code (200, 404, 500, etc) - new simplified version';
COMMENT ON COLUMN monitoring_logs.http_error_message IS 'HTTP error message if request failed';

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_monitoring_logs_website_checked_v2 
ON monitoring_logs(website_id, checked_at DESC) 
WHERE checked_at IS NOT NULL;

-- View untuk simplified monitoring data
CREATE OR REPLACE VIEW monitoring_logs_simplified AS
SELECT
  id,
  website_id,
  checked_at,
  dns_resolved,
  icmp_status,
  COALESCE(http_status_code_v2, status_code) as http_status_code,
  http_error_message,
  -- Computed: is_online
  (dns_resolved AND icmp_status AND (COALESCE(http_status_code_v2, status_code) BETWEEN 200 AND 299)) as is_online
FROM monitoring_logs
ORDER BY website_id, checked_at DESC;
