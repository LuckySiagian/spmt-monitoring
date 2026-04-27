import React from 'react';

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
    <span className={`badge-modern ${getStatusClass()} ${className}`}>
      {status === 'ONLINE' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 6px currentColor' }} />}
      {children || status}
    </span>
  );
};

export default Badge;
