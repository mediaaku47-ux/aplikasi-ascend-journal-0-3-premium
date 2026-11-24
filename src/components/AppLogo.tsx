import React, { useId } from 'react';

export interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  theme?: 'dark' | 'light' | 'auto';
  /** @deprecated Dipertahankan untuk kompatibilitas pemanggilan lama */
  showBorder?: boolean;
  /** @deprecated Dipertahankan untuk kompatibilitas pemanggilan lama */
  showBadgeDot?: boolean;
}

const SIZE_DIMENSIONS: Record<NonNullable<AppLogoProps['size']>, { width: number; height: number; classes: string }> = {
  sm: { width: 32, height: 28, classes: 'w-8 h-7' },
  md: { width: 40, height: 36, classes: 'w-10 h-9' },
  lg: { width: 48, height: 43, classes: 'w-12 h-[43px]' },
  xl: { width: 64, height: 57, classes: 'w-16 h-[57px]' },
  '2xl': { width: 84, height: 75, classes: 'w-20 h-[72px] sm:w-[88px] sm:h-[78px]' },
};

export const AppLogo: React.FC<AppLogoProps> = ({
  size = 'md',
  className = '',
  theme = 'auto',
}) => {
  const uid = useId().replace(/:/g, '');
  const bookGradId = `ascend-book-grad-${uid}`;
  const ribbonGradId = `ascend-ribbon-grad-${uid}`;

  const resolvedTheme: 'dark' | 'light' =
    theme === 'auto'
      ? typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light'
      : theme;

  const isDark = resolvedTheme === 'dark';
  const dim = SIZE_DIMENSIONS[size];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 74 66"
      width={dim.width}
      height={dim.height}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Logo Ascend Journal"
      className={`shrink-0 select-none block overflow-visible ${dim.classes} ${className}`}
    >
      <defs>
        <linearGradient
          id={bookGradId}
          gradientUnits="userSpaceOnUse"
          x1="38"
          y1="12"
          x2="38"
          y2="62"
        >
          <stop offset="0%" stopColor={isDark ? '#2DD4BF' : '#26A69A'} />
          <stop offset="52%" stopColor={isDark ? '#147D6F' : '#106B5A'} />
          <stop offset="100%" stopColor={isDark ? '#094436' : '#073228'} />
        </linearGradient>

        <linearGradient
          id={ribbonGradId}
          gradientUnits="userSpaceOnUse"
          x1="55.25"
          y1="3.5"
          x2="55.25"
          y2="21"
        >
          <stop offset="0%" stopColor="#4ADE80" />
          <stop offset="100%" stopColor="#26A69A" />
        </linearGradient>
      </defs>

      {/* Celah halaman kontras lembut agar selalu terlihat tajam pada tema gelap maupun terang */}
      <rect
        x="23"
        y="15"
        width="42"
        height="5.5"
        rx="2.75"
        fill={isDark ? '#E6FFFA' : '#FFFFFF'}
        fillOpacity={isDark ? 0.92 : 0.9}
      />

      {/* Siluet ikon buku minimalis dengan garis gerak di sisi kiri */}
      <path
        d="M 22 12.5 L 62.5 12.5 A 6.5 6.5 0 0 1 69 19 L 69 55.5 A 6.5 6.5 0 0 1 62.5 62 L 16 62 A 2.25 2.25 0 0 1 16 57.5 L 36.5 57.5 A 2 2 0 0 0 36.5 53.5 L 13.5 53.5 A 2.5 2.5 0 0 1 13.5 48.5 L 29.5 48.5 A 2 2 0 0 0 29.5 44.5 L 18 44.5 A 2.5 2.5 0 0 1 18 39.5 L 26 39.5 A 2 2 0 0 0 26 35.5 L 4.5 35.5 A 2.75 2.75 0 0 1 4.5 30 L 34 30 A 2 2 0 0 0 34 26 L 12 26 A 2.75 2.75 0 0 1 12 20.5 L 62.5 20.5 A 2.75 2.75 0 0 0 62.5 15 L 22 15 A 1.25 1.25 0 0 1 22 12.5 Z"
        fill={`url(#${bookGradId})`}
        stroke={isDark ? '#2DD4BF' : 'none'}
        strokeOpacity={isDark ? 0.35 : 0}
        strokeWidth={isDark ? 0.85 : 0}
        strokeLinejoin="round"
      />

      {/* Dua titik aksen gerak di kiri bawah */}
      <circle
        cx="11.5"
        cy="42"
        r="2.45"
        fill={`url(#${bookGradId})`}
        stroke={isDark ? '#2DD4BF' : 'none'}
        strokeOpacity={isDark ? 0.3 : 0}
        strokeWidth={isDark ? 0.7 : 0}
      />
      <circle
        cx="9.5"
        cy="59.75"
        r="2.2"
        fill={`url(#${bookGradId})`}
        stroke={isDark ? '#2DD4BF' : 'none'}
        strokeOpacity={isDark ? 0.3 : 0}
        strokeWidth={isDark ? 0.7 : 0}
      />

      {/* Aksen pita pembatas / bookmark kecil di kanan atas */}
      <path
        d="M 51 3.5 L 55.25 8 L 59.5 3.5 L 59.5 20.5 L 51 20.5 Z"
        fill={`url(#${ribbonGradId})`}
        stroke={isDark ? '#A7F3D0' : '#FFFFFF'}
        strokeOpacity={isDark ? 0.4 : 0.35}
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  );
};
