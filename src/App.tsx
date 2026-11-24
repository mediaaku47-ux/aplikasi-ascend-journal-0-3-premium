import { useState, useEffect, useCallback } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { MainDashboard } from './components/MainDashboard';
import { AppEntryChoiceModal } from './components/AppEntryChoiceModal';
import { TypeformOnboarding, OnboardingResult } from './components/TypeformOnboarding';
import { authService, dbService, isValidSupabaseUserId } from './lib/supabaseService';
import { isSupabaseConfigured } from './lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { OnboardingFocus, UserProfile } from './types';
import { initialUserProfile } from './data/initialData';
import { getRealToday } from './utils/dateUtils';
import { CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from './hooks/usePWAInstall';

const ONBOARDING_DONE_KEY = 'ascend_onboarding_v1_completed';

const getFocusGreetingSubtitle = (focus: OnboardingFocus): string => {
  switch (focus) {
    case 'productivity':
      return 'Fokus menuntaskan agenda harian dan target prioritas Anda hari ini.';
    case 'habits':
      return 'Jaga konsistensi rutinitas harian dan pertahankan streak terbaik Anda.';
    case 'finance':
      return 'Pantau arus kas, pengeluaran, dan perkembangan tabungan Anda dengan rapi.';
    default:
      return 'Kelola agenda, kebiasaan, dan keuangan Anda hari ini.';
  }
};

const getOnboardingStorageKey = (userId?: string) =>
  userId ? `${ONBOARDING_DONE_KEY}_${userId}` : ONBOARDING_DONE_KEY;

const hasCompletedOnboardingForUser = (user?: SupabaseUser | null): boolean => {
  if (typeof window === 'undefined') return false;
  if (user?.user_metadata?.onboarding_completed === true) {
    return true;
  }
  try {
    const userKey = getOnboardingStorageKey(user?.id);
    if (localStorage.getItem(userKey) === 'true') return true;
    if (!isValidSupabaseUserId(user?.id) && localStorage.getItem(ONBOARDING_DONE_KEY) === 'true') {
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

const getFallbackDefaultUser = (): SupabaseUser => {
  let createdAt = '';
  try {
    createdAt = localStorage.getItem('ascend_account_created_at') || '';
    if (!createdAt || createdAt === '2026-01-01T00:00:00.000Z') {
      createdAt = new Date().toISOString();
      localStorage.setItem('ascend_account_created_at', createdAt);
    }
  } catch {
    createdAt = new Date().toISOString();
  }

  return {
    id: 'local-default-user',
    app_metadata: {},
    user_metadata: { full_name: 'Pengguna Ascend' },
    aud: 'authenticated',
    created_at: createdAt,
  } as SupabaseUser;
};

export default function App() {
  const { isInstalled } = usePWAInstall();

  const [currentUser, setCurrentUser] = useState<SupabaseUser>(() => {
    try {
      const cached = localStorage.getItem('journalstream_current_user');
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return getFallbackDefaultUser();
  });

  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(() => {
    try {
      const cached = localStorage.getItem('journalstream_user_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [isAuthFlowOpen, setIsAuthFlowOpen] = useState<boolean>(() => {
    try {
      const hasCompleted = localStorage.getItem('journalstream_has_completed_welcome');
      return !hasCompleted;
    } catch {
      return true;
    }
  });

  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(() => {
    try {
      const cachedUserRaw = localStorage.getItem('journalstream_current_user');
      const cachedUser = cachedUserRaw ? (JSON.parse(cachedUserRaw) as SupabaseUser) : null;
      return !hasCompletedOnboardingForUser(cachedUser);
    } catch {
      return true;
    }
  });

  const [openedViaInstallAction] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('action') === 'install';
    } catch {
      return false;
    }
  });

  const [showEntryChoiceModal, setShowEntryChoiceModal] = useState<boolean>(openedViaInstallAction);

  const [pendingForceOnboarding, setPendingForceOnboarding] = useState<boolean>(false);
  const [pendingWelcomeToast, setPendingWelcomeToast] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // Bersihkan query parameter ?action=install dari URL setelah dibaca, atau tutup otomatis jika sudah standalone
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'install') {
        window.history.replaceState({}, '', window.location.pathname);
        if (isInstalled) {
          setShowEntryChoiceModal(false);
        }
      }
    } catch {
      // ignore
    }
  }, [isInstalled]);

  // Pengecekan sesi Supabase berjalan murni secara asynchronous di latar belakang tanpa menahan render
  useEffect(() => {
    let isMounted = true;

    const syncSessionInBackground = async () => {
      try {
        if (!isSupabaseConfigured()) return;

        const session = await authService.getSession().catch(() => null);
        if (!isMounted || !session?.user) return;

        setCurrentUser(session.user);
        try {
          localStorage.setItem('journalstream_current_user', JSON.stringify(session.user));
        } catch {}

        if (session.user.user_metadata?.onboarding_completed === true) {
          try {
            localStorage.setItem(getOnboardingStorageKey(session.user.id), 'true');
            localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
          } catch {}
          setNeedsOnboarding(false);
        }

        const profile = await dbService.ensureUserProfileInitialized(
          session.user.id,
          session.user.email,
          session.user.user_metadata?.full_name || session.user.user_metadata?.name
        ).catch(() => null);

        if (isMounted && profile) {
          setCurrentProfile((prev) => ({
            ...profile,
            primaryFocus: prev?.primaryFocus ?? session.user.user_metadata?.primary_focus,
            reminderEnabled:
              prev?.reminderEnabled ?? session.user.user_metadata?.reminder_enabled,
            notificationPermission:
              prev?.notificationPermission ??
              session.user.user_metadata?.notification_permission,
            onboardingCompleted:
              prev?.onboardingCompleted ??
              Boolean(session.user.user_metadata?.onboarding_completed),
          }));
          try {
            localStorage.setItem('journalstream_user_profile', JSON.stringify(profile));
          } catch {}
        }
      } catch (err) {
        console.warn('Background session sync notice:', err);
      }
    };

    syncSessionInBackground();

    let unsubscribe = () => {};
    try {
      unsubscribe = authService.onAuthStateChange(async (user) => {
        if (!isMounted) return;
        if (user) {
          setCurrentUser(user);
          try {
            localStorage.setItem('journalstream_current_user', JSON.stringify(user));
          } catch {}

          const hasCompletedPreviously = (() => {
            try {
              return localStorage.getItem('journalstream_has_completed_welcome') === 'true';
            } catch {
              return false;
            }
          })();

          if (hasCompletedPreviously) {
            setIsAuthFlowOpen(false);
          }

          if (user.user_metadata?.onboarding_completed === true) {
            try {
              localStorage.setItem(getOnboardingStorageKey(user.id), 'true');
              localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
            } catch {}
            setNeedsOnboarding(false);
          }

          try {
            const profile = await dbService.ensureUserProfileInitialized(
              user.id,
              user.email,
              user.user_metadata?.full_name || user.user_metadata?.name
            );
            if (isMounted && profile) {
              setCurrentProfile(profile);
              try {
                localStorage.setItem('journalstream_user_profile', JSON.stringify(profile));
              } catch {}
            }
          } catch (e) {
            console.warn('Gagal menyinkronkan profil saat auth berubah:', e);
          }
        }
      });
    } catch (e) {
      console.warn('onAuthStateChange notice:', e);
    }

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const completeEntryAndOpenDashboard = useCallback(
    (welcomeText?: string, forceOnboarding?: boolean, userOverride?: SupabaseUser) => {
      setShowEntryChoiceModal(false);

      const hasAuthenticatedSession = (() => {
        if (welcomeText || pendingWelcomeToast) return true;
        try {
          return (
            Boolean(localStorage.getItem('journalstream_current_user')) ||
            localStorage.getItem('journalstream_has_completed_welcome') === 'true'
          );
        } catch {
          return false;
        }
      })();

      if (hasAuthenticatedSession) {
        setIsAuthFlowOpen(false);
        try {
          localStorage.setItem('journalstream_has_completed_welcome', 'true');
        } catch {}

        const targetUser = userOverride || currentUser;
        const shouldRunOnboarding =
          forceOnboarding || pendingForceOnboarding || !hasCompletedOnboardingForUser(targetUser);

        setPendingForceOnboarding(false);
        if (shouldRunOnboarding) {
          setNeedsOnboarding(true);
          setPendingWelcomeToast(null);
        } else {
          setNeedsOnboarding(false);
          const msg = welcomeText || pendingWelcomeToast;
          if (msg) {
            setPendingWelcomeToast(null);
            showToast(msg);
          }
        }
      }
    },
    [currentUser, pendingForceOnboarding, pendingWelcomeToast, showToast]
  );

  // Callback setelah pengguna berhasil Login atau Daftar akun dari form
  const handleAuthSuccess = (
    user: SupabaseUser,
    initialProf?: UserProfile,
    meta?: { isNewUser?: boolean }
  ) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('journalstream_current_user', JSON.stringify(user));
    } catch {}
    if (initialProf) {
      setCurrentProfile(initialProf);
      try {
        localStorage.setItem('journalstream_user_profile', JSON.stringify(initialProf));
      } catch {}
    }

    const isNewRegistration = Boolean(meta?.isNewUser);
    setPendingForceOnboarding(isNewRegistration);
    if (isNewRegistration) {
      setNeedsOnboarding(true);
    } else {
      setNeedsOnboarding(!hasCompletedOnboardingForUser(user));
    }

    const displayName = user.user_metadata?.full_name || user.email || 'Pengguna';
    const welcomeMsg = `Selamat datang, ${displayName}!`;

    completeEntryAndOpenDashboard(welcomeMsg, isNewRegistration, user);
  };

  const handleContinueAsGuest = () => {
    try {
      localStorage.setItem('journalstream_current_user', JSON.stringify(currentUser));
      let createdAt = localStorage.getItem('ascend_account_created_at');
      if (!createdAt || createdAt === '2026-01-01T00:00:00.000Z') {
        localStorage.setItem('ascend_account_created_at', new Date().toISOString());
      }
      if (!localStorage.getItem('ascend_theme')) {
        localStorage.setItem('ascend_theme', 'light');
      }
    } catch {}

    setPendingForceOnboarding(true);
    setNeedsOnboarding(true);
    const welcomeMsg = 'Selamat datang di Ascend Journal! (Mode Tamu)';
    completeEntryAndOpenDashboard(welcomeMsg, true);
  };

  const handleOnboardingComplete = useCallback(
    (result: OnboardingResult) => {
      const realToday = getRealToday();
      const baseProfile: UserProfile = currentProfile || {
        ...initialUserProfile,
        monthIndex: realToday.monthIndex,
        year: realToday.year,
        monthName: realToday.monthName,
        totalDaysInMonth: realToday.totalDaysInMonth,
        selectedDay: realToday.day,
      };

      const completedAt = new Date().toISOString();
      const updatedProfile: UserProfile = {
        ...baseProfile,
        name: result.nickname,
        email: currentUser?.email || baseProfile.email,
        greetingTitle: `Selamat Datang, ${result.nickname}`,
        greetingSubtitle: getFocusGreetingSubtitle(result.primaryFocus),
        primaryFocus: result.primaryFocus,
        reminderEnabled: result.reminderEnabled,
        notificationPermission: result.notificationPermission,
        onboardingCompleted: true,
        onboardingCompletedAt: completedAt,
      };

      const updatedUser: SupabaseUser = {
        ...currentUser,
        user_metadata: {
          ...currentUser.user_metadata,
          full_name: result.nickname,
          name: result.nickname,
          primary_focus: result.primaryFocus,
          reminder_enabled: result.reminderEnabled,
          notification_permission: result.notificationPermission,
          onboarding_completed: true,
          onboarding_completed_at: completedAt,
        },
      };

      setCurrentProfile(updatedProfile);
      setCurrentUser(updatedUser);

      try {
        localStorage.setItem('journalstream_user_profile', JSON.stringify(updatedProfile));
        localStorage.setItem('journalstream_current_user', JSON.stringify(updatedUser));
        localStorage.setItem(getOnboardingStorageKey(currentUser?.id), 'true');
        localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
        localStorage.setItem('ascend_initial_permissions_prompted', 'true');
      } catch {}

      if (isValidSupabaseUserId(currentUser?.id) && isSupabaseConfigured()) {
        void dbService.syncOnboardingPreferences(currentUser.id, updatedProfile);
      }

      setNeedsOnboarding(false);
      showToast(`Selamat datang, ${result.nickname}! Ruang kerja Anda siap.`);
    },
    [currentProfile, currentUser, showToast]
  );

  const handleUserChange = useCallback((user: SupabaseUser | null) => {
    if (user) {
      setCurrentUser(user);
      try {
        localStorage.setItem('journalstream_current_user', JSON.stringify(user));
      } catch {}
    } else {
      setCurrentUser(getFallbackDefaultUser());
      try {
        localStorage.removeItem('journalstream_current_user');
      } catch {}
    }
  }, []);

  // Keluar dari akun (Logout)
  const handleLogout = async () => {
    try {
      await authService.signOut();
    } catch (err) {
      console.warn('Sign out error:', err);
    } finally {
      setCurrentUser(getFallbackDefaultUser());
      setCurrentProfile(null);
      setShowEntryChoiceModal(false);
      setPendingWelcomeToast(null);
      setNeedsOnboarding(true);
      setIsAuthFlowOpen(true);
      try {
        localStorage.removeItem('journalstream_current_user');
        localStorage.removeItem('journalstream_has_completed_welcome');
        localStorage.removeItem('ascend_initial_permissions_prompted');
        localStorage.removeItem(ONBOARDING_DONE_KEY);
      } catch {}
      showToast('Berhasil keluar dari akun. Sampai jumpa kembali!');
    }
  };

  return (
    <>
      {/* 1. Layar Sambutan & Auth Flow (Welcome Splash, Login, Register) */}
      {isAuthFlowOpen ? (
        <AuthScreen
          onAuthSuccess={handleAuthSuccess}
          showToast={showToast}
          onContinueAsGuest={handleContinueAsGuest}
        />
      ) : needsOnboarding ? (
        /* 2. Alur Onboarding Interaktif Bergaya Typeform sebelum masuk ke Dasbor Utama */
        <TypeformOnboarding
          initialName={
            currentProfile?.name ||
            currentUser?.user_metadata?.full_name ||
            currentUser?.user_metadata?.name
          }
          onComplete={handleOnboardingComplete}
        />
      ) : (
        /* 3. Komponen <MainDashboard /> langsung dirender setelah onboarding selesai */
        <MainDashboard
          currentUser={currentUser}
          initialProfile={currentProfile}
          onLogout={handleLogout}
          onUserChange={handleUserChange}
        />
      )}

      {/* Modal 2 Opsi setelah pengguna mengklik Masuk: Download Aplikasi atau Lanjutkan di Chrome */}
      <AppEntryChoiceModal
        isOpen={showEntryChoiceModal}
        onContinueInChrome={() => completeEntryAndOpenDashboard()}
        onClose={() => completeEntryAndOpenDashboard()}
        autoPromptInstall={openedViaInstallAction}
      />

      {/* Floating Global Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200 pointer-events-none">
          <div className="bg-slate-900/95 border border-emerald-500/40 text-white px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center gap-3">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-100">{toastMessage}</span>
          </div>
        </div>
      )}
    </>
  );
}
