import React, { useEffect, useMemo, useState } from 'react';
import {
  Megaphone,
  Calendar,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  Clock,
  CheckCircle2,
  RefreshCw,
  Target,
  Flame,
  ListChecks,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { AppAnnouncement, Habit, NavTab, TargetItem, Task, UserProfile } from '../../types';
import { User } from '@supabase/supabase-js';
import { NotificationIllustration } from '../NotificationIllustration';
import { checkIsAdminUser } from '../../utils/admin';
import { MONTH_NAMES_ID, getDaysInMonth, toISODateString } from '../../utils/dateUtils';
import {
  calculateMidnightCountdown,
  getMonthClosingStatus,
  isTaskActiveUpToDate,
} from '../../utils/notifications';

interface NotificationsViewProps {
  announcements?: AppAnnouncement[];
  tasks?: Task[];
  habits?: Habit[];
  targets?: TargetItem[];
  userProfile: UserProfile;
  currentUser?: User | null;
  isLoadingAnnouncements?: boolean;
  announcementsError?: string | null;
  onRefreshAnnouncements?: () => void | Promise<void>;
  onNavigateToDashboard: () => void;
  onNavigateToTab?: (tab: NavTab) => void;
  onOpenAnnouncementsAdmin?: () => void;
  onSimulateReminder?: () => void;
  onShowToast?: (msg: string) => void;
  theme?: 'dark' | 'light';
}

export const READ_ANNOUNCEMENTS_STORAGE_KEY = 'ascend_read_announcements_ids';

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  announcements = [],
  tasks = [],
  habits = [],
  targets = [],
  userProfile,
  currentUser,
  isLoadingAnnouncements = false,
  announcementsError = null,
  onRefreshAnnouncements,
  onNavigateToTab,
  onOpenAnnouncementsAdmin,
  theme = 'light',
}) => {
  const isLight = theme === 'light';
  const isAdmin = checkIsAdminUser(currentUser, userProfile);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentNow, setCurrentNow] = useState<Date>(() => new Date());

  // Perbarui waktu berjalan setiap 15 detik & saat layar aktif kembali agar kartu otomatis hilang tepat pukul 00:00 pergantian hari
  useEffect(() => {
    const syncClock = () => {
      setCurrentNow(new Date());
    };
    const timer = setInterval(syncClock, 15000);
    window.addEventListener('focus', syncClock);
    document.addEventListener('visibilitychange', syncClock);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', syncClock);
      document.removeEventListener('visibilitychange', syncClock);
    };
  }, []);

  const countdownText = useMemo(
    () => calculateMidnightCountdown(currentNow).countdownDetailed,
    [currentNow]
  );

  const activeAnnouncements = useMemo(
    () => announcements.filter((a) => a.isActive),
    [announcements]
  );

  const activeAnnouncementIdsKey = useMemo(
    () => activeAnnouncements.map((a) => a.id).join('|'),
    [activeAnnouncements]
  );

  // Otomatis tandai seluruh pemberitahuan aktif sebagai dibaca saat pengguna membuka halaman ini
  useEffect(() => {
    if (activeAnnouncements.length === 0) return;
    const allActiveIds = activeAnnouncements.map((a) => a.id);
    try {
      const stored = localStorage.getItem(READ_ANNOUNCEMENTS_STORAGE_KEY);
      const currentRead: string[] = stored ? JSON.parse(stored) : [];
      const hasUnread = allActiveIds.some((id) => !currentRead.includes(id));
      if (hasUnread) {
        const updated = Array.from(new Set([...currentRead, ...allActiveIds]));
        localStorage.setItem(READ_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(updated));
        window.dispatchEvent(new Event('ascend-announcements-read-updated'));
      }
    } catch (e) {
      console.warn('Gagal memperbarui status baca:', e);
    }
  }, [activeAnnouncementIdsKey, activeAnnouncements]);

  // Hitung pengingat aktif hari ini langsung dari data asli pengguna (reset otomatis pada pergantian hari pukul 00:00)
  const todayIso = toISODateString(currentNow);
  const realToday = useMemo(() => {
    const monthIndex = currentNow.getMonth();
    const year = currentNow.getFullYear();
    return {
      day: currentNow.getDate(),
      monthIndex,
      year,
      monthName: `${MONTH_NAMES_ID[monthIndex]} ${year}`,
      totalDaysInMonth: getDaysInMonth(year, monthIndex),
    };
  }, [todayIso]);

  const currentHour = currentNow.getHours();
  // Kartu agenda muncul mulai pukul 10.00 dan otomatis menghilang pukul 00.00 saat pergantian hari
  const isAgendaNotificationWindow = currentHour >= 10;
  const isPre22AgendaWindow = currentHour === 21;

  const agendasToday = useMemo(
    () => tasks.filter((t) => isTaskActiveUpToDate(t, todayIso)),
    [tasks, todayIso]
  );

  const pendingTasksToday = useMemo(
    () => agendasToday.filter((t) => t.days?.[realToday.day] !== 'done'),
    [agendasToday, realToday.day]
  );

  const pendingHabitsToday = useMemo(
    () =>
      habits.filter(
        (h) =>
          !(
            h.completedToday ||
            h.lastCompletedDate === todayIso ||
            (Array.isArray(h.completedDates) && h.completedDates.includes(todayIso))
          )
      ),
    [habits, todayIso]
  );

  const activeTargets = useMemo(
    () => targets.filter((t) => !t.completed),
    [targets]
  );

  const monthClosingStatus = useMemo(
    () =>
      getMonthClosingStatus(
        userProfile.monthName,
        userProfile.monthIndex,
        userProfile.year,
        tasks
      ),
    [userProfile.monthName, userProfile.monthIndex, userProfile.year, tasks]
  );


  const handleRefresh = async () => {
    if (!onRefreshAnnouncements || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefreshAnnouncements();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getAnnouncementBadge = (type: string) => {
    switch (type) {
      case 'warning':
        return {
          icon: AlertTriangle,
          label: 'Peringatan',
          classes: isLight
            ? 'bg-amber-100 text-amber-800 border-amber-300'
            : 'bg-amber-500/20 text-amber-300 border-amber-400/40',
          iconBoxClasses: isLight
            ? 'bg-gradient-to-br from-amber-100 to-amber-50 border-amber-300 text-amber-700 shadow-amber-200/50'
            : 'bg-gradient-to-br from-amber-500/25 to-amber-600/10 border-amber-500/40 text-amber-300',
        };
      case 'update':
        return {
          icon: Sparkles,
          label: 'Pembaruan',
          classes: isLight
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
          iconBoxClasses: isLight
            ? 'bg-gradient-to-br from-emerald-100 to-teal-50 border-emerald-300 text-emerald-700 shadow-emerald-200/50'
            : 'bg-gradient-to-br from-emerald-500/25 to-teal-600/10 border-emerald-500/40 text-emerald-300',
        };
      case 'event':
        return {
          icon: Calendar,
          label: 'Acara',
          classes: isLight
            ? 'bg-purple-100 text-purple-800 border-purple-300'
            : 'bg-purple-500/20 text-purple-300 border-purple-400/40',
          iconBoxClasses: isLight
            ? 'bg-gradient-to-br from-purple-100 to-violet-50 border-purple-300 text-purple-700 shadow-purple-200/50'
            : 'bg-gradient-to-br from-purple-500/25 to-violet-600/10 border-purple-500/40 text-purple-300',
        };
      default:
        return {
          icon: Megaphone,
          label: 'Informasi',
          classes: isLight
            ? 'bg-sky-100 text-sky-800 border-sky-300'
            : 'bg-sky-500/20 text-sky-300 border-sky-400/40',
          iconBoxClasses: isLight
            ? 'bg-gradient-to-br from-sky-100 to-blue-50 border-sky-300 text-sky-700 shadow-sky-200/50'
            : 'bg-gradient-to-br from-sky-500/25 to-blue-600/10 border-sky-500/40 text-sky-300',
        };
    }
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return '-';
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '-';
    }
  };

  const showAgendaCardToday = isAgendaNotificationWindow && agendasToday.length > 0;
  const hasNoAgendaToday = agendasToday.length === 0;

  const hasOtherReminders =
    pendingHabitsToday.length > 0 ||
    activeTargets.length > 0 ||
    monthClosingStatus.isEndOfMonth;

  const hasPendingReminders = showAgendaCardToday || hasOtherReminders;

  return (
    <div
      className={`w-full pb-32 sm:pb-24 transition-colors duration-200 ${
        isLight ? 'bg-transparent text-slate-900' : 'bg-transparent text-white'
      }`}
    >
      <div className="max-w-4xl mx-auto space-y-5 pt-1 sm:pt-2">
        {/* 1. PENGINGAT HARIAN AKTIF (AGENDA, KEBIASAAN, TARGET, TUTUP BULAN) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Pengingat Aktif Hari Ini
            </h3>
            <span className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {realToday.day} {realToday.monthName}
            </span>
          </div>

          {!hasPendingReminders && !hasNoAgendaToday ? (
            <div
              className={`p-4 rounded-2xl border flex items-center gap-3 ${
                isLight
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                  : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
              }`}
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              <p className="text-xs sm:text-sm font-semibold">
                Semua agenda dan kebiasaan hari ini telah selesai dikerjakan. Pertahankan konsistensimu!
              </p>
            </div>
          ) : !hasOtherReminders && hasNoAgendaToday ? (
            <div className="w-full">
              <button
                type="button"
                onClick={() => onNavigateToTab?.('agenda')}
                className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                  isLight
                    ? 'bg-white border-slate-200/90 hover:border-teal-400 text-slate-900 shadow-xs'
                    : 'bg-[#111827] border-white/10 hover:border-teal-500/40 text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                      isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-600'
                        : 'bg-white/5 border-white/10 text-slate-300'
                    }`}
                  >
                    <ListChecks className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold truncate">
                      Anda belum punya agenda
                    </p>
                    <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                      Tambahkan agenda harian agar pengingat aktif muncul di sini.
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {hasNoAgendaToday && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab?.('agenda')}
                  className={`p-4 rounded-2xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-200/90 hover:border-teal-400 text-slate-900 shadow-xs'
                      : 'bg-[#111827] border-white/10 hover:border-teal-500/40 text-white'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                        isLight
                          ? 'bg-slate-100 border-slate-200 text-slate-600'
                          : 'bg-white/5 border-white/10 text-slate-300'
                      }`}
                    >
                      <ListChecks className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold truncate">
                        Anda belum punya agenda
                      </p>
                      <p className={`text-[11px] mt-0.5 line-clamp-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        Tambahkan agenda harian agar pengingat aktif muncul di sini.
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                </button>
              )}

              {showAgendaCardToday && (() => {
                const isAllAgendasCompleted = pendingTasksToday.length === 0;
                return (
                  <button
                    type="button"
                    onClick={() => onNavigateToTab?.('agenda')}
                    className={`p-4 rounded-2xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer relative overflow-hidden ${
                      isAllAgendasCompleted
                        ? isLight
                          ? 'bg-gradient-to-br from-emerald-50 via-teal-50/70 to-white border-emerald-300 hover:border-emerald-400 text-emerald-950 shadow-sm shadow-emerald-500/10'
                          : 'bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-[#111827] border-emerald-500/40 hover:border-emerald-400/60 text-white shadow-sm shadow-emerald-500/10'
                        : isLight
                        ? 'bg-white border-slate-200/90 hover:border-teal-400 text-slate-900 shadow-xs'
                        : 'bg-[#111827] border-white/10 hover:border-teal-500/40 text-white'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                          isAllAgendasCompleted
                            ? isLight
                              ? 'bg-gradient-to-br from-emerald-500 to-teal-500 border-emerald-400 text-white shadow-xs shadow-emerald-500/25'
                              : 'bg-gradient-to-br from-emerald-500/30 to-teal-500/20 border-emerald-400/50 text-emerald-300'
                            : isLight
                            ? 'bg-sky-50 border-sky-200 text-sky-700'
                            : 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                        }`}
                      >
                        {isAllAgendasCompleted ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <ListChecks className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        {isAllAgendasCompleted ? (
                          <>
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                  isLight
                                    ? 'bg-emerald-100/90 text-emerald-800 border-emerald-300/80'
                                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                                }`}
                              >
                                <Sparkles className="w-3 h-3" />
                                <span>{agendasToday.length}/{agendasToday.length} Tuntas</span>
                              </span>
                            </div>
                            <p
                              className={`text-xs sm:text-sm font-bold leading-snug ${
                                isLight ? 'text-emerald-950' : 'text-emerald-100'
                              }`}
                            >
                              Kamu sudah menyelesaikan agenda hari ini, tetap konsisten!
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs sm:text-sm font-bold truncate">
                              {isPre22AgendaWindow
                                ? `Selesaikan ${pendingTasksToday.length} Agenda Sebelum 22.00!`
                                : `${agendasToday.length} Agenda Hari Ini`}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 mt-1 ${
                        isAllAgendasCompleted
                          ? isLight
                            ? 'text-emerald-600'
                            : 'text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    />
                  </button>
                );
              })()}

              {pendingHabitsToday.length > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab?.('habits')}
                  className={`p-4 rounded-2xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-200/90 hover:border-amber-400 text-slate-900 shadow-xs'
                      : 'bg-[#111827] border-white/10 hover:border-amber-500/40 text-white'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                        isLight
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      }`}
                    >
                      <Flame className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold truncate">
                        {pendingHabitsToday.length} Kebiasaan Menunggu Hari Ini
                      </p>
                      <p className={`text-[11px] mt-0.5 line-clamp-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        Tersisa {countdownText} menuju pergantian hari agar streak tetap terjaga.
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                </button>
              )}

              {activeTargets.length > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab?.('targets')}
                  className={`p-4 rounded-2xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-200/90 hover:border-emerald-400 text-slate-900 shadow-xs'
                      : 'bg-[#111827] border-white/10 hover:border-emerald-500/40 text-white'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                        isLight
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      }`}
                    >
                      <Target className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold truncate">
                        {activeTargets.length} Target Aktif Berjalan
                      </p>
                      <p className={`text-[11px] mt-0.5 line-clamp-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        Target terdekat: "{activeTargets[0]?.title}"
                        {activeTargets[0]?.deadlineDate ? ` (Tenggat: ${activeTargets[0].deadlineDate})` : ''}.
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                </button>
              )}

              {monthClosingStatus.isEndOfMonth && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab?.('archive')}
                  className={`p-4 rounded-2xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
                    isLight
                      ? 'bg-amber-50/70 border-amber-300 hover:border-amber-400 text-amber-950 shadow-xs'
                      : 'bg-amber-500/10 border-amber-500/30 hover:border-amber-400/50 text-amber-100'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                        isLight
                          ? 'bg-amber-100 border-amber-300 text-amber-800'
                          : 'bg-amber-500/20 border-amber-500/35 text-amber-300'
                      }`}
                    >
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold truncate">{monthClosingStatus.title}</p>
                      <p className={`text-[11px] mt-0.5 line-clamp-2 ${isLight ? 'text-amber-900/80' : 'text-amber-200/80'}`}>
                        {monthClosingStatus.body}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-500 shrink-0 mt-1" />
                </button>
              )}
            </div>
          )}
        </section>

        {/* 3. PENGUMUMAN & PEMBARUAN APLIKASI DARI SUPABASE */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap px-1">
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Pengumuman &amp; Pembaruan Aplikasi ({activeAnnouncements.length})
            </h3>

            <div className="flex items-center gap-2">
              {isAdmin && onOpenAnnouncementsAdmin && (
                <button
                  type="button"
                  onClick={onOpenAnnouncementsAdmin}
                  className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Kelola Pemberitahuan</span>
                </button>
              )}

              {onRefreshAnnouncements && (
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isRefreshing || isLoadingAnnouncements}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                    isLight
                      ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isRefreshing || isLoadingAnnouncements ? 'Memuat...' : 'Segarkan'}</span>
                </button>
              )}
            </div>
          </div>

          {isLoadingAnnouncements ? (
            <div className="space-y-3" aria-busy="true" aria-label="Memuat pemberitahuan">
              {[0, 1].map((idx) => (
                <div
                  key={idx}
                  className={`p-5 rounded-2xl border space-y-3 ${
                    isLight ? 'bg-white border-slate-200' : 'bg-[#111827] border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
                    <div className="flex-1 space-y-2">
                      <div className={`h-4 w-32 rounded-md animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
                      <div className={`h-4 w-2/3 rounded-md animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/5'}`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : announcementsError ? (
            <div
              className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isLight
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2.5 text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Gagal memuat pengumuman dari Supabase</p>
                  <p className="opacity-85 mt-0.5">{announcementsError}</p>
                </div>
              </div>
              {onRefreshAnnouncements && (
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  Coba Lagi
                </button>
              )}
            </div>
          ) : activeAnnouncements.length === 0 ? (
            <div
              className={`p-8 sm:p-10 rounded-3xl border text-center flex flex-col items-center justify-center space-y-4 shadow-xs ${
                isLight
                  ? 'bg-white border-slate-200/90 text-slate-800'
                  : 'bg-[#111827]/80 border-white/10 text-white'
              }`}
            >
              <div
                className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-xs ${
                  isLight
                    ? 'bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-200 text-teal-700'
                    : 'bg-gradient-to-br from-teal-500/20 to-emerald-500/10 border-teal-500/30 text-teal-300'
                }`}
              >
                <Megaphone className="w-7 h-7 -rotate-12" />
              </div>

              <div className="relative flex items-center justify-center my-1">
                <NotificationIllustration
                  theme={theme}
                  className="w-[130px] sm:w-[150px] md:w-[170px] h-auto max-w-full object-contain"
                />
              </div>

              <div className="space-y-1.5 text-center max-w-sm">
                <h3
                  className={`text-base sm:text-lg font-bold tracking-tight ${
                    isLight ? 'text-slate-950' : 'text-white'
                  }`}
                >
                  Belum Ada Pengumuman Aplikasi
                </h3>
                <p
                  className={`text-xs sm:text-sm leading-relaxed ${
                    isLight ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  Seluruh pembaruan, informasi penting, dan pengumuman resmi akan tampil langsung di sini.
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full space-y-3.5 text-left">
              {activeAnnouncements.map((ann) => {
                const badge = getAnnouncementBadge(ann.type);
                const BadgeIcon = badge.icon;

                return (
                  <div
                    key={ann.id}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 shadow-xs hover:shadow-md group ${
                      isLight
                        ? 'bg-white border-slate-200/90 text-slate-800 hover:border-teal-400/60'
                        : 'bg-[#111827] border-white/10 text-white hover:border-teal-500/40'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 sm:gap-4">
                      {/* Kotak Ikon Fitur Menonjol di Sisi Kiri */}
                      <div
                        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-xs transition-transform duration-200 group-hover:scale-105 ${badge.iconBoxClasses}`}
                      >
                        <BadgeIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>

                      {/* Isi Informasi Pemberitahuan */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.classes}`}
                            >
                              <span>{badge.label}</span>
                            </span>
                            {ann.isPinned && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-500 border border-amber-400/40">
                                Disematkan
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatDate(ann.createdAt)}</span>
                          </div>
                        </div>

                        <h4
                          className={`text-sm sm:text-base font-bold mb-1.5 leading-snug ${
                            isLight ? 'text-slate-900' : 'text-white'
                          }`}
                        >
                          {ann.title}
                        </h4>

                        <p
                          className={`text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap ${
                            isLight ? 'text-slate-600' : 'text-slate-300'
                          }`}
                        >
                          {ann.message}
                        </p>

                        {(ann.actionUrl || ann.authorName) && (
                          <div
                            className={`pt-3 mt-3 border-t flex items-center justify-between text-xs flex-wrap gap-2 ${
                              isLight ? 'border-slate-100' : 'border-white/5'
                            }`}
                          >
                            <span className="text-[11px] text-slate-400 font-medium">
                              {ann.authorName ? `Penerbit: ${ann.authorName}` : 'Penerbit: -'}
                            </span>
                            {ann.actionUrl && (
                              <a
                                href={ann.actionUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 font-bold text-xs px-3 py-1.5 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/25 transition-all cursor-pointer"
                              >
                                <span>{ann.actionLabel || 'Buka Tautan'}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
