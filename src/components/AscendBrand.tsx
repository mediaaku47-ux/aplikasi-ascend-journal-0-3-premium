import React from 'react';
import { AppLogo } from './AppLogo';

interface AscendBrandProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  showDot?: boolean;
  theme?: 'dark' | 'light' | 'auto';
}

export const AscendBrand: React.FC<AscendBrandProps> = ({
  size = 'md',
  className = '',
  onClick,
  showDot = false,
  theme = 'dark',
}) => {
  const resolvedTheme: 'dark' | 'light' =
    theme === 'auto'
      ? typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light'
      : theme;

  const isLight = resolvedTheme === 'light';

  const titleSizes = {
    sm: 'text-[13.5px] sm:text-[14.5px]',
    md: 'text-[15.5px] sm:text-[16.5px]',
    lg: 'text-[18px] sm:text-[20px]',
  };

  const subtitleSizes = {
    sm: 'text-[8.5px] sm:text-[9px]',
    md: 'text-[9.5px] sm:text-[10.5px]',
    lg: 'text-[11px] sm:text-[12px]',
  };

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 sm:gap-3 select-none group min-w-0 ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      title="Ascend Journal"
    >
      <div className="relative shrink-0">
        <AppLogo
          size={size}
          theme={resolvedTheme}
          className="group-hover:scale-105 transition-transform duration-200"
        />
      </div>

      <div className="min-w-0 leading-tight">
        {/* Baris 1: ASCEND */}
        <div className="flex items-center gap-1.5">
          <span
            className={`font-['Montserrat',sans-serif] font-extrabold ${titleSizes[size]} tracking-[0.14em] uppercase leading-none bg-clip-text text-transparent ${
              isLight
                ? 'bg-gradient-to-b from-[#D9822B] to-[#B85E14]'
                : 'bg-gradient-to-b from-[#FBBF24] to-[#F59E0B]'
            }`}
          >
            ASCEND
          </span>
          {showDot && (
            <span
              className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-[#F59E0B] shadow-[0_0_6px_#F59E0B] inline-block shrink-0 animate-pulse"
              title="Aktif"
            />
          )}
        </div>
        {/* Baris 2: JOURNAL */}
        <span
          className={`font-['Montserrat',sans-serif] font-semibold ${subtitleSizes[size]} tracking-[0.32em] uppercase block mt-1 ${
            isLight ? 'text-[#0E7469]' : 'text-[#5EEAD4]'
          }`}
        >
          JOURNAL
        </span>
      </div>
    </div>
  );
};
