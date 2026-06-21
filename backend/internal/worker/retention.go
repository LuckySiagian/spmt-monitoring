package worker

import (
	"context"
	"log/slog"
	"time"
)

func (p *Pool) startRetentionWorker() {
	ctx := context.Background()

	// 1. Ensure aggregation table exists on startup
	setupSQL := `
	CREATE TABLE IF NOT EXISTS daily_aggregates (
		website_id           UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
		day                  DATE NOT NULL,
		total_checks         INT NOT NULL DEFAULT 0,
		online_checks        INT NOT NULL DEFAULT 0,
		avg_response_time_ms INT NOT NULL DEFAULT 0,
		PRIMARY KEY (website_id, day)
	);
	CREATE INDEX IF NOT EXISTS idx_daily_aggregates_day ON daily_aggregates(day DESC);
	-- Self-heal columns added in migration 017 (existing tables predate them).
	ALTER TABLE daily_aggregates ADD COLUMN IF NOT EXISTS min_response_time_ms INT NOT NULL DEFAULT 0;
	ALTER TABLE daily_aggregates ADD COLUMN IF NOT EXISTS max_response_time_ms INT NOT NULL DEFAULT 0;
	ALTER TABLE daily_aggregates ADD COLUMN IF NOT EXISTS peaks_over_1000      INT NOT NULL DEFAULT 0;
	`
	_, err := p.repo.GetDB().Exec(ctx, setupSQL)
	if err != nil {
		slog.Error("Failed to ensure daily_aggregates table exists", slog.Any("error", err))
	} else {
		slog.Info("Database retention daily_aggregates table initialized")
	}

	// 2. Perform initial aggregate calculation & cleanup
	p.runAggregationAndRetention()

	// 3. Start ticker to run every 12 hours
	ticker := time.NewTicker(12 * time.Hour)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-p.ctx.Done():
				slog.Info("Retention worker stopping")
				return
			case <-ticker.C:
				p.runAggregationAndRetention()
			}
		}
	}()
}

func (p *Pool) runAggregationAndRetention() {
	ctx := context.Background()
	slog.Info("Running database log aggregation and retention cleanup tasks")

	// Calculate and store daily aggregates for the last 8 days (re-writing overlaps to ensure correctness)
	aggSQL := `
	INSERT INTO daily_aggregates (website_id, day, total_checks, online_checks, avg_response_time_ms, min_response_time_ms, max_response_time_ms, peaks_over_1000)
	SELECT
		website_id,
		checked_at::date AS day,
		COUNT(*) AS total_checks,
		COUNT(CASE WHEN status = 'ONLINE' THEN 1 END) AS online_checks,
		COALESCE(AVG(response_time_ms), 0)::int AS avg_response_time_ms,
		COALESCE(MIN(response_time_ms) FILTER (WHERE response_time_ms > 0), 0) AS min_response_time_ms,
		COALESCE(MAX(response_time_ms), 0) AS max_response_time_ms,
		COUNT(*) FILTER (WHERE response_time_ms > 1000) AS peaks_over_1000
	FROM monitoring_logs
	WHERE checked_at >= NOW() - INTERVAL '8 days'
	GROUP BY website_id, day
	ON CONFLICT (website_id, day) DO UPDATE
	SET total_checks = EXCLUDED.total_checks,
		online_checks = EXCLUDED.online_checks,
		avg_response_time_ms = EXCLUDED.avg_response_time_ms,
		min_response_time_ms = EXCLUDED.min_response_time_ms,
		max_response_time_ms = EXCLUDED.max_response_time_ms,
		peaks_over_1000 = EXCLUDED.peaks_over_1000;
	`
	_, err := p.repo.GetDB().Exec(ctx, aggSQL)
	if err != nil {
		slog.Error("Failed to calculate daily aggregates", slog.Any("error", err))
	} else {
		slog.Info("Successfully compiled log metrics into daily aggregates table")
	}

	// Strip heavy base64 screenshots from logs older than 1 day (keeps metadata logs light)
	stripSQL := `
	UPDATE monitoring_logs 
	SET root_cause = (root_cause::jsonb - 'screenshot')::text 
	WHERE checked_at < NOW() - INTERVAL '1 day' 
	  AND root_cause LIKE '%"screenshot":%';
	`
	_, err = p.repo.GetDB().Exec(ctx, stripSQL)
	if err != nil {
		slog.Error("Failed to strip expired screenshots from logs", slog.Any("error", err))
	} else {
		slog.Info("Successfully stripped screenshots older than 1 day from logs")
	}

	// Purge raw logs older than 2 days
	purgeSQL := `
	DELETE FROM monitoring_logs
	WHERE checked_at < NOW() - INTERVAL '2 days';
	`
	tag, err := p.repo.GetDB().Exec(ctx, purgeSQL)
	if err != nil {
		slog.Error("Failed to delete expired raw monitoring logs", slog.Any("error", err))
	} else {
		slog.Info("Successfully cleaned up raw monitoring logs older than 2 days", slog.Int64("rows_deleted", tag.RowsAffected()))
	}
}
