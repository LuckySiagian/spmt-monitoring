-- ============================================================
-- Migration 005: UNKNOWN status + DNS latency + SSL expiry date
-- Jalankan setelah migration 004.
-- ============================================================

-- 1. Kolom dns_latency_ms (milliseconds DNS resolution)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='monitoring_logs' AND column_name='dns_latency_ms') THEN
    ALTER TABLE monitoring_logs ADD COLUMN dns_latency_ms INT;
  END IF;
END $$;

-- 2. Kolom ssl_expiry_date (tanggal expired SSL cert)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='monitoring_logs' AND column_name='ssl_expiry_date') THEN
    ALTER TABLE monitoring_logs ADD COLUMN ssl_expiry_date TIMESTAMPTZ;
  END IF;
END $$;

-- 3. Pastikan kolom icmp_status, icmp_latency_ms, tcp_port_open, root_cause, ip_address ada
--    (sudah ada di migration 004, blok ini idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitoring_logs' AND column_name='icmp_status') THEN
    ALTER TABLE monitoring_logs ADD COLUMN icmp_status BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitoring_logs' AND column_name='icmp_latency_ms') THEN
    ALTER TABLE monitoring_logs ADD COLUMN icmp_latency_ms INT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitoring_logs' AND column_name='tcp_port_open') THEN
    ALTER TABLE monitoring_logs ADD COLUMN tcp_port_open BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitoring_logs' AND column_name='root_cause') THEN
    ALTER TABLE monitoring_logs ADD COLUMN root_cause VARCHAR(200) NOT NULL DEFAULT '';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitoring_logs' AND column_name='ip_address') THEN
    ALTER TABLE monitoring_logs ADD COLUMN ip_address VARCHAR(45) NOT NULL DEFAULT '';
  END IF;
END $$;

-- 4. Perluas CHECK constraint status: ganti lama → baru (tambah UNKNOWN)
ALTER TABLE monitoring_logs DROP CONSTRAINT IF EXISTS monitoring_logs_status_check;
ALTER TABLE monitoring_logs ADD CONSTRAINT monitoring_logs_status_check
  CHECK (status IN (
    'ONLINE', 'CRITICAL', 'OFFLINE', 'UNKNOWN',
    -- Legacy statuses (backward compat, tidak dipakai engine baru)
    'SERVER_DOWN', 'WEB_DOWN', 'DNS_ERROR', 'SSL_INVALID', 'SLOW'
  ));

-- 5. Tambah is_read ke status_events (jika belum ada dari migration 004)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='status_events' AND column_name='is_read') THEN
    ALTER TABLE status_events ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_status_events_is_read ON status_events(is_read);
CREATE INDEX IF NOT EXISTS idx_logs_status ON monitoring_logs(status);
CREATE INDEX IF NOT EXISTS idx_logs_checked_at ON monitoring_logs(checked_at DESC);
