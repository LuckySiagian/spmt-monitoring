-- ============================================================
-- Migration 003: Incident Root Causes & Status Events Index
-- ============================================================

-- Tabel penyebab insiden (root cause per kejadian)
CREATE TABLE IF NOT EXISTS incident_root_causes (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    website_id   UUID         NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    status       VARCHAR(20)  NOT NULL,
    cause        VARCHAR(200) NOT NULL,
    detail       TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_root_causes_website_id ON incident_root_causes(website_id);
CREATE INDEX IF NOT EXISTS idx_incident_root_causes_created_at ON incident_root_causes(created_at DESC);

-- Index tambahan untuk query status_events per website
CREATE INDEX IF NOT EXISTS idx_status_events_website_created
    ON status_events(website_id, created_at DESC);

-- Update constraint interval: allow down to 3 seconds
-- (validation dilakukan di application level)
