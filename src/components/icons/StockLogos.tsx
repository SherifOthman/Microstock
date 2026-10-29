import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const AdobeStockLogo: React.FC<LogoProps> = ({ className = 'w-4 h-4', size = 16 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    className={className}
    aria-label="Adobe Stock"
  >
    <rect width="24" height="24" rx="4" fill="#DA1F26" />
    <path
      d="M7 6h3.5c2 0 3.2 1.1 3.2 2.8 0 1.2-.6 2.1-1.7 2.5 1.4.3 2.1 1.4 2.1 2.8 0 1.9-1.4 3.1-3.6 3.1H7V6zm2.2 4.4h1.1c.8 0 1.3-.4 1.3-1.1 0-.7-.5-1.1-1.3-1.1H9.2v2.2zm0 4.6h1.3c.9 0 1.5-.5 1.5-1.3 0-.8-.6-1.3-1.5-1.3H9.2v2.6zM15.5 13.8c0-1.8 1.4-2.8 3.5-2.8h1v-.8c0-.9-.6-1.4-1.6-1.4-.9 0-1.5.4-1.6 1.1h-1.8c.1-1.7 1.5-2.7 3.5-2.7 2.1 0 3.4 1.1 3.4 2.9v7h-1.8v-1.3c-.6.9-1.6 1.4-2.7 1.4-1.9 0-3.3-1.3-3.3-3.4zm4.5 1.5v-1h-.9c-.9 0-1.6.4-1.6 1.2 0 .8.6 1.2 1.4 1.2.7 0 1.1-.4 1.1-1.4z"
      fill="#ffffff"
    />
  </svg>
);

export const FreepikLogo: React.FC<LogoProps> = ({ className = 'w-4 h-4', size = 16 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    className={className}
    aria-label="Freepik"
  >
    <rect width="24" height="24" rx="4" fill="#1273EB" />
    <path
      d="M6 6h12v3H9.5v3h7v3h-7v4H6V6z"
      fill="#ffffff"
    />
  </svg>
);

export const ShutterstockLogo: React.FC<LogoProps> = ({ className = 'w-4 h-4', size = 16 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    className={className}
    aria-label="Shutterstock"
  >
    <rect width="24" height="24" rx="4" fill="#EE2524" />
    <path
      d="M17.4 8.5c-.8-1.5-2.4-2.5-4.2-2.5-2.7 0-4.8 2.2-4.8 4.8 0 .4.1.8.2 1.2l-2.4 1.4c-.4-.8-.6-1.7-.6-2.6 0-3.9 3.2-7.1 7.1-7.1 2.6 0 4.9 1.4 6.1 3.5l-1.4 1.3zm-6.8 7c.8 1.5 2.4 2.5 4.2 2.5 2.7 0 4.8-2.2 4.8-4.8 0-.4-.1-.8-.2-1.2l2.4-1.4c.4.8.6 1.7.6 2.6 0 3.9-3.2 7.1-7.1 7.1-2.6 0-4.9-1.4-6.1-3.5l1.4-1.3z"
      fill="#ffffff"
    />
  </svg>
);

export const VecteezyLogo: React.FC<LogoProps> = ({ className = 'w-4 h-4', size = 16 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    className={className}
    aria-label="Vecteezy"
  >
    <rect width="24" height="24" rx="4" fill="#FF5C39" />
    <path
      d="M6 7l6 11 6-11h-3.2l-2.8 5.6L9.2 7H6z"
      fill="#ffffff"
    />
  </svg>
);

export const DreamstimeLogo: React.FC<LogoProps> = ({ className = 'w-4 h-4', size = 16 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    className={className}
    aria-label="Dreamstime"
  >
    <rect width="24" height="24" rx="4" fill="#00AA6C" />
    <path
      d="M6 6h6.5c3.2 0 5.5 2.2 5.5 6s-2.3 6-5.5 6H6V6zm3.5 9h2.8c1.6 0 2.8-1.2 2.8-3s-1.2-3-2.8-3H9.5v6z"
      fill="#ffffff"
    />
  </svg>
);

export const OneTwoThreeRfLogo: React.FC<LogoProps> = ({ className = 'w-4 h-4', size = 16 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    className={className}
    aria-label="123RF"
  >
    <rect width="24" height="24" rx="4" fill="#F4B400" />
    <text
      x="12"
      y="16"
      textAnchor="middle"
      fontSize="10"
      fontWeight="900"
      fontFamily="sans-serif"
      fill="#1A1A1A"
    >
      123
    </text>
  </svg>
);

export function getPlatformLogo(platformId: string, size = 16) {
  switch (platformId) {
    case 'adobe':
      return <AdobeStockLogo size={size} />;
    case 'freepik':
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
