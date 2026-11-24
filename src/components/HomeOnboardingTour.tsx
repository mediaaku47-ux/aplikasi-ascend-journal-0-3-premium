import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Megaphone, Settings, User as UserIcon, ArrowRight, Check } from 'lucide-react';

export const HOME_TOUR_STORAGE_KEY = 'ascend_home_nav_tour_v2_completed';

interface TourStepConfig {
  id: 'search' | 'notifications' | 'settings' | 'profile';
  targetId: string;
  placement: 'top' | 'bottom';
  shape: 'pill' | 'rounded';
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOUR_STEPS: TourStepConfig[] = [
  {
    id: 'search',
    targetId: 'mobile-hero-global-search',
    placement: 'bottom',
    shape: 'pill',
    title: 'Pencarian Cepat & Riwayat',
    description:
      'Cari fitur aplikasi, riwayat catatan, transaksi keuangan, hingga agenda harianmu dengan cepat dari kolom pencarian ini.',
    icon: Search,
  },
  {
    id: 'notifications',
    targetId: 'mobile-nav-notifications',
    placement: 'top',
    shape: 'rounded',
    title: 'Pusat Notifikasi & Pembaruan',
    description:
      'Cek pengingat agenda harian serta informasi setiap ada pembaruan (update) fitur terbaru aplikasi di sini.',
    icon: Megaphone,
  },
  {
    id: 'settings',
    targetId: 'mobile-nav-settings',
    placement: 'top',
    shape: 'rounded',
    title: 'Pengaturan Aplikasi',
    description:
      'Sesuaikan tampilan tema terang/gelap, preferensi aplikasi, dan konfigurasi lainnya sesuai kenyamananmu.',
    icon: Settings,
  },
  {
    id: 'profile',
    targetId: 'mobile-nav-profile',
    placement: 'top',
    shape: 'rounded',
    title: 'Profil & Keamanan Akun',
    description:
      'Atur foto profil, data diri, hingga ubah kata sandi (password) dan keamanan akunmu di menu ini.',
    icon: UserIcon,
  },
];

interface TargetRectState {
  left: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  viewportWidth: number;
  viewportHeight: number;
}

interface HomeOnboardingTourProps {
  isActive: boolean;
  theme: 'dark' | 'light';
}

export const HomeOnboardingTour: React.FC<HomeOnboardingTourProps> = ({
  isActive,
  theme,
}) => {
  const isLight = theme === 'light';

  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HOME_TOUR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [isReady, setIsReady] = useState<boolean>(false);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [targetRect, setTargetRect] = useState<TargetRectState | null>(null);

  const completeTour = useCallback(() => {
    setIsDismissed(true);
    try {
      localStorage.setItem(HOME_TOUR_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage access restrictions
    }
  }, []);

  // Tunda sesaat agar animasi masuk dashboard dan posisi elemen stabil sebelum mengukur
  useEffect(() => {
    if (!isActive || isDismissed) {
      setIsReady(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsReady(true);
    }, 320);

    return () => clearTimeout(timer);
  }, [isActive, isDismissed]);

  const currentStep = TOUR_STEPS[stepIndex];

  // Pastikan elemen target (terutama kolom pencarian) terlihat di viewport saat langkahnya aktif
  useEffect(() => {
    if (!isReady || isDismissed || !isActive || !currentStep) return;
    const el = document.getElementById(currentStep.targetId);
    if (el && currentStep.placement === 'bottom') {
      const r = el.getBoundingClientRect();
      if (r.top < 12 || r.bottom > window.innerHeight - 120) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [isReady, isDismissed, isActive, currentStep]);

  const measureTarget = useCallback(() => {
    if (!isReady || isDismissed || !isActive || !currentStep) {
      setTargetRect(null);
      return;
    }

    const el = document.getElementById(currentStep.targetId);
    if (!el) {
      setTargetRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    // Jika elemen target tersembunyi (misal pada viewport desktop md+), jangan tampilkan overlay
    if (rect.width <= 0 || rect.height <= 0) {
      setTargetRect(null);
      return;
    }

    if (currentStep.shape === 'pill') {
      setTargetRect({
        left: rect.left,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      return;
    }

    const spotlightWidth = Math.min(Math.max(rect.width - 4, 54), 68);
    const spotlightHeight = Math.min(Math.max(rect.height - 8, 52), 60);
    const spotlightLeft = rect.left + (rect.width - spotlightWidth) / 2;
    const spotlightTop = rect.top + (rect.height - spotlightHeight) / 2;

    setTargetRect({
      left: spotlightLeft,
      top: spotlightTop,
      bottom: spotlightTop + spotlightHeight,
      width: spotlightWidth,
      height: spotlightHeight,
      centerX: rect.left + rect.width / 2,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
  }, [isReady, isDismissed, isActive, currentStep]);

  useEffect(() => {
    measureTarget();
    if (!isReady || isDismissed || !isActive) return;

    const handleReposition = () => measureTarget();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    const el = currentStep ? document.getElementById(currentStep.targetId) : null;
    let resizeObserver: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleReposition);
      resizeObserver.observe(el);
    }

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      resizeObserver?.disconnect();
    };
  }, [measureTarget, isReady, isDismissed, isActive, currentStep]);

  // Izinkan pengguna menekan Escape untuk melewati tur
  useEffect(() => {
    if (!isReady || isDismissed || !isActive || !targetRect) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        completeTour();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReady, isDismissed, isActive, targetRect, completeTour]);

  if (typeof document === 'undefined' || isDismissed || !isActive || !isReady || !targetRect || !currentStep) {
    return null;
  }

  const isLastStep = stepIndex === TOUR_STEPS.length - 1;
  const StepIcon = currentStep.icon;
  const isPillSpotlight = currentStep.shape === 'pill';
  const isBottomPlacement = currentStep.placement === 'bottom';

  // Hitung posisi kartu tooltip yang responsif & panah menunjuk tepat ke pusat elemen target
  const horizontalMargin = 14;
  const tooltipWidth = Math.min(340, targetRect.viewportWidth - horizontalMargin * 2);
  const idealLeft = targetRect.centerX - tooltipWidth / 2;
  const tooltipLeft = Math.max(
    horizontalMargin,
    Math.min(idealLeft, targetRect.viewportWidth - tooltipWidth - horizontalMargin)
  );
  const tooltipTop = Math.min(targetRect.bottom + 16, targetRect.viewportHeight - 240);
  const tooltipBottom = Math.max(16, targetRect.viewportHeight - targetRect.top + 16);
  const arrowLeft = Math.max(24, Math.min(targetRect.centerX - tooltipLeft, tooltipWidth - 24));

  const handleNext = () => {
    if (isLastStep) {
      completeTour();
    } else {
      setStepIndex((prev) => Math.min(prev + 1, TOUR_STEPS.length - 1));
    }
  };

  return createPortal(
    <AnimatePresence>
      <div
        id="home-onboarding-tour-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-tour-title"
        aria-describedby="home-tour-description"
        className="fixed inset-0 z-[80] overflow-hidden select-none"
      >
        {/* Spotlight Cutout + Backdrop Gelap Transparan di Luar Area Sorotan */}
        <motion.div
          key={`spotlight-${currentStep.id}`}
          initial={false}
          animate={{
            left: targetRect.left,
            top: targetRect.top,
            width: targetRect.width,
            height: targetRect.height,
          }}
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          style={{
            boxShadow: isLight
              ? '0 0 0 9999px rgba(15, 23, 42, 0.56)'
              : '0 0 0 9999px rgba(5, 8, 15, 0.68)',
          }}
          className={`fixed pointer-events-none ${isPillSpotlight ? 'rounded-full' : 'rounded-2xl'}`}
        >
          {/* Cincin Sorotan Putih / Abu-Abu Terang Statis */}
          <div
            aria-hidden="true"
            className={`absolute inset-0 ring-2 ring-white/85 shadow-[0_0_0_1px_rgba(203,213,225,0.45),0_0_24px_rgba(255,255,255,0.28)] ${
              isPillSpotlight ? 'rounded-full' : 'rounded-2xl'
            }`}
          />

          {/* Efek Pulse Halus Putih / Abu-Abu Netral (Tanpa Warna Hijau) */}
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0.7, scale: 1 }}
            animate={{
              opacity: [0.75, 0.15, 0.75],
              scale: isPillSpotlight ? [1, 1.025, 1] : [1, 1.14, 1],
            }}
            transition={{
              duration: 1.9,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className={`absolute -inset-1 ring-2 ring-slate-200/80 ${
              isPillSpotlight ? 'rounded-full' : 'rounded-[18px]'
            }`}
          />
        </motion.div>

        {/* Lapisan Klik Latar Belakang (Mencegah ketukan liar ke elemen luar selama tur) */}
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-auto bg-transparent"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Kartu Tooltip Panduan Bergaya Putih & Abu-Abu */}
        <motion.div
          key={`tooltip-card-${currentStep.id}`}
          initial={{ opacity: 0, y: isBottomPlacement ? -8 : 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: isBottomPlacement ? -6 : 8, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{
            left: tooltipLeft,
            ...(isBottomPlacement ? { top: tooltipTop } : { bottom: tooltipBottom }),
            width: tooltipWidth,
          }}
          className="fixed z-[82] pointer-events-auto"
        >
          <div
            className={`relative rounded-2xl p-4 sm:p-5 border transition-colors ${
              isLight
                ? 'bg-[#FFFFFF] border-slate-200 text-slate-900 shadow-[0_18px_48px_rgba(15,23,42,0.18)]'
                : 'bg-[#1F242D] border-white/15 text-white shadow-[0_20px_50px_rgba(0,0,0,0.55)]'
            }`}
          >
            {/* Panah Penunjuk Atas (untuk elemen di bagian atas seperti Pencarian) */}
            {isBottomPlacement && (
              <div
                aria-hidden="true"
                style={{ left: arrowLeft }}
                className={`absolute -top-[7px] -translate-x-1/2 w-3.5 h-3.5 rotate-45 border-l border-t ${
                  isLight
                    ? 'bg-[#FFFFFF] border-slate-200'
                    : 'bg-[#1F242D] border-white/15'
                }`}
              />
            )}

            {/* Header Baris: Indikator Langkah & Ikon */}
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={`w-7 h-7 rounded-xl flex items-center justify-center border shrink-0 ${
                    isLight
                      ? 'bg-slate-100 border-slate-200 text-slate-700'
                      : 'bg-white/10 border-white/15 text-slate-200'
                  }`}
                >
                  <StepIcon className="w-3.5 h-3.5 stroke-[2.2]" />
                </span>
                <span
                  className={`text-xs font-medium tabular-nums tracking-tight font-['Plus_Jakarta_Sans',sans-serif] ${
                    isLight ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  {stepIndex + 1} dari {TOUR_STEPS.length}
                </span>
              </div>

              {/* Indikator Progres Titik Netral (Putih / Abu-Abu) */}
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {TOUR_STEPS.map((step, idx) => {
                  const isCurrent = idx === stepIndex;
                  const isPassed = idx < stepIndex;
                  return (
                    <span
                      key={step.id}
                      className={`h-1.5 rounded-full transition-all duration-200 ${
                        isCurrent
                          ? isLight
                            ? 'w-4 bg-slate-900'
                            : 'w-4 bg-white'
                          : isPassed
                          ? isLight
                            ? 'w-1.5 bg-slate-400'
                            : 'w-1.5 bg-slate-400'
                          : isLight
                          ? 'w-1.5 bg-slate-200'
                          : 'w-1.5 bg-white/20'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Judul & Isi Penjelasan */}
            <h3
              id="home-tour-title"
              className={`text-[15px] font-bold tracking-tight leading-snug font-['Plus_Jakarta_Sans',sans-serif] ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {currentStep.title}
            </h3>

            <p
              id="home-tour-description"
              className={`mt-1.5 text-[13px] leading-relaxed font-['Plus_Jakarta_Sans',sans-serif] ${
                isLight ? 'text-slate-600' : 'text-slate-300'
              }`}
            >
              {currentStep.description}
            </p>

            {/* Footer Aksi: Tombol Lewati & Lanjut / Selesai */}
            <div
              className={`mt-4 pt-3 border-t flex items-center justify-between gap-3 ${
                isLight ? 'border-slate-100' : 'border-white/10'
              }`}
            >
              <button
                type="button"
                id="btn-home-tour-skip"
                onClick={completeTour}
                className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer font-['Plus_Jakarta_Sans',sans-serif] ${
                  isLight
                    ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/10'
                }`}
              >
                Lewati
              </button>

              <button
                type="button"
                id="btn-home-tour-next"
                onClick={handleNext}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] shadow-xs font-['Plus_Jakarta_Sans',sans-serif] ${
                  isLight
                    ? 'bg-slate-900 hover:bg-slate-800 text-white'
                    : 'bg-white hover:bg-slate-100 text-slate-900'
                }`}
              >
                <span>{isLastStep ? 'Selesai' : 'Lanjut'}</span>
                {isLastStep ? (
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5 stroke-[2.4]" />
                )}
              </button>
            </div>

            {/* Panah Penunjuk Bawah (untuk ikon navigasi di bilah bawah) */}
            {!isBottomPlacement && (
              <div
                aria-hidden="true"
                style={{ left: arrowLeft }}
                className={`absolute -bottom-[7px] -translate-x-1/2 w-3.5 h-3.5 rotate-45 border-r border-b ${
                  isLight
                    ? 'bg-[#FFFFFF] border-slate-200'
                    : 'bg-[#1F242D] border-white/15'
                }`}
              />
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
