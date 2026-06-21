-- ============================================================
-- 018 — User registration approval workflow
-- ============================================================
-- New self-registered users start as 'pending' and cannot log in
-- until a superadmin / adminpelindo approves them. Existing users
-- (and users created directly by an admin) are 'active'.
--   pending  → menunggu konfirmasi admin
--   active   → boleh login
--   rejected → registrasi ditolak (disimpan untuk jejak audit)
-- ============================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

-- Re-create the constraint idempotently so re-runs stay safe.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users
    ADD CONSTRAINT users_status_check CHECK (status IN ('pending', 'active', 'rejected'));

-- Any rows created before this migration must remain able to log in.
UPDATE users SET status = 'active' WHERE status IS NULL OR status = '';

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
