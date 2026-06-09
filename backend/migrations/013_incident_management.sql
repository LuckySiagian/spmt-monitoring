-- ============================================================
-- SPMT Website Monitoring - Incident Management Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS incidents (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    website_id        UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    title             VARCHAR(255) NOT NULL,
    status            VARCHAR(50) NOT NULL CHECK (status IN ('TRIGGERED', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'CLOSED')),
    severity          VARCHAR(20) NOT NULL DEFAULT 'WARNING',
    assigned_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at       TIMESTAMPTZ,
    closed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_website_id ON incidents(website_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC);

-- ============================================================
-- MAINTENANCE WINDOWS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_windows (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    website_id  UUID REFERENCES websites(id) ON DELETE CASCADE,
    start_time  TIMESTAMPTZ NOT NULL,
    end_time    TIMESTAMPTZ NOT NULL,
    description TEXT,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_windows_range ON maintenance_windows(start_time, end_time);

-- ============================================================
-- INCIDENT COMMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS incident_comments (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username     VARCHAR(50) NOT NULL,
    comment      TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_comments_incident_id ON incident_comments(incident_id);

-- ============================================================
-- INCIDENT HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS incident_history (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    username     VARCHAR(50) NOT NULL,
    action       VARCHAR(50) NOT NULL,
    details      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_history_incident_id ON incident_history(incident_id);
