-- ============================================================
-- SPMT Website Monitoring - Database Migration
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username      VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('superadmin', 'admin', 'viewer')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================
-- WEBSITES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS websites (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             VARCHAR(100) NOT NULL,
    url              TEXT NOT NULL,
    description      TEXT,
    interval_seconds INT NOT NULL DEFAULT 60,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_websites_created_at ON websites(created_at);

-- ============================================================
-- MONITORING LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS monitoring_logs (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    website_id       UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    checked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dns_resolved     BOOLEAN NOT NULL DEFAULT FALSE,
    status_code      INT,
    response_time_ms INT,
    ssl_valid        BOOLEAN NOT NULL DEFAULT FALSE,
    error_message    TEXT,
    status           VARCHAR(20) NOT NULL CHECK (status IN ('ONLINE', 'CRITICAL', 'OFFLINE'))
);

CREATE INDEX IF NOT EXISTS idx_logs_website_id ON monitoring_logs(website_id);
CREATE INDEX IF NOT EXISTS idx_logs_checked_at ON monitoring_logs(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_website_checked ON monitoring_logs(website_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_status ON monitoring_logs(status);

-- ============================================================
-- SEED: DEFAULT SUPERADMIN
-- username: superadmin
-- password: admin123 (bcrypt hashed)
-- ============================================================
INSERT INTO users (id, username, password_hash, role, created_at)
VALUES (
    uuid_generate_v4(),
    'superadmin',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'superadmin',
    NOW()
) ON CONFLICT (username) DO NOTHING;
