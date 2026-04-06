-- ============================================================
-- Migration 004: Enhanced Monitoring Engine
-- Tambah kolom ICMP, TCP, RootCause, IPAddress ke monitoring_logs
-- Perluas status check constraint
-- ============================================================

-- 1. Tambah kolom baru ke monitoring_logs (jika belum ada)
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

-- 2. Drop dan recreate check constraint untuk status (tambah status baru)
ALTER TABLE monitoring_logs DROP CONSTRAINT IF EXISTS monitoring_logs_status_check;
ALTER TABLE monitoring_logs ADD CONSTRAINT monitoring_logs_status_check
  CHECK (status IN ('ONLINE', 'CRITICAL', 'OFFLINE', 'SERVER_DOWN', 'WEB_DOWN', 'DNS_ERROR', 'SSL_INVALID', 'SLOW'));

-- 3. Tambah kolom is_read ke status_events untuk unread notification system
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='status_events' AND column_name='is_read') THEN
    ALTER TABLE status_events ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Index untuk query unread notifications
CREATE INDEX IF NOT EXISTS idx_status_events_is_read ON status_events(is_read);
