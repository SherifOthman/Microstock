import React from 'react';

interface AppLogoProps {
  size?: number;
  className?: string;
}

/**
 * Sleek geometric StockFlow icon:
 * Precision blue squircle with isometric layered flow planes representing batch media pipelines.
 */
export function AppLogo({ size = 24, className = '' }: AppLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      className={className}
      role="img"
      aria-label="StockFlow Logo"
    >
      <defs>
        <linearGradient id="stockflow-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>

      {/* Precision Squircle Container */}
      <rect x="1" y="1" width="30" height="30" rx="7.5" fill="url(#stockflow-bg)" />
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="7"
        stroke="#FFFFFF"
        strokeOpacity="0.18"
        strokeWidth="1"
      />

      {/* Top Isometric Diamond Plane */}
      <path
        d="M16 6.5L25 11.5L16 16.5L7 11.5L16 6.5Z"
        fill="#FFFFFF"
      />

      {/* Middle Flow Layer */}
      <path
        d="M7 16L16 21L25 16"
        stroke="#FFFFFF"
        strokeOpacity="0.85"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Bottom Flow Layer */}
      <path
        d="M7 20.5L16 25.5L25 20.5"
        stroke="#FFFFFF"
        strokeOpacity="0.55"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
