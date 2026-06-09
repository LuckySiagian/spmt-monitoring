-- ============================================================
-- SPMT Website Monitoring - Daily Aggregates & Partition Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_aggregates (
    website_id           UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    day                  DATE NOT NULL,
    total_checks         INT NOT NULL DEFAULT 0,
    online_checks        INT NOT NULL DEFAULT 0,
    avg_response_time_ms INT NOT NULL DEFAULT 0,
    PRIMARY KEY (website_id, day)
);

CREATE INDEX IF NOT EXISTS idx_daily_aggregates_day ON daily_aggregates(day DESC);
