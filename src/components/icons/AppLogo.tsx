import React from 'react';

interface AppLogoProps {
  size?: number;
  className?: string;
}

export function AppLogo({ size = 28, className = '' }: AppLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      width={size}
      height={size}
      fill="none"
      className={className}
      role="img"
      aria-label="Microstock Assistant Logo"
    >
      <defs>
        <linearGradient id="logo-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="50%" stopColor="#090d16" />
          <stop offset="100%" stopColor="#030712" />
        </linearGradient>

        <linearGradient id="logo-primary-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>

        <linearGradient id="logo-emerald-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="50%" stopColor="#059669" />
        </linearGradient>

        <linearGradient id="logo-violet-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>

        <linearGradient id="logo-sparkle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>

      {/* Rounded Squircle Container */}
      <rect
        x="6"
        y="6"
        width="116"
        height="116"
        rx="28"
        fill="url(#logo-bg-grad)"
        stroke="#334155"
        strokeWidth="2.5"
      />

      {/* Microstock Aperture Blades */}
      <g>
        {/* Top Blade */}
        <path
          d="M 64 22 C 78 22, 92 27, 102 37 L 85 54 C 80 48, 72 45, 64 45 Z"
          fill="url(#logo-primary-glow)"
          opacity="0.95"
        />
        {/* Right Blade */}
        <path
          d="M 106 64 C 106 78, 101 92, 91 102 L 74 85 C 80 80, 83 72, 83 64 Z"
          fill="url(#logo-primary-glow)"
          opacity="0.85"
        />
        {/* Bottom Blade */}
        <path
          d="M 64 106 C 50 106, 36 101, 26 91 L 43 74 C 48 80, 56 83, 64 83 Z"
          fill="url(#logo-emerald-glow)"
          opacity="0.9"
        />
        {/* Left Blade */}
        <path
          d="M 22 64 C 22 50, 27 36, 37 26 L 54 43 C 48 48, 45 56, 45 64 Z"
          fill="url(#logo-violet-glow)"
          opacity="0.9"
        />
      </g>

      {/* Center Core */}
      <circle cx="64" cy="64" r="18" fill="#090d16" stroke="#475569" strokeWidth="2" />
      <circle cx="64" cy="64" r="13" fill="#0284c7" opacity="0.25" />

      {/* Core AI Sparkle */}
      <path
        d="M 64 49 Q 64 64 49 64 Q 64 64 64 79 Q 64 64 79 64 Q 64 64 64 49 Z"
        fill="url(#logo-sparkle-grad)"
      />

      {/* Satellite Sparkle */}
      <path
        d="M 94 28 Q 94 34 88 34 Q 94 34 94 40 Q 94 34 100 34 Q 94 34 94 28 Z"
        fill="#38bdf8"
      />
      <circle cx="94" cy="34" r="1.5" fill="#ffffff" />
    </svg>
  );
}
