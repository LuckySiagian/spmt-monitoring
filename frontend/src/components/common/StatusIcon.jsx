import React from 'react';
import { Globe, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';

const StatusIcon = ({ status, size = 20, className = '' }) => {
  const getIcon = () => {
    switch (status?.toUpperCase()) {
      case 'ONLINE':
        return <Globe size={size} className={`status-icon-glow-online ${className}`} style={{ color: 'var(--status-online)' }} />;
      case 'CRITICAL':
        return <AlertTriangle size={size} className={`status-icon-glow-critical ${className}`} style={{ color: 'var(--status-critical)' }} />;
      case 'OFFLINE':
        return <XCircle size={size} className={`status-icon-glow-offline ${className}`} style={{ color: 'var(--status-offline)' }} />;
      default:
        return <HelpCircle size={size} className={className} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  return getIcon();
};

export default StatusIcon;
