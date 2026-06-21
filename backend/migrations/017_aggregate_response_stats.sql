-- migration: 017_aggregate_response_stats.sql
-- Description: Extends daily_aggregates with response-time min/max and a count of
-- slow responses (>1000ms), so the weekly UptimeRobot-style report can show those
-- figures over the full week. Raw monitoring_logs are purged after 2 days
-- (see retention.go), so these must be rolled up daily rather than queried live.
-- These columns start collecting from the first aggregation run after deploy;
-- earlier days carry the DEFAULT 0.

ALTER TABLE daily_aggregates ADD COLUMN IF NOT EXISTS min_response_time_ms INT NOT NULL DEFAULT 0;
ALTER TABLE daily_aggregates ADD COLUMN IF NOT EXISTS max_response_time_ms INT NOT NULL DEFAULT 0;
ALTER TABLE daily_aggregates ADD COLUMN IF NOT EXISTS peaks_over_1000      INT NOT NULL DEFAULT 0;
