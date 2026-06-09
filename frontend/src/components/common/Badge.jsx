import React from 'react';
import StatusBadgeIcon from './StatusBadgeIcon';

const Badge = ({ status, children, className = '' }) => {
  const getStatusClass = () => {
    switch (status?.toUpperCase()) {
      case 'ONLINE': return 'badge-online';
      case 'CRITICAL': return 'badge-critical';
      case 'OFFLINE': return 'badge-offline';
      default: return '';
    }
  };

  return (
    <span className={`badge-modern ${getStatusClass()} ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {status === 'ONLINE' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 6px currentColor' }} />}
      {children || status}
      <StatusBadgeIcon status={status} />
    </span>
  );
};

export default Badge;
