import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Zap, AlertTriangle, Activity, Globe, Shield, Clock, RefreshCw,
  Terminal, BarChart3, PieChart, ShieldAlert, WifiOff, Mail, Send, CheckCircle
} from 'lucide-react';

const AdminToolsPage = () => {
  const [chaosModes, setChaosModes] = useState({
    slow: false,
    loss: false,
    dns: false,
    ssl: false,
    firewall: false,
    timeout: false
  });
  const [loading, setLoading] = useState({});
  const [distribution, setDistribution] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [reportState, setReportState] = useState('idle'); // idle | sending | sent | error
  const [reportMsg, setReportMsg] = useState('');

  const sendWeeklyReport = async () => {
    setReportState('sending');
    setReportMsg('');
    try {
      const token = localStorage.getItem('spmt_token');
      const res = await axios.post('http://localhost:8080/reports/weekly/send', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReportState('sent');
      setReportMsg(res.data?.message || 'Laporan terkirim ke semua email terdaftar.');
      setTimeout(() => setReportState('idle'), 5000);
    } catch (err) {
      console.error('Failed to send weekly report:', err);
      setReportState('error');
      setReportMsg(err.response?.data?.error || 'Gagal mengirim laporan. Pastikan SMTP terkonfigurasi & Anda SuperAdmin.');
    }
  };

  const toggleChaos = async (mode) => {
    setLoading(prev => ({ ...prev, [mode]: true }));
    try {
      const active = !chaosModes[mode];
      const token = localStorage.getItem('spmt_token');
      await axios.post(`http://localhost:8080/chaos/toggle?mode=${mode}&active=${active}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setChaosModes(prev => ({ ...prev, [mode]: active }));
    } catch (err) {
      console.error("Failed to toggle chaos:", err);
      alert("Error: Only SuperAdmins can toggle chaos modes.");
    } finally {
      setLoading(prev => ({ ...prev, [mode]: false }));
    }
  };

  const fetchDistribution = async () => {
    setAuditLoading(true);
    try {
      const token = localStorage.getItem('spmt_token');
      const res = await axios.get('http://localhost:8080/dashboard/distribution', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDistribution(res.data);
    } catch (err) {
      console.error("Failed to fetch distribution:", err);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    fetchDistribution();
    const interval = setInterval(fetchDistribution, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusColors = {
    ONLINE: '#10b981',
    WARNING: '#f59e0b',
    DEGRADED: '#f97316',
    CRITICAL: '#ef4444',
    OFFLINE: '#dc2626',
    UNKNOWN: '#94a3b8'
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <Terminal size={32} color="var(--primary)" />
          <h1 style={styles.title}>NOC Admin Tools</h1>
        </div>
        <p style={styles.subtitle}>Engineering portal for stress testing and severity engine auditing.</p>
      </div>

      <div style={styles.grid}>
        {/* CHAOS SIMULATOR CARD */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardIconGroup}>
              <Zap size={20} color="#f59e0b" />
              <h2 style={styles.cardTitle}>Chaos Simulator</h2>
            </div>
            <span style={styles.badge}>Live Testing</span>
          </div>
          <p style={styles.cardDesc}>Inject artificial failures to test engine detection logic and alert propagation.</p>
          
          <div style={styles.chaosGrid}>
            {[
              { id: 'slow', label: 'Slow Response', icon: <Clock size={16} />, desc: 'Simulate 6-10s latency' },
              { id: 'loss', label: 'Packet Loss', icon: <WifiOff size={16} />, desc: 'Simulate 20% drop rate' },
              { id: 'dns', label: 'DNS Failure', icon: <Globe size={16} />, desc: 'Simulate resolution fail' },
              { id: 'ssl', label: 'SSL Expiry', icon: <Shield size={16} />, desc: 'Simulate certificate expiry' },
              { id: 'firewall', label: 'WAF Block', icon: <ShieldAlert size={16} />, desc: 'Simulate 403 Forbidden' },
              { id: 'timeout', label: 'TCP Timeout', icon: <Activity size={16} />, desc: 'Simulate dead socket' },
            ].map(mode => (
              <div key={mode.id} style={{
                ...styles.chaosItem,
                border: chaosModes[mode.id] ? '1px solid #f59e0b' : '1px solid var(--border)',
                background: chaosModes[mode.id] ? 'rgba(245, 158, 11, 0.05)' : 'var(--bg-main)'
              }}>
                <div style={styles.chaosMeta}>
                  <div style={styles.chaosIcon}>{mode.icon}</div>
                  <div>
                    <div style={styles.chaosLabel}>{mode.label}</div>
                    <div style={styles.chaosSub}>{mode.desc}</div>
                  </div>
                </div>
                <button 
                  onClick={() => toggleChaos(mode.id)}
                  disabled={loading[mode.id]}
                  style={{
                    ...styles.toggleBtn,
                    background: chaosModes[mode.id] ? '#f59e0b' : 'var(--bg-card)',
                    color: chaosModes[mode.id] ? '#fff' : 'var(--text-sub)'
                  }}
                >
                  {loading[mode.id] ? <RefreshCw size={14} className="spin" /> : (chaosModes[mode.id] ? 'ACTIVE' : 'OFF')}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* SEVERITY AUDIT CARD */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardIconGroup}>
              <BarChart3 size={20} color="var(--primary)" />
              <h2 style={styles.cardTitle}>Severity Distribution Audit</h2>
            </div>
            <button onClick={fetchDistribution} disabled={auditLoading} style={styles.refreshBtn}>
              <RefreshCw size={14} className={auditLoading ? "spin" : ""} />
            </button>
          </div>
          <p style={styles.cardDesc}>Visual verification of status distribution across the entire monitored infrastructure.</p>

          <div style={styles.chartArea}>
            {distribution ? (
              <div style={styles.distributionWrapper}>
                {Object.entries(distribution).map(([status, percentage]) => (
                  <div key={status} style={styles.distRow}>
                    <div style={styles.distLabelGroup}>
                      <span style={{ ...styles.distBullet, background: statusColors[status] }}></span>
                      <span style={styles.distName}>{status}</span>
                      <span style={styles.distPercent}>{percentage.toFixed(1)}%</span>
                    </div>
                    <div style={styles.progressBarBg}>
                      <div style={{
                        ...styles.progressBarFill,
                        width: `${percentage}%`,
                        background: statusColors[status],
                        boxShadow: `0 0 10px ${statusColors[status]}44`
                      }}></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.loadingState}>Analyzing logs...</div>
            )}
          </div>

          <div style={styles.auditNote}>
            <AlertTriangle size={14} />
            <span>Target: Maintain ONLINE > 90% in healthy environment.</span>
          </div>
        </div>

        {/* NOTIFICATION TOOLS CARD */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardIconGroup}>
              <Mail size={20} color="var(--primary)" />
              <h2 style={styles.cardTitle}>Notification Tools</h2>
            </div>
            <span style={styles.badge}>Email</span>
          </div>
          <p style={styles.cardDesc}>
            Laporan uptime otomatis dikirim ke seluruh email terdaftar setiap Senin 08:00.
            Gunakan tombol di bawah untuk mengirim laporan saat ini juga (tanpa menunggu jadwal).
          </p>

          <button
            onClick={sendWeeklyReport}
            disabled={reportState === 'sending'}
            style={{
              ...styles.reportBtn,
              opacity: reportState === 'sending' ? 0.6 : 1,
              cursor: reportState === 'sending' ? 'not-allowed' : 'pointer',
            }}
          >
            {reportState === 'sending'
              ? <><RefreshCw size={16} className="spin" /> Mengirim...</>
              : reportState === 'sent'
                ? <><CheckCircle size={16} /> Terkirim</>
                : <><Send size={16} /> Kirim Laporan Sekarang</>}
          </button>

          {reportMsg && (
            <div style={{
              ...styles.reportMsg,
              color: reportState === 'error' ? '#ef4444' : '#10b981',
              background: reportState === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
            }}>
              {reportState === 'error' ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
              <span>{reportMsg}</span>
            </div>
          )}

          <div style={styles.auditNote}>
            <Clock size={14} />
            <span>Jadwal: Senin 08:00 (atur via REPORT_WEEKDAY / REPORT_HOUR).</span>
          </div>
        </div>
      </div>
      
      <div style={styles.footerNote}>
        <Shield size={14} />
        <span>Action logs for chaos simulation are recorded in Activity Log for accountability.</span>
      </div>
    </div>
  );
};

const styles = {
  container: { padding: '30px', maxWidth: '1200px', margin: '0 auto', color: 'var(--text)' },
  header: { marginBottom: '40px' },
  titleGroup: { display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' },
  title: { fontSize: '32px', fontWeight: 900, letterSpacing: '-0.02em', margin: 0 },
  subtitle: { color: 'var(--text-muted)', fontSize: '16px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '30px' },
  card: { 
    background: 'var(--bg-card)', 
    borderRadius: '20px', 
    padding: '30px', 
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow)',
    display: 'flex',
    flexDirection: 'column'
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' },
  cardIconGroup: { display: 'flex', alignItems: 'center', gap: '10px' },
  cardTitle: { fontSize: '20px', fontWeight: 800, margin: 0 },
  badge: { fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(245, 158, 11, 0.2)' },
  cardDesc: { color: 'var(--text-muted)', fontSize: '14px', marginBottom: '25px', lineHeight: 1.5 },
  chaosGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' },
  chaosItem: {
    padding: '15px',
    borderRadius: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'all 0.2s ease'
  },
  chaosMeta: { display: 'flex', gap: '12px', alignItems: 'center' },
  chaosIcon: { width: '32px', height: '32px', borderRadius: '8px', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' },
  chaosLabel: { fontSize: '14px', fontWeight: 700 },
  chaosSub: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' },
  toggleBtn: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    fontSize: '11px',
    fontWeight: 800,
    cursor: 'pointer',
    minWidth: '60px',
    transition: 'all 0.2s ease'
  },
  chartArea: { flex: 1, display: 'flex', alignItems: 'center' },
  distributionWrapper: { width: '100%', display: 'flex', flexDirection: 'column', gap: '18px' },
  distRow: { display: 'flex', flexDirection: 'column', gap: '6px' },
  distLabelGroup: { display: 'flex', alignItems: 'center', gap: '10px' },
  distBullet: { width: '8px', height: '8px', borderRadius: '50%' },
  distName: { fontSize: '12px', fontWeight: 700, flex: 1 },
  distPercent: { fontSize: '12px', fontWeight: 800, opacity: 0.8 },
  progressBarBg: { height: '8px', background: 'var(--bg-main)', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)' },
  progressBarFill: { height: '100%', borderRadius: '10px', transition: 'width 1s ease-in-out' },
  loadingState: { color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', width: '100%' },
  refreshBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '5px' },
  reportBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    padding: '12px 18px', borderRadius: '12px', border: 'none',
    background: 'var(--primary)', color: '#fff', fontSize: '14px', fontWeight: 800,
    width: '100%', transition: 'all 0.2s ease'
  },
  reportMsg: {
    marginTop: '14px', padding: '12px', borderRadius: '10px', fontSize: '13px',
    fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px'
  },
  auditNote: { 
    marginTop: '25px', 
    padding: '12px', 
    background: 'rgba(99, 102, 241, 0.05)', 
    borderRadius: '10px', 
    fontSize: '12px', 
    color: 'var(--primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontWeight: 600
  },
  footerNote: {
    marginTop: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    color: 'var(--text-muted)',
    fontSize: '12px'
  }
};

export default AdminToolsPage;
