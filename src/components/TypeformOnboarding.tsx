import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Bell,
  Mic,
  Camera,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  CornerDownLeft,
  Download,
  Globe,
  ExternalLink,
} from 'lucide-react';
import { OnboardingFocus } from '../types';
import { AscendBrand } from './AscendBrand';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  getNotificationPermissionStatus,
  getMicrophoneAndCameraPermissionStatus,
  hasPassedDevicePermissionsOnboarding,
  isWebNotificationSupported,
  markDevicePermissionsOnboardingPassed,
  requestMicrophoneAndCameraPermissions,
  saveNotificationSettings,
  setDismissedPermissionPrompt,
} from '../utils/notifications';

export interface OnboardingResult {
  nickname: string;
  primaryFocus: OnboardingFocus;
  reminderEnabled: boolean;
  notificationPermission: 'granted' | 'denied' | 'default' | 'unsupported';
  microphoneGranted?: boolean;
  cameraGranted?: boolean;
}

interface TypeformOnboardingProps {
  initialName?: string;
  onComplete: (result: OnboardingResult) => void;
}

interface FocusOption {
  key: 'A' | 'B' | 'C' | 'D';
  value: OnboardingFocus;
  label: string;
  description: string;
}

const FOCUS_OPTIONS: FocusOption[] = [
  {
    key: 'A',
    value: 'productivity',
    label: 'Produktivitas & Tugas',
    description: 'Atur agenda dan tuntaskan target harian.',
  },
  {
    key: 'B',
    value: 'habits',
    label: 'Membangun Kebiasaan',
    description: 'Jaga rutinitas harian dan streak tetap konsisten.',
  },
  {
    key: 'C',
    value: 'finance',
    label: 'Manajemen Keuangan',
    description: 'Catat pemasukan, pengeluaran, dan tabungan.',
  },
  {
    key: 'D',
    value: 'all',
    label: 'Semua Sekaligus',
    description: 'Kelola tugas, kebiasaan, dan keuangan sekaligus.',
  },
];

const TOTAL_FORM_STEPS = 4; // 0: Notifikasi, 1: Nama, 2: Fokus, 3: Selesai

const isPlaceholderName = (raw?: string): boolean => {
  if (!raw) return true;
  const cleaned = raw.trim().toLowerCase();
  return (
    cleaned === '' ||
    cleaned === 'pengguna' ||
    cleaned === 'pengguna ascend' ||
    cleaned === 'pengguna baru' ||
    cleaned === 'tamu ascend'
  );
};

export const TypeformOnboarding: React.FC<TypeformOnboardingProps> = ({
  initialName,
  onComplete,
}) => {
  const prefersReducedMotion = useReducedMotion();

  const [theme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('ascend_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return 'light';
  });

  const isLight = theme === 'light';

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('ascend_theme', theme);
    } catch {}
  }, [theme]);

  const [permissionsStepPassed, setPermissionsStepPassed] = useState<boolean>(() =>
    hasPassedDevicePermissionsOnboarding()
  );
  const minStep = permissionsStepPassed ? 1 : 0;

  // Step 0: Notification Consent, Step 1: Nickname, Step 2: Focus (A/B/C/D), Step 3: Completion
  const [step, setStep] = useState<number>(() =>
    hasPassedDevicePermissionsOnboarding() ? 1 : 0
  );
  const [direction, setDirection] = useState<1 | -1>(1);

  const [nickname, setNickname] = useState<string>(() =>
    isPlaceholderName(initialName) ? '' : (initialName || '').trim()
  );
  const [nameError, setNameError] = useState<string | null>(null);

  const [primaryFocus, setPrimaryFocus] = useState<OnboardingFocus | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(false);
  const [notificationPermission, setNotificationPermission] = useState<
    'granted' | 'denied' | 'default' | 'unsupported'
  >(() => getNotificationPermissionStatus());
  const [micGranted, setMicGranted] = useState<boolean>(false);
  const [camGranted, setCamGranted] = useState<boolean>(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const {
    isInstallable,
    isInstalled,
    isAlreadyOnDevice,
    isInIframe,
    isInstalling,
    installWithOutcome,
  } = usePWAInstall();
  const [installSuccess, setInstallSuccess] = useState<boolean>(false);
  const [installStatusMsg, setInstallStatusMsg] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearAutoAdvanceTimer();
  }, [clearAutoAdvanceTimer]);

  // Auto-focus input when arriving on nickname step
  useEffect(() => {
    if (step === 1) {
      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
      }, 160);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const goToStep = useCallback(
    (targetStep: number) => {
      clearAutoAdvanceTimer();
      const clamped = Math.max(minStep, Math.min(TOTAL_FORM_STEPS - 1, targetStep));
      if (clamped === step) return;
      setDirection(clamped > step ? 1 : -1);
      setStep(clamped);
    },
    [clearAutoAdvanceTimer, minStep, step]
  );

  // Step 0 Handler: Request Native Browser Notification, Microphone, and Camera Permissions
  const handleAllowNotifications = async () => {
    if (isRequestingPermission) return;
    setIsRequestingPermission(true);

    let finalPerm: 'granted' | 'denied' | 'default' | 'unsupported' =
      getNotificationPermissionStatus();

    try {
      // 1. Pemicu izin Notifikasi asli browser
      if (isWebNotificationSupported()) {
        finalPerm = await Notification.requestPermission();
      } else {
        finalPerm = 'unsupported';
      }
    } catch {
      finalPerm = getNotificationPermissionStatus();
    }

    // 2. Pemicu izin Mikrofon ({ audio: true }) & Kamera ({ video: true }), lalu stop track segera
    const mediaResult = await requestMicrophoneAndCameraPermissions();
    setMicGranted(mediaResult.microphone);
    setCamGranted(mediaResult.camera);

    const granted = finalPerm === 'granted';
    setNotificationPermission(finalPerm);
    setReminderEnabled(granted);

    saveNotificationSettings({
      enabled: granted,
      agendaReminders: granted,
      agendaPreCutoffReminder: granted,
      habitReminders: granted,
      targetReminders: granted,
    });
    setDismissedPermissionPrompt(!granted);
    markDevicePermissionsOnboardingPassed();
    setPermissionsStepPassed(true);

    setIsRequestingPermission(false);
    setDirection(1);
    setStep(1);
  };

  const handleSkipNotifications = async () => {
    if (isRequestingPermission) return;
    const currentPerm = getNotificationPermissionStatus();
    setNotificationPermission(currentPerm);
    setReminderEnabled(false);

    try {
      const mediaStatus = await getMicrophoneAndCameraPermissionStatus();
      setMicGranted(mediaStatus.microphone);
      setCamGranted(mediaStatus.camera);
    } catch {}

    saveNotificationSettings({
      enabled: false,
      agendaReminders: false,
      agendaPreCutoffReminder: false,
      habitReminders: false,
      targetReminders: false,
    });
    setDismissedPermissionPrompt(true);
    markDevicePermissionsOnboardingPassed();
    setPermissionsStepPassed(true);

    setDirection(1);
    setStep(1);
  };

  const handleNicknameNext = useCallback(() => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setNameError('Isi nama panggilanmu dulu.');
      nameInputRef.current?.focus();
      return;
    }
    setNameError(null);
    goToStep(2);
  }, [goToStep, nickname]);

  const handleSelectFocusOption = useCallback(
    (optionValue: OnboardingFocus) => {
      clearAutoAdvanceTimer();
      setPrimaryFocus(optionValue);
      autoAdvanceTimerRef.current = setTimeout(() => {
        setDirection(1);
        setStep(3);
      }, 260);
    },
    [clearAutoAdvanceTimer]
  );

  const handleFinish = useCallback(() => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const cleanNickname = nickname.trim() || 'Sahabat Ascend';
    const chosenFocus = primaryFocus || 'all';
    onComplete({
      nickname: cleanNickname,
      primaryFocus: chosenFocus,
      reminderEnabled,
      notificationPermission,
      microphoneGranted: micGranted,
      cameraGranted: camGranted,
    });
  }, [
    camGranted,
    isSubmitting,
    micGranted,
    nickname,
    notificationPermission,
    onComplete,
    primaryFocus,
    reminderEnabled,
  ]);

  const topLevelInstallUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?action=install`
      : '/?action=install';

  const handleDownloadAppClick = async () => {
    setInstallStatusMsg(null);
    if (isAlreadyOnDevice || isInstalled) {
      setInstallSuccess(true);
      setTimeout(() => {
        handleFinish();
      }, 900);
      return;
    }

    const outcome = await installWithOutcome();
    if (outcome === 'accepted') {
      setInstallSuccess(true);
      setTimeout(() => {
        handleFinish();
      }, 900);
      return;
    }

    if (outcome === 'dismissed') {
      setInstallStatusMsg('Instalasi batal. Coba lagi atau lanjut di Chrome.');
      return;
    }

    setInstallStatusMsg(
      'Dialog instalasi belum tersedia. Pastikan tidak di mode samaran atau lanjut di Chrome.'
    );
  };

  const canGoForward =
    (step === 0 && !isRequestingPermission) ||
    (step === 1 && nickname.trim().length > 0) ||
    (step === 2 && primaryFocus !== null);

  const handleDownNav = useCallback(() => {
    if (step === 0) {
      handleSkipNotifications();
    } else if (step === 1) {
      handleNicknameNext();
    } else if (step === 2 && primaryFocus) {
      goToStep(3);
    }
  }, [goToStep, handleNicknameNext, primaryFocus, step]);

  // Keyboard shortcuts: Enter, A/B/C/D, ArrowUp/ArrowDown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const isTypingInInput =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (e.key === 'Enter') {
        if (step === 1) {
          e.preventDefault();
          handleNicknameNext();
          return;
        }
        if (step === 2 && primaryFocus) {
          e.preventDefault();
          goToStep(3);
          return;
        }
        if (step === 3) {
          e.preventDefault();
          handleFinish();
          return;
        }
      }

      if (step === 2 && !isTypingInInput) {
        const keyUpper = e.key.toUpperCase();
        const matched = FOCUS_OPTIONS.find((opt) => opt.key === keyUpper);
        if (matched) {
          e.preventDefault();
          handleSelectFocusOption(matched.value);
          return;
        }
      }

      if (!isTypingInInput) {
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && step > minStep) {
          e.preventDefault();
          goToStep(step - 1);
        } else if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && canGoForward) {
          e.preventDefault();
          handleDownNav();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canGoForward,
    goToStep,
    handleDownNav,
    handleFinish,
    handleNicknameNext,
    handleSelectFocusOption,
    minStep,
    primaryFocus,
    step,
  ]);

  // Progress bar percentage across steps (25% -> 50% -> 75% -> 100%)
  const progressPercent = Math.round(((step + 1) / TOTAL_FORM_STEPS) * 100);
  const selectedFocusLabel =
    FOCUS_OPTIONS.find((o) => o.value === primaryFocus)?.label || 'Semua Sekaligus';

  const slideOffset = prefersReducedMotion ? 0 : 44;
  const slideVariants = {
    enter: (dir: number) => ({
      y: dir > 0 ? slideOffset : -slideOffset,
      opacity: 0,
    }),
    center: {
      y: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      y: dir > 0 ? -slideOffset : slideOffset,
      opacity: 0,
    }),
  };

  return (
    <div
      id="typeform-onboarding-screen"
      className={`min-h-screen w-full flex flex-col justify-between relative overflow-hidden transition-colors duration-200 ${
        isLight ? 'bg-[#F7FAF9] text-[#073228]' : 'bg-[#061412] text-[#ECFDF5]'
      }`}
    >
      {/* Ambient subtle radial teal aura (non-distracting) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div
          className="absolute -top-40 right-[-10%] w-[520px] h-[520px] rounded-full blur-3xl opacity-25"
          style={{
            background: isLight
              ? 'radial-gradient(circle, rgba(38,166,154,0.22) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(38,166,154,0.18) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute -bottom-48 left-[-10%] w-[480px] h-[480px] rounded-full blur-3xl opacity-20"
          style={{
            background: isLight
              ? 'radial-gradient(circle, rgba(7,50,40,0.14) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(7,50,40,0.45) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Top Fixed Progress Bar */}
      <div
        className={`fixed top-0 left-0 right-0 h-2 z-40 ${
          isLight ? 'bg-[#D3E8E2]' : 'bg-[#10332C]'
        }`}
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progres pengisian ${progressPercent}%`}
      >
        <div
          className="h-full rounded-r-full transition-[width] duration-300 ease-out"
          style={{
            width: `${progressPercent}%`,
            background: isLight
              ? 'linear-gradient(90deg, #073228 0%, #0E6B5B 45%, #26A69A 100%)'
              : 'linear-gradient(90deg, #0E6B5B 0%, #26A69A 55%, #5EEAD4 100%)',
            boxShadow: isLight
              ? '0 1px 6px rgba(38, 166, 154, 0.35)'
              : '0 0 12px rgba(45, 212, 191, 0.55)',
          }}
        />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-20 w-full max-w-5xl mx-auto px-5 sm:px-8 pt-6 pb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 sm:gap-3 whitespace-nowrap shrink-0">
          {step > minStep && (
            <button
              type="button"
              onClick={() => goToStep(step - 1)}
              disabled={isRequestingPermission}
              aria-label="Kembali ke pertanyaan sebelumnya"
              title="Kembali (Panah Kiri)"
              className={`min-h-[40px] min-w-[36px] -ml-1.5 flex items-center justify-center bg-transparent border-0 shadow-none transition-transform hover:-translate-x-0.5 active:scale-95 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                isLight
                  ? 'text-[#073228] hover:text-[#26A69A]'
                  : 'text-teal-200 hover:text-white'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <AscendBrand size="sm" theme={theme} />
        </div>

        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <div
            className={`text-xs font-medium tabular-nums whitespace-nowrap flex items-center gap-2 ${
              isLight ? 'text-slate-600' : 'text-teal-200/75'
            }`}
          >
            <span>
              {step + 1} / {TOTAL_FORM_STEPS}
            </span>
          </div>
        </div>
      </header>

      {/* Main Centered Typeform Question Viewport */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-8 py-6 pb-24">
        <div className="w-full max-w-2xl mx-auto">
          <AnimatePresence mode="wait" custom={direction}>
            {step === 0 && (
              <motion.section
                key="step-notification"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-6"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#26A69A] tabular-nums">
                    <span>01</span>
                    <span aria-hidden="true">·</span>
                    <span>Izin Perangkat</span>
                  </div>

                  <div className="flex items-start gap-4">
                    <div
                      className={`hidden sm:flex w-12 h-12 rounded-2xl shrink-0 items-center justify-center border mt-1 ${
                        isLight
                          ? 'bg-[#E6F5F2] border-[#BCE3DA] text-[#073228]'
                          : 'bg-[#0D2B24] border-[#1E4F45] text-[#26A69A]'
                      }`}
                    >
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <h1
                      className="text-2xl sm:text-3xl md:text-[34px] font-bold tracking-tight leading-[1.28]"
                      style={{ textWrap: 'balance' }}
                    >
                      Izinkan notifikasi, mikrofon, dan kamera?
                    </h1>
                  </div>

                  <p
                    className={`text-sm sm:text-base leading-relaxed max-w-xl ${
                      isLight ? 'text-slate-600' : 'text-slate-300/90'
                    }`}
                  >
                    Untuk pengingat harian, catatan suara, dan pindai struk. Bisa diubah kapan saja.
                  </p>

                  <div
                    className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium pt-0.5 ${
                      isLight ? 'text-[#0E7469]' : 'text-teal-300/90'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5" />
                      Notifikasi
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5" />
                      Mikrofon
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5" />
                      Kamera
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                  <button
                    id="btn-onboarding-allow-notif"
                    type="button"
                    disabled={isRequestingPermission}
                    onClick={handleAllowNotifications}
                    className="min-h-[48px] px-6 py-3 rounded-xl font-semibold text-sm text-white shadow-lg shadow-[#073228]/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5 disabled:opacity-70 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26A69A] focus-visible:ring-offset-2"
                    style={{
                      background: 'linear-gradient(135deg, #26A69A 0%, #0B5345 60%, #073228 100%)',
                    }}
                  >
                    {isRequestingPermission ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menunggu izin...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Izinkan Akses</span>
                      </>
                    )}
                  </button>

                  <button
                    id="btn-onboarding-skip-notif"
                    type="button"
                    disabled={isRequestingPermission}
                    onClick={handleSkipNotifications}
                    className={`min-h-[48px] px-6 py-3 rounded-xl font-semibold text-sm border transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shrink-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26A69A] ${
                      isLight
                        ? 'bg-white border-[#D6E6E0] text-slate-700 hover:bg-[#EDF6F3] hover:text-[#073228]'
                        : 'bg-[#0B221D] border-[#1A423A] text-slate-200 hover:bg-[#113029] hover:text-white'
                    }`}
                  >
                    Nanti Saja
                  </button>
                </div>
              </motion.section>
            )}

            {step === 1 && (
              <motion.section
                key="step-nickname"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-6"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#26A69A] tabular-nums">
                    <span>02</span>
                    <span aria-hidden="true">·</span>
                    <span>Nama Panggilan</span>
                  </div>

                  <h1
                    className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight leading-[1.25]"
                    style={{ textWrap: 'balance' }}
                  >
                    Boleh tahu siapa panggilanmu?
                  </h1>

                  <p
                    className={`text-sm sm:text-base leading-relaxed ${
                      isLight ? 'text-slate-600' : 'text-slate-300/85'
                    }`}
                  >
                    Untuk menyapamu.
                  </p>
                </div>

                <div className="pt-2 space-y-2">
                  <label htmlFor="onboarding-nickname-input" className="sr-only">
                    Nama panggilan Anda
                  </label>
                  <input
                    id="onboarding-nickname-input"
                    ref={nameInputRef}
                    type="text"
                    value={nickname}
                    onChange={(e) => {
                      setNickname(e.target.value);
                      if (nameError) setNameError(null);
                    }}
                    placeholder="Tulis nama panggilanmu..."
                    maxLength={40}
                    autoComplete="given-name"
                    className={`w-full bg-transparent border-b-2 py-3 text-xl sm:text-2xl md:text-3xl font-semibold outline-none transition-colors ${
                      isLight
                        ? 'border-[#C2DCD4] text-[#073228] placeholder:text-slate-400 focus:border-[#26A69A]'
                        : 'border-[#1C4A40] text-white placeholder:text-slate-500 focus:border-[#26A69A]'
                    }`}
                  />
                  {nameError && (
                    <p className="text-xs font-medium text-rose-500 pt-1">{nameError}</p>
                  )}
                </div>

                <div className="flex items-center gap-4 pt-2">
                  <button
                    id="btn-onboarding-name-next"
                    type="button"
                    onClick={handleNicknameNext}
                    className="min-h-[46px] px-6 py-2.5 rounded-xl font-semibold text-sm text-white shadow-md shadow-[#073228]/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26A69A]"
                    style={{
                      background: 'linear-gradient(135deg, #26A69A 0%, #0B5345 60%, #073228 100%)',
                    }}
                  >
                    <span>Lanjut</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <span
                    className={`hidden sm:inline-flex items-center gap-1.5 text-xs ${
                      isLight ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    <span>tekan</span>
                    <kbd
                      className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold inline-flex items-center gap-1 ${
                        isLight
                          ? 'bg-white border-slate-300 text-slate-700'
                          : 'bg-[#0B221D] border-[#1A423A] text-teal-200'
                      }`}
                    >
                      Enter <CornerDownLeft className="w-3 h-3" />
                    </kbd>
                  </span>
                </div>
              </motion.section>
            )}

            {step === 2 && (
              <motion.section
                key="step-focus"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-6"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[#26A69A] tabular-nums">
                    <span>03</span>
                    <span aria-hidden="true">·</span>
                    <span>Fokus Utama</span>
                  </div>

                  <h1
                    className="text-2xl sm:text-3xl md:text-[34px] font-bold tracking-tight leading-[1.25]"
                    style={{ textWrap: 'balance' }}
                  >
                    {nickname.trim()
                      ? `Apa fokus utamamu, ${nickname.trim()}?`
                      : 'Apa fokus utama Anda?'}
                  </h1>

                  <p
                    className={`text-sm sm:text-base leading-relaxed ${
                      isLight ? 'text-slate-600' : 'text-slate-300/85'
                    }`}
                  >
                    Pilih satu atau tekan huruf A–D.
                  </p>
                </div>

                <div className="space-y-2.5" role="radiogroup" aria-label="Fokus utama penggunaan aplikasi">
                  {FOCUS_OPTIONS.map((option) => {
                    const isSelected = primaryFocus === option.value;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => handleSelectFocusOption(option.value)}
                        className={`w-full min-h-[60px] p-3.5 sm:p-4 rounded-2xl border text-left transition-all duration-150 cursor-pointer flex items-center gap-3.5 group active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26A69A] ${
                          isSelected
                            ? isLight
                              ? 'bg-[#E6F5F2] border-[#26A69A] text-[#073228] shadow-sm'
                              : 'bg-[#0F352E] border-[#26A69A] text-white shadow-sm'
                            : isLight
                            ? 'bg-white border-[#D9EAE4] text-[#073228] hover:border-[#26A69A]/70 hover:bg-[#F3FAF8]'
                            : 'bg-[#0B221D] border-[#1A423A] text-slate-100 hover:border-[#26A69A]/60 hover:bg-[#0F2C26]'
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 border transition-colors ${
                            isSelected
                              ? 'bg-[#26A69A] border-[#26A69A] text-white'
                              : isLight
                              ? 'bg-[#F3FAF8] border-[#CBE2DA] text-[#073228] group-hover:border-[#26A69A]'
                              : 'bg-[#071915] border-[#235449] text-[#5EEAD4] group-hover:border-[#26A69A]'
                          }`}
                        >
                          {option.key}
                        </span>

                        <div className="flex-1 min-w-0">
                          <div className="text-sm sm:text-base font-semibold leading-snug">
                            {option.label}
                          </div>
                          <div
                            className={`text-xs mt-0.5 leading-relaxed ${
                              isLight ? 'text-slate-600' : 'text-slate-300/80'
                            }`}
                          >
                            {option.description}
                          </div>
                        </div>

                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-opacity ${
                            isSelected ? 'opacity-100 text-[#26A69A]' : 'opacity-0'
                          }`}
                        >
                          <Check className="w-4 h-4 stroke-[2.75]" />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {primaryFocus && (
                  <div className="flex items-center gap-4 pt-1">
                    <button
                      type="button"
                      onClick={() => goToStep(3)}
                      className="min-h-[46px] px-6 py-2.5 rounded-xl font-semibold text-sm text-white shadow-md shadow-[#073228]/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0"
                      style={{
                        background: 'linear-gradient(135deg, #26A69A 0%, #0B5345 60%, #073228 100%)',
                      }}
                    >
                      <span>Lanjut</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </motion.section>
            )}

            {step === 3 && (
              <motion.section
                key="step-complete"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-6"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[#073228]/25"
                  style={{
                    background: 'linear-gradient(135deg, #26A69A 0%, #0E6B5B 55%, #073228 100%)',
                  }}
                >
                  <CheckCircle2 className="w-7 h-7" />
                </div>

                <div className="space-y-3">
                  <h1
                    className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.2]"
                    style={{ textWrap: 'balance' }}
                  >
                    Terima kasih, {nickname.trim() || 'Teman'}!
                  </h1>
                  <p
                    className={`text-sm sm:text-base leading-relaxed max-w-xl ${
                      isLight ? 'text-slate-600' : 'text-slate-300/90'
                    }`}
                  >
                    Semua sudah siap. Mari mulai hari produktif Anda.
                  </p>
                </div>

                {/* Clean unboxed typographic summary (no pill clutter) */}
                <div
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm py-3 border-y ${
                    isLight
                      ? 'border-[#DDECE7] text-slate-600'
                      : 'border-[#163831] text-slate-300'
                  }`}
                >
                  <span>
                    Fokus: <strong className={isLight ? 'text-[#073228]' : 'text-white'}>{selectedFocusLabel}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Notifikasi:{' '}
                    <strong className={isLight ? 'text-[#073228]' : 'text-white'}>
                      {reminderEnabled ? 'Aktif' : 'Nonaktif'}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Mikrofon:{' '}
                    <strong className={isLight ? 'text-[#073228]' : 'text-white'}>
                      {micGranted ? 'Aktif' : 'Nonaktif'}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Kamera:{' '}
                    <strong className={isLight ? 'text-[#073228]' : 'text-white'}>
                      {camGranted ? 'Aktif' : 'Nonaktif'}
                    </strong>
                  </span>
                </div>

                {/* Integrated Final Action: Download Aplikasi atau Lanjutkan di Chrome / Mulai Sekarang */}
                {installSuccess ? (
                  <div
                    className={`p-5 rounded-2xl border space-y-3 ${
                      isLight
                        ? 'bg-[#E6F5F2] border-[#26A69A]/50 text-[#073228]'
                        : 'bg-[#0D2B24] border-[#26A69A]/50 text-emerald-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#26A69A] shrink-0" />
                      <div>
                        <p className="text-sm font-bold">Aplikasi terpasang!</p>
                        <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-teal-200/80'}`}>
                          Membuka dasbor...
                        </p>
                      </div>
                    </div>
                    <button
                      id="btn-onboarding-start-now"
                      type="button"
                      onClick={handleFinish}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-white inline-flex items-center gap-2 cursor-pointer"
                      style={{
                        background: 'linear-gradient(135deg, #26A69A 0%, #0B5345 60%, #073228 100%)',
                      }}
                    >
                      <span>Mulai Sekarang</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : isInstalled || isAlreadyOnDevice ? (
                  <div className="flex items-center gap-4 pt-1">
                    <button
                      id="btn-onboarding-start-now"
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleFinish}
                      className="min-h-[48px] px-7 py-3 rounded-xl font-semibold text-sm sm:text-base text-white shadow-lg shadow-[#073228]/25 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26A69A] focus-visible:ring-offset-2"
                      style={{
                        background: 'linear-gradient(135deg, #26A69A 0%, #0B5345 60%, #073228 100%)',
                      }}
                    >
                      <span>Mulai Sekarang</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <span
                      className={`hidden sm:inline-flex items-center gap-1.5 text-xs ${
                        isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      <span>tekan</span>
                      <kbd
                        className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold inline-flex items-center gap-1 ${
                          isLight
                            ? 'bg-white border-slate-300 text-slate-700'
                            : 'bg-[#0B221D] border-[#1A423A] text-teal-200'
                        }`}
                      >
                        Enter <CornerDownLeft className="w-3 h-3" />
                      </kbd>
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    {isInIframe && !isInstallable ? (
                      <a
                        id="btn-entry-download-app"
                        href={topLevelInstallUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group w-full min-h-[64px] p-4 rounded-2xl text-white shadow-lg shadow-[#073228]/25 hover:brightness-110 active:scale-[0.99] transition-all border border-[#26A69A]/40 flex items-center gap-3.5 cursor-pointer"
                        style={{
                          background: 'linear-gradient(135deg, #26A69A 0%, #0B5345 60%, #073228 100%)',
                        }}
                      >
                        <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                          <Download className="w-5 h-5 text-emerald-100" />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="text-sm sm:text-base font-bold leading-snug">
                            Download Aplikasi
                          </div>
                          <div className="text-xs text-emerald-100/85 mt-0.5 leading-relaxed">
                            Pasang langsung ke perangkat Anda.
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-emerald-100 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                      </a>
                    ) : (
                      <button
                        id="btn-entry-download-app"
                        type="button"
                        disabled={isInstalling}
                        onClick={handleDownloadAppClick}
                        className="group w-full min-h-[64px] p-4 rounded-2xl text-white shadow-lg shadow-[#073228]/25 hover:brightness-110 active:scale-[0.99] transition-all border border-[#26A69A]/40 disabled:opacity-70 flex items-center gap-3.5 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26A69A]"
                        style={{
                          background: 'linear-gradient(135deg, #26A69A 0%, #0B5345 60%, #073228 100%)',
                        }}
                      >
                        <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                          {isInstalling ? (
                            <Loader2 className="w-5 h-5 text-emerald-100 animate-spin" />
                          ) : (
                            <Download className="w-5 h-5 text-emerald-100" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm sm:text-base font-bold leading-snug">
                            {isInstalling ? 'Memasang...' : 'Download Aplikasi'}
                          </div>
                          <div className="text-xs text-emerald-100/85 mt-0.5 leading-relaxed">
                            Pasang langsung ke perangkat Anda.
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-emerald-100 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    )}

                    {installStatusMsg && (
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400 px-1 leading-relaxed">
                        {installStatusMsg}
                      </p>
                    )}

                    <button
                      id="btn-onboarding-start-now"
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleFinish}
                      className={`group w-full min-h-[64px] p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3.5 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26A69A] ${
                        isLight
                          ? 'bg-white border-[#D9EAE4] text-[#073228] hover:border-[#26A69A]/70 hover:bg-[#F3FAF8]'
                          : 'bg-[#0B221D] border-[#1A423A] text-slate-100 hover:border-[#26A69A]/60 hover:bg-[#0F2C26]'
                      }`}
                    >
                      <div
                        className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
                          isLight
                            ? 'bg-[#F3FAF8] border-[#CBE2DA] text-[#0E7469]'
                            : 'bg-[#071915] border-[#235449] text-[#5EEAD4]'
                        }`}
                      >
                        <Globe className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm sm:text-base font-bold leading-snug">
                          Lanjutkan di Chrome · Mulai Sekarang
                        </div>
                        <div
                          className={`text-xs mt-0.5 leading-relaxed ${
                            isLight ? 'text-slate-600' : 'text-slate-300/80'
                          }`}
                        >
                          Masuk ke dasbor langsung lewat browser.
                        </div>
                      </div>
                      <ArrowRight
                        className={`w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform ${
                          isLight ? 'text-slate-400 group-hover:text-[#073228]' : 'text-slate-400 group-hover:text-white'
                        }`}
                      />
                    </button>

                    <div
                      className={`hidden sm:flex items-center gap-1.5 text-xs pt-1 ${
                        isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      <span>atau tekan</span>
                      <kbd
                        className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold inline-flex items-center gap-1 ${
                          isLight
                            ? 'bg-white border-slate-300 text-slate-700'
                            : 'bg-[#0B221D] border-[#1A423A] text-teal-200'
                        }`}
                      >
                        Enter <CornerDownLeft className="w-3 h-3" />
                      </kbd>
                      <span>untuk lanjut di Chrome</span>
                    </div>
                  </div>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};
