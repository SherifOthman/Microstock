import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

/**
 * Adobe Stock — Official Dark (#000B1D) rounded tile with bold white "St" (Adobe Clean Display)
 */
export const AdobeStockLogo: React.FC<LogoProps> = ({ className = '', size = 18 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    className={`shrink-0 ${className}`}
    aria-label="Adobe Stock"
  >
    <rect width="24" height="24" rx="5" fill="#000B1D" />
    <rect x="0.5" y="0.5" width="23" height="23" rx="4.5" stroke="#FFFFFF" strokeOpacity="0.22" />
    {/* Adobe Clean "S" */}
    <path
      d="M9.15 16.75C7.25 16.75 5.85 16.05 5.35 15.55C5.25 15.45 5.22 15.32 5.28 15.18L6.02 13.78C6.1 13.62 6.24 13.6 6.38 13.72C6.95 14.22 7.92 14.78 9.18 14.78C10.28 14.78 10.88 14.32 10.88 13.65C10.88 13.02 10.35 12.68 8.88 12.22C6.75 11.55 5.65 10.68 5.65 8.98C5.65 7.12 7.12 5.85 9.48 5.85C11.05 5.85 12.22 6.32 12.82 6.78C12.95 6.88 12.98 7.02 12.9 7.16L12.22 8.5C12.14 8.65 12.02 8.68 11.86 8.58C11.32 8.2 10.42 7.82 9.45 7.82C8.38 7.82 7.85 8.28 7.85 8.88C7.85 9.48 8.38 9.8 9.88 10.28C12.05 10.95 13.12 11.88 13.12 13.58C13.12 15.52 11.58 16.75 9.15 16.75Z"
      fill="#FFFFFF"
    />
    {/* Adobe Clean "t" with angled top stem */}
    <path
      d="M17.25 6.45V8.75H19.05C19.2 8.75 19.28 8.84 19.28 8.98V10.42C19.28 10.56 19.2 10.65 19.05 10.65H17.25V13.85C17.25 14.52 17.6 14.82 18.22 14.82C18.52 14.82 18.78 14.78 18.98 14.72C19.12 14.68 19.22 14.74 19.22 14.9V16.28C19.22 16.44 19.14 16.54 18.96 16.6C18.58 16.7 18.08 16.75 17.55 16.75C15.82 16.75 15.05 15.82 15.05 14.02V10.65H13.95C13.8 10.65 13.72 10.56 13.72 10.42V8.98C13.72 8.84 13.8 8.75 13.95 8.75H15.05V6.92L17.02 6.28C17.16 6.24 17.25 6.3 17.25 6.45Z"
      fill="#FFFFFF"
    />
  </svg>
);

/**
 * Magnific (formerly Freepik) — Official 2025/2026 sloped geometric "M" mark on Black (#0A0A0C) tile
 */
export const FreepikLogo: React.FC<LogoProps> = ({ className = '', size = 18 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    className={`shrink-0 ${className}`}
    aria-label="Magnific"
  >
    <rect width="24" height="24" rx="5" fill="#0A0A0C" />
    <rect x="0.5" y="0.5" width="23" height="23" rx="4.5" stroke="#FFFFFF" strokeOpacity="0.22" />
    {/* Official outward-sloped geometric M with top V-valley and bottom inverted-V cutout */}
    <path
      d="M6.6 6.2H10.2L12 10.6L13.8 6.2H17.4L21 18.4H16.4L12 12.6L7.6 18.4H3L6.6 6.2Z"
      fill="#FFFFFF"
    />
  </svg>
);

export const MagnificLogo = FreepikLogo;

/**
 * Shutterstock — Official 2025/2026 Coral-Red (#F06440) icon with white Haffer "S" and top/bottom radiating ripple domes
 */
export const ShutterstockLogo: React.FC<LogoProps> = ({ className = '', size = 18 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    className={`shrink-0 ${className}`}
    aria-label="Shutterstock"
  >
    <rect width="24" height="24" rx="5" fill="#F06440" />
    <rect x="0.5" y="0.5" width="23" height="23" rx="4.5" stroke="#FFFFFF" strokeOpacity="0.18" />
    {/* Top outer ripple dome */}
    <path
      d="M9.1 2.55C10.85 1.82 13.15 1.82 14.9 2.55C15.12 2.64 15.02 2.95 14.78 2.95H9.22C8.98 2.95 8.88 2.64 9.1 2.55Z"
      fill="#FFFFFF"
    />
    {/* Top inner ripple dome */}
    <path
      d="M8.35 5.25C10.32 3.85 13.68 3.85 15.65 5.25C15.92 5.45 15.78 5.88 15.44 5.88H8.56C8.22 5.88 8.08 5.45 8.35 5.25Z"
      fill="#FFFFFF"
    />
    {/* Central Haffer "S" */}
    <path
      d="M11.95 7.25C14.42 7.25 16.02 8.28 16.22 10.02H14.12C13.98 9.08 13.18 8.68 11.95 8.68C10.72 8.68 9.98 9.08 9.98 9.76C9.98 10.42 10.56 10.68 11.52 10.84L13.12 11.1C15.02 11.4 16.32 12.16 16.32 13.84C16.32 15.58 14.88 16.75 12.05 16.75C9.32 16.75 7.72 15.58 7.58 13.88H9.72C9.85 14.92 10.76 15.32 12.08 15.32C13.38 15.32 14.12 14.86 14.12 14.12C14.12 13.42 13.52 13.12 12.48 12.95L10.85 12.68C9.02 12.38 7.78 11.62 7.78 9.92C7.78 8.24 9.25 7.25 11.95 7.25Z"
      fill="#FFFFFF"
    />
    {/* Bottom inner ripple dome */}
    <path
      d="M15.65 18.75C13.68 20.15 10.32 20.15 8.35 18.75C8.08 18.55 8.22 18.12 8.56 18.12H15.44C15.78 18.12 15.92 18.55 15.65 18.75Z"
      fill="#FFFFFF"
    />
    {/* Bottom outer ripple dome */}
    <path
      d="M14.9 21.45C13.15 22.18 10.85 22.18 9.1 21.45C8.88 21.36 8.98 21.05 9.22 21.05H14.78C15.02 21.05 15.12 21.36 14.9 21.45Z"
      fill="#FFFFFF"
    />
  </svg>
);

/**
 * Vecteezy — Official RGB Orange (#FF7900) pebble logomark with cursive looped lowercase "v"
 */
export const VecteezyLogo: React.FC<LogoProps> = ({ className = '', size = 18 }) => (
  <svg
    viewBox="0 0 186.02 186.5"
    width={size}
    height={size}
    fill="none"
    className={`shrink-0 ${className}`}
    aria-label="Vecteezy"
  >
    {/* Official orange organic pebble silhouette */}
    <path
      d="M93,186.5c65.4,0,93-41.42,93-92.52,0-70.49-32-94-74.12-94C57.65,0,0,44.57,0,94,0,145.08,41.66,186.5,93,186.5Z"
      fill="#FF7900"
    />
    {/* Official white cursive looped "v" */}
    <path
      d="M93.49,156.23c-28.34,0-31-25.44-31-51.59,0-25.19-1.94-30.77-10.66-30.77H39V57.16H51.83c24.47,0,27.62,20.35,27.62,47.48,0,25.91,1.93,34.63,13.8,34.63,12.6,0,21.32-20.34,25.43-36.81C100.28,98.1,88.89,85,88.89,66.12c0-15,9.69-27.37,24.22-27.37,16,0,25,15.26,25,35.37,0,5.08-.24,9.93-.48,13.56h18.89v16.71H134.91C129.83,129.83,115.78,156.23,93.49,156.23Z"
      fill="#FFFFFF"
    />
    {/* Inner loop counter cutout */}
    <path
      d="M121.11,86.71c.24-4.36.24-8.48.24-12.59,0-9.21-2.42-18.41-8.48-18.41-4.6,0-7,3.87-7,10.66C105.85,77.51,113.35,84.29,121.11,86.71Z"
      fill="#FF7900"
    />
  </svg>
);

/**
 * Dreamstime — Official Black (#0A0A0C) rounded tile with continuous white open-bowl lowercase "d" mark
 */
export const DreamstimeLogo: React.FC<LogoProps> = ({ className = '', size = 18 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    className={`shrink-0 ${className}`}
    aria-label="Dreamstime"
  >
    <rect width="24" height="24" rx="5" fill="#0A0A0C" />
    <rect x="0.5" y="0.5" width="23" height="23" rx="4.5" stroke="#FFFFFF" strokeOpacity="0.22" />
    {/* Official open-bowl lowercase "d" with rounded terminals */}
    <path
      d="M12.1 9.5C8.85 9.5 6.6 11.55 6.6 14.25C6.6 16.95 8.85 18.95 11.75 18.95C14.65 18.95 16.75 16.95 16.75 14.15V5.15"
      stroke="#FFFFFF"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * 123RF — Official Black (#0F0F12) circular badge with gold-to-amber gradient "123" geometric numerals
 */
export const OneTwoThreeRfLogo: React.FC<LogoProps> = ({ className = '', size = 18 }) => {
  const gradId = React.useId();
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={`shrink-0 ${className}`}
      aria-label="123RF"
    >
      <defs>
        <linearGradient id={gradId} x1="3" y1="12" x2="21" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFD400" />
          <stop offset="55%" stopColor="#FFB02E" />
          <stop offset="100%" stopColor="#FF8A48" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11.5" fill="#0F0F12" stroke="#FFFFFF" strokeOpacity="0.22" />
      {/* Geometric "1" */}
      <path
        d="M3.7 8.4H6.1V15.6H4.3V10.0H3.7V8.4Z"
        fill={`url(#${gradId})`}
      />
      {/* Wide geometric "2" */}
      <path
        d="M7.6 8.4H11.2C12.55 8.4 13.4 9.15 13.4 10.4C13.4 11.45 12.75 12.1 11.45 12.45L9.5 13.0C9.2 13.1 9.1 13.25 9.1 13.55V14.0H13.3V15.6H7.4V13.4C7.4 12.25 8.0 11.65 9.35 11.3L11.05 10.85C11.45 10.75 11.65 10.55 11.65 10.2C11.65 9.85 11.35 9.65 10.8 9.65H7.6V8.4Z"
        fill={`url(#${gradId})`}
      />
      {/* Wide geometric "3" */}
      <path
        d="M14.4 8.4H18.1C19.45 8.4 20.25 9.1 20.25 10.2C20.25 11.0 19.8 11.55 19.05 11.8C19.88 12.05 20.35 12.68 20.35 13.6C20.35 14.85 19.45 15.6 18.0 15.6H14.4V14.0H17.75C18.3 14.0 18.6 13.75 18.6 13.3C18.6 12.85 18.3 12.6 17.75 12.6H15.2V11.2H17.65C18.18 11.2 18.48 10.98 18.48 10.55C18.48 10.12 18.18 9.9 17.65 9.9H14.4V8.4Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  );
};

export function getPlatformLogo(platformId: string, size = 18) {
  switch (platformId) {
    case 'adobe':
      return <AdobeStockLogo size={size} />;
    case 'freepik':
    case 'magnific':
      return <FreepikLogo size={size} />;
    case 'shutterstock':
      return <ShutterstockLogo size={size} />;
    case 'vecteezy':
      return <VecteezyLogo size={size} />;
    case 'dreamstime':
      return <DreamstimeLogo size={size} />;
    case '123rf':
      return <OneTwoThreeRfLogo size={size} />;
    default:
      return null;
  }
}
