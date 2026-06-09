const fs = require('fs');

const files = [
  'src/App.jsx',
  'src/components/dashboard/MonitoringTable.jsx',
  'src/components/dashboard/StatusDistributionChart.jsx',
  'src/components/dashboard/StatusPanel.jsx',
  'src/pages/ActivityLogPage.jsx',
  'src/pages/AdminToolsPage.jsx',
  'src/pages/NotificationsPage.jsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/WARNING:\s*['"]#[a-fA-F0-9]{6}['"]/g, "WARNING: '#10b981'");
  content = content.replace(/DEGRADED:\s*['"]#[a-fA-F0-9]{6}['"]/g, "DEGRADED: '#10b981'");
  content = content.replace(/CRITICAL:\s*['"]#[a-fA-F0-9]{6}['"]/g, "CRITICAL: '#10b981'");
  
  // Replace in complex objects like MonitoringTable.jsx: WARNING: { color: '#f59e0b', ... }
  content = content.replace(/WARNING:\s*\{\s*color:\s*['"]#[a-fA-F0-9]{6}['"]/g, "WARNING: { color: '#10b981'");
  content = content.replace(/DEGRADED:\s*\{\s*color:\s*['"]#[a-fA-F0-9]{6}['"]/g, "DEGRADED: { color: '#10b981'");
  content = content.replace(/CRITICAL:\s*\{\s*color:\s*['"]#[a-fA-F0-9]{6}['"]/g, "CRITICAL: { color: '#10b981'");

  // Replace glow/bg in MonitoringTable.jsx
  content = content.replace(/WARNING:\s*\{\s*bg:\s*['"]rgba[^'"]+['"]/g, "WARNING: { bg: 'rgba(16,185,129,0.15)'");
  content = content.replace(/DEGRADED:\s*\{\s*bg:\s*['"]rgba[^'"]+['"]/g, "DEGRADED: { bg: 'rgba(16,185,129,0.15)'");
  content = content.replace(/CRITICAL:\s*\{\s*bg:\s*['"]rgba[^'"]+['"]/g, "CRITICAL: { bg: 'rgba(16,185,129,0.15)'");

  // NotificationsPage.jsx SB
  content = content.replace(/WARNING:'rgba[^']+'/g, "WARNING:'rgba(16,185,129,0.12)'");
  content = content.replace(/DEGRADED:'rgba[^']+'/g, "DEGRADED:'rgba(16,185,129,0.12)'");
  content = content.replace(/CRITICAL:'rgba[^']+'/g, "CRITICAL:'rgba(16,185,129,0.12)'");

  fs.writeFileSync(f, content);
  console.log('Processed', f);
});
