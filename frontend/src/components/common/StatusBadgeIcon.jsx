import React from 'react'

export default function StatusBadgeIcon({ status, style }) {
  if (status === 'WARNING') {
    // Segitiga warna kuning
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" style={style}>
        <polygon points="12,2 22,20 2,20" fill="#facc15" stroke="#ca8a04" strokeWidth="2" strokeLinejoin="round" />
        <text x="12" y="17" fontSize="12" fill="#ca8a04" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">!</text>
      </svg>
    )
  }
  
  if (status === 'CRITICAL') {
    // Segitiga didalam segitiga ada tanda seru berwarna orange tua
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" style={style}>
        {/* Outer triangle */}
        <polygon points="12,1 23,21 1,21" fill="#ea580c" stroke="#c2410c" strokeWidth="2" strokeLinejoin="round" />
        {/* Inner triangle */}
        <polygon points="12,5 19.5,19 4.5,19" fill="#fff" stroke="#ea580c" strokeWidth="1.5" strokeLinejoin="round" />
        <text x="12" y="16.5" fontSize="12" fill="#c2410c" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">!</text>
      </svg>
    )
  }

  return null
}
