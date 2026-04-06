-- ============================================================
-- Migration 002: Status Events & Bug Prevention
-- ============================================================

-- Bug prevention: pastikan tidak ada duplicate URL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'websites_url_unique' AND conrelid = 'websites'::regclass
  ) THEN
    ALTER TABLE websites ADD CONSTRAINT websites_url_unique UNIQUE (url);
  END IF;
END
$$;

-- Tabel pencatatan perubahan status service
CREATE TABLE IF NOT EXISTS status_events (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    website_id   UUID        NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    website_name VARCHAR(100) NOT NULL,
    old_status   VARCHAR(20),
    new_status   VARCHAR(20) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_events_website_id  ON status_events(website_id);
CREATE INDEX IF NOT EXISTS idx_status_events_created_at  ON status_events(created_at DESC);
