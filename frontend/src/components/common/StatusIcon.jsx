import React from 'react';
import { Globe, AlertTriangle, AlertCircle, XCircle, HelpCircle } from 'lucide-react';

const StatusIcon = ({ status, size = 20, className = '' }) => {
  const getIcon = () => {
    switch (status?.toUpperCase()) {
      case 'ONLINE':
        return <Globe size={size} className={`status-icon-glow-online ${className}`} style={{ color: '#10b981' }} />;
      case 'WARNING':
        return <Globe size={size} className={`status-icon-glow-warning ${className}`} style={{ color: '#f59e0b' }} />;
      case 'DEGRADED':
        return <AlertTriangle size={size} className={`status-icon-glow-degraded ${className}`} style={{ color: '#f97316' }} />;
      case 'CRITICAL':
        return <AlertCircle size={size} className={`status-icon-glow-critical ${className}`} style={{ color: '#ef4444' }} />;
      case 'OFFLINE':
        return <XCircle size={size} className={`status-icon-glow-offline ${className}`} style={{ color: '#dc2626' }} />;
      default:
        return <HelpCircle size={size} className={className} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  return getIcon();
};

export default StatusIcon;
