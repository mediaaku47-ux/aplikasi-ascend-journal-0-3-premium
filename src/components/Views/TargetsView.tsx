import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  Target,
  Plus,
  Check,
  Trash2,
  CheckCircle2,
  Award,
  X,
  Bell,
  Clock,
  Calendar,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { TargetItem, TargetPeriod } from '../../types';
import { TargetIllustration, TargetCategoryIllustration } from '../TargetIllustration';
import { triggerConfetti } from '../../utils/confetti';
import {
  isWebNotificationSupported,
  isIOSNotStandalone,
  getNotificationPermissionStatus,
  requestNotificationPermission,
  saveNotificationSettings,
  sendTargetConfirmationNotification,
  sendTargetTestNotification,
} from '../../utils/notifications';

interface TargetsViewProps {
  targets: TargetItem[];
  onToggleTarget: (id: string) => void;
  onAddTarget: (newTarget: Omit<TargetItem, 'id' | 'createdAt'>) => void;
  onDeleteTarget: (id: string) => void;
  onToggleSubTask: (targetId: string, subTaskId: string) => void;
  onDeleteSubTask: (targetId: string, subTaskId: string) => void;
  theme?: 'dark' | 'light';
}

interface WeekDayInfo {
  iso: string;
  shortLabel: string;
  dayNum: number;
  isToday: boolean;
  isPastOrToday: boolean;
}

const formatIsoLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseIsoLocal = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const addDaysIso = (baseDate: Date, days: number): string => {
  const copy = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  copy.setDate(copy.getDate() + days);
  return formatIsoLocal(copy);
};

const addMonthsIso = (baseDate: Date, months: number): string => {
  const copy = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  copy.setMonth(copy.getMonth() + months);
  return formatIsoLocal(copy);
};

const formatDateIndoFull = (iso: string): string => {
  if (!iso) return '';
  const dateObj = parseIsoLocal(iso);
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dateObj);
};

const diffDaysBetweenIso = (fromIso: string, toIso: string): number => {
  const a = parseIsoLocal(fromIso);
  const b = parseIsoLocal(toIso);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
};

const getCurrentWeekMeta = () => {
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayIso = formatIsoLocal(todayLocal);
  const jsDay = todayLocal.getDay(); // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;

  const monday = new Date(todayLocal);
  monday.setDate(todayLocal.getDate() + mondayOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const weekDays: WeekDayInfo[] = dayNames.map((shortLabel, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    const iso = formatIsoLocal(d);
    return {
      iso,
      shortLabel,
      dayNum: d.getDate(),
      isToday: iso === todayIso,
      isPastOrToday: d.getTime() <= todayLocal.getTime(),
    };
  });

  const monthFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
  const weekRangeLabel = `${monthFmt.format(monday)} – ${monthFmt.format(sunday)} ${sunday.getFullYear()}`;
  const isEndOfWeek = jsDay === 0;
  const daysUntilEndOfWeek = jsDay === 0 ? 0 : 7 - jsDay;

  return {
    todayIso,
    weekKey: formatIsoLocal(monday),
    weekRangeLabel,
    weekDays,
    isEndOfWeek,
    daysUntilEndOfWeek,
  };
};

interface TargetCardProps {
  target: TargetItem;
  isLight: boolean;
  todayIso: string;
  weekDays: WeekDayInfo[];
  isEndOfWeek: boolean;
  onToggleTarget: (id: string) => void;
  onDeleteTarget: (id: string) => void;
  onToggleSubTask: (targetId: string, subTaskId: string) => void;
  onDeleteSubTask: (targetId: string, subTaskId: string) => void;
}

const TargetCard: React.FC<TargetCardProps> = memo(
  ({
    target,
    isLight,
    todayIso,
    weekDays,
    isEndOfWeek,
    onToggleTarget,
    onDeleteTarget,
    onToggleSubTask,
    onDeleteSubTask,
  }) => {
    const subtasks = target.subtasks || [];
    const hasSubtasks = subtasks.length > 0;

    const completedDates = useMemo(() => {
      const raw = Array.isArray(target.completedDates) ? target.completedDates : [];
      if (raw.length === 0 && target.completed) {
        return [target.lastCompletedDate || todayIso];
      }
      return raw;
    }, [target.completedDates, target.completed, target.lastCompletedDate, todayIso]);

    const weeklyDoneCount = useMemo(
      () => weekDays.filter((d) => completedDates.includes(d.iso)).length,
      [weekDays, completedDates]
    );

    const isDoneToday = completedDates.includes(todayIso) || Boolean(target.completed);
    const isWeeklyFull = weeklyDoneCount >= 7;
    const isWeeklyAppreciated = isWeeklyFull || (isEndOfWeek && weeklyDoneCount >= 5);

    const activeDateRef = isDoneToday ? target.lastCompletedDate || todayIso : todayIso;
    const deadlineDiffDays = target.deadlineDate ? diffDaysBetweenIso(activeDateRef, target.deadlineDate) : null;
    const isBeforeDeadline = deadlineDiffDays !== null && deadlineDiffDays > 0;
    const isOnDeadlineDate = deadlineDiffDays === 0;

    const actionButtonLabel = isBeforeDeadline
      ? 'Target Tercapai Lebih Cepat'
      : isOnDeadlineDate
        ? 'Target Tercapai Sesuai Waktunya'
        : isDoneToday
          ? 'Target Tercapai'
          : 'Capai Target';

    const handleToggleTodayWithCelebration = () => {
      const willCompleteToday = !isDoneToday;
      const projectedWeeklyCount = willCompleteToday
        ? weeklyDoneCount + (completedDates.includes(todayIso) ? 0 : 1)
        : weeklyDoneCount;
      if (
        willCompleteToday &&
        (Boolean(target.deadlineDate) || projectedWeeklyCount >= 7 || (isEndOfWeek && projectedWeeklyCount >= 5))
      ) {
        void triggerConfetti({ particleCount: 90, spread: 72, origin: { y: 0.7 } });
      }
      onToggleTarget(target.id);
    };

    const cardSurfaceClass = isWeeklyAppreciated
      ? isLight
        ? 'bg-emerald-50/90 border-emerald-300/90 text-slate-950 shadow-sm'
        : 'bg-[#0F1E1B] border-emerald-500/45 text-white shadow-lg'
      : isDoneToday
        ? isLight
          ? 'bg-teal-50/60 border-teal-300/80 text-slate-950 shadow-sm'
          : 'bg-[#0F1C22] border-teal-500/35 text-white shadow-lg'
        : isLight
          ? 'bg-white border-slate-200/90 hover:border-teal-400 text-slate-950 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] hover:shadow-md'
          : 'bg-[#0F172A] border-slate-800 hover:border-teal-500/40 text-white shadow-lg';

    return (
      <motion.div
        layout="position"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className={`p-4 sm:p-5 rounded-2xl border transition-colors duration-200 flex flex-col gap-3.5 relative overflow-hidden ${cardSurfaceClass}`}
      >
        {/* Header Row: Category Illustration, Title, Delete */}
        <div className="flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <TargetCategoryIllustration
              category={target.category}
              theme={isLight ? 'light' : 'dark'}
              className="w-11 h-11 sm:w-12 sm:h-12"
            />

            <div className="min-w-0 flex-1">
              <h3
                className={`text-sm sm:text-base font-black leading-snug transition-colors ${
                  isLight ? 'text-slate-950' : 'text-white'
                }`}
              >
                {target.title}
              </h3>
            </div>
          </div>

          {/* Top-Right Corner: Delete Action */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => onDeleteTarget(target.id)}
            className={`p-2 rounded-xl transition-colors cursor-pointer shrink-0 ${
              isLight
                ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                : 'text-white/35 hover:text-rose-400 hover:bg-white/10'
            }`}
            title="Hapus Target"
          >
            <Trash2 className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Ringkasan Batas Hari & Pengingat atau Capaian 1 Minggu */}
        <div
          className={`pt-3 border-t relative z-10 ${
            isLight ? 'border-slate-100' : 'border-slate-800/80'
          }`}
        >
          {target.deadlineDate ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span
                className={`inline-flex items-center gap-1.5 font-bold ${
                  todayIso > target.deadlineDate && !isDoneToday
                    ? isLight
                      ? 'text-rose-600'
                      : 'text-rose-400'
                    : todayIso === target.deadlineDate && !isDoneToday
                      ? isLight
                        ? 'text-amber-700'
                        : 'text-amber-300'
                      : isLight
                        ? 'text-slate-700'
                        : 'text-slate-300'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>Batas target kamu: {formatDateIndoFull(target.deadlineDate)}</span>
              </span>
              <span
                className={`inline-flex items-center gap-1 font-semibold ${
                  isLight ? 'text-slate-500' : 'text-white/55'
                }`}
              >
                <Bell className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {target.reminderMode === 'daily'
                    ? `Diingatkan setiap hari pada jam ${target.reminderTime || '09:00'}`
                    : 'Diingatkan saat hari target selesai'}
                </span>
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={`font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Capaian 1 Minggu (Sen – Min)
              </span>
              <span className={`font-mono tabular-nums font-bold ${isLight ? 'text-slate-500' : 'text-white/50'}`}>
                {weeklyDoneCount}/7 hari
              </span>
            </div>
          )}
        </div>

        {/* Apresiasi & Kalimat Afirmasi/Penyemangat Saat Target Tercapai */}
        {isDoneToday && target.deadlineDate && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`px-3.5 py-2.5 rounded-xl border flex items-start gap-2.5 relative z-10 ${
              isBeforeDeadline
                ? isLight
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-emerald-500/15 border-emerald-400/35 text-emerald-100'
                : isLight
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-amber-500/15 border-amber-400/30 text-amber-100'
            }`}
          >
            <Award
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                isBeforeDeadline
                  ? isLight
                    ? 'text-emerald-600'
                    : 'text-emerald-300'
                  : isLight
                    ? 'text-amber-600'
                    : 'text-amber-300'
              }`}
            />
            <div className="space-y-0.5 text-xs leading-relaxed">
              <p className="font-black">
                {isBeforeDeadline
                  ? 'Wah ngeri! 🔥'
                  : isOnDeadlineDate
                    ? 'Target tercapai sesuai waktunya! ✨'
                    : 'Target berhasil diselesaikan! 💪'}
              </p>
              <p className="font-medium opacity-90">
                {isBeforeDeadline
                  ? 'Kamu berhasil menuntaskan targetmu lebih cepat dari batas waktunya. Kecepatan dan konsistensimu luar biasa, pertahankan energi positif ini!'
                  : isOnDeadlineDate
                    ? 'Luar biasa! Terus jaga komitmen dan semangatmu—setiap target yang selesai tepat waktu membuktikan kamu selalu bisa diandalkan!'
                    : 'Hebat! Kamu tetap berkomitmen menuntaskan targetmu hingga selesai. Terus melangkah maju!'}
              </p>
            </div>
          </motion.div>
        )}

        {/* Apresiasi Akhir Minggu di Dalam Kartu Jika Tercapai */}
        {!target.deadlineDate && isWeeklyAppreciated && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 relative z-10 ${
              isLight
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-amber-500/15 border-amber-400/30 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Award className={`w-5 h-5 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-300'}`} />
              <p className="text-xs font-bold leading-snug">
                Apresiasi Minggu Ini! Target Anda tercapai dengan konsisten ({weeklyDoneCount}/7 hari). Kerja bagus!
              </p>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => void triggerConfetti({ particleCount: 90, spread: 75 })}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                isLight
                  ? 'bg-amber-200/80 hover:bg-amber-300 text-amber-950'
                  : 'bg-amber-400/20 hover:bg-amber-400/30 text-amber-200'
              }`}
            >
              Rayakan
            </motion.button>
          </motion.div>
        )}

        {/* Checklist Sub-Tugas Items (jika ada) */}
        {hasSubtasks && (
          <div
            className={`pt-3 border-t space-y-2 relative z-10 ${
              isLight ? 'border-slate-100' : 'border-slate-800/80'
            }`}
          >
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {subtasks.map((sub) => (
                  <motion.li
                    key={sub.id}
                    layout="position"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl transition-colors ${
                      sub.completed
                        ? isLight
                          ? 'bg-emerald-50/70'
                          : 'bg-emerald-500/10'
                        : isLight
                          ? 'hover:bg-slate-50'
                          : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() => onToggleSubTask(target.id, sub.id)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <span
                        className={`w-4.5 h-4.5 rounded-md flex items-center justify-center border transition-all duration-200 shrink-0 ${
                          sub.completed
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : isLight
                              ? 'bg-white border-slate-300 group-hover:border-teal-500 text-transparent'
                              : 'bg-white/5 border-white/25 group-hover:border-sky-400 text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                      <span
                        className={`text-xs font-semibold truncate transition-all duration-200 ${
                          sub.completed
                            ? isLight
                              ? 'text-slate-400 line-through'
                              : 'text-white/45 line-through'
                            : isLight
                              ? 'text-slate-800'
                              : 'text-slate-200'
                        }`}
                      >
                        {sub.title}
                      </span>
                    </motion.button>

                    <button
                      type="button"
                      onClick={() => onDeleteSubTask(target.id, sub.id)}
                      className={`p-1 rounded-lg opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-all cursor-pointer shrink-0 ${
                        isLight
                          ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                          : 'text-white/35 hover:text-rose-400 hover:bg-white/10'
                      }`}
                      title="Hapus sub-tugas"
                      aria-label={`Hapus sub-tugas ${sub.title}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        )}

        {/* Footer Controls: Completion Action */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 pt-3 border-t relative z-10 ${
            isLight ? 'border-slate-100' : 'border-slate-800'
          }`}
        >
          <span className={`text-xs font-semibold leading-relaxed flex-1 min-w-[220px] ${isLight ? 'text-slate-600' : 'text-white/65'}`}>
            {isDoneToday
              ? isBeforeDeadline
                ? 'Wah ngeri! Target tercapai lebih cepat sebelum batas waktunya.'
                : isOnDeadlineDate
                  ? 'Mantap! Target tercapai sesuai waktunya.'
                  : 'Selamat! Target kamu sudah tercatat tercapai.'
              : target.deadlineDate
                ? (() => {
                    const remainingDays = diffDaysBetweenIso(todayIso, target.deadlineDate);
                    const formattedDate = formatDateIndoFull(target.deadlineDate);
                    const jam = target.reminderTime || '09:00';
                    if (remainingDays === 0) {
                      return target.reminderMode === 'daily'
                        ? `Batas target kamu hari ini (${formattedDate}) dan kamu harus mencapainya. Kamu akan diingatkan pada jam ${jam} agar kamu mencapai targetmu.`
                        : `Batas target kamu hari ini (${formattedDate}) dan kamu harus mencapainya, dan nanti kamu akan diingatkan ketika hari selesai target.`;
                    }
                    if (remainingDays < 0) {
                      return `Batas target kamu (${formattedDate}) telah lewat. Segera selesaikan agar kamu mencapai targetmu.`;
                    }
                    return target.reminderMode === 'daily'
                      ? `Batas target kamu ${formattedDate} dan kamu harus mencapainya, dan kamu akan diingatkan setiap hari pada jam ${jam} dalam ${remainingDays} hari ke depan agar kamu mencapai targetmu.`
                      : `Batas target kamu ${formattedDate} dan kamu harus mencapainya, dan nanti kamu akan diingatkan ketika hari selesai target.`;
                  })()
                : 'Kamu harus mencapainya agar kamu mencapai targetmu.'}
          </span>

          <div className="flex items-center gap-2">
            {isDoneToday ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 450, damping: 26 }}
                onClick={handleToggleTodayWithCelebration}
                className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer whitespace-nowrap ${
                  isLight
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-900 hover:bg-emerald-200'
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                }`}
                title="Target sudah tercapai. Klik untuk membatalkan"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{actionButtonLabel}</span>
              </motion.button>
            ) : (
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 450, damping: 26 }}
                onClick={handleToggleTodayWithCelebration}
                className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  isLight
                    ? 'bg-white hover:bg-teal-50 border-slate-300 hover:border-teal-400 text-slate-800 hover:text-teal-900 shadow-xs'
                    : 'bg-white/5 hover:bg-sky-500/15 border-white/15 hover:border-sky-400/50 text-white/85 hover:text-white'
                }`}
                title="Tandai target tercapai"
              >
                <Check className={`w-3.5 h-3.5 ${isLight ? 'text-teal-600' : 'text-sky-400'}`} />
                <span>{actionButtonLabel}</span>
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }
);

TargetCard.displayName = 'TargetCard';

export const TargetsView: React.FC<TargetsViewProps> = ({
  targets,
  onToggleTarget,
  onAddTarget,
  onDeleteTarget,
  onToggleSubTask,
  onDeleteSubTask,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const [filterPeriod, setFilterPeriod] = useState<TargetPeriod | 'all'>('daily');
  const [isAdding, setIsAdding] = useState(false);

  const weekMeta = useMemo(() => getCurrentWeekMeta(), []);

  // New Target Form State
  const [newTitle, setNewTitle] = useState('');
  const [newPeriod, setNewPeriod] = useState<TargetPeriod>('daily');
  const [newDuration, setNewDuration] = useState(3);
  const [newCategory, setNewCategory] = useState('Produktif');
  const [newDeadlineDate, setNewDeadlineDate] = useState<string>(() => addDaysIso(new Date(), 3));
  const [newReminderMode, setNewReminderMode] = useState<'daily' | 'deadline_only'>('daily');
  const [newReminderTime, setNewReminderTime] = useState('09:00');

  // Status izin notifikasi HP & perangkat pengguna
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>(() =>
    getNotificationPermissionStatus()
  );
  const [isRequestingNotif, setIsRequestingNotif] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);
  const iosNeedsHomeScreen = useMemo(() => isIOSNotStandalone(), []);

  useEffect(() => {
    const syncPermission = () => {
      setNotifPermission(getNotificationPermissionStatus());
    };
    syncPermission();
    window.addEventListener('focus', syncPermission);
    return () => window.removeEventListener('focus', syncPermission);
  }, [isAdding]);

  const handleEnableDeviceNotifications = async () => {
    if (!isWebNotificationSupported()) {
      setNotifPermission('unsupported');
      setNotifFeedback(
        iosNeedsHomeScreen
          ? 'Di iPhone/iPad, ketuk ikon Bagikan lalu "Tambahkan ke Layar Utama" terlebih dahulu.'
          : 'Browser ini belum mendukung notifikasi perangkat.'
      );
      return;
    }
    setIsRequestingNotif(true);
    setNotifFeedback(null);
    try {
      const perm = await requestNotificationPermission();
      const latest = getNotificationPermissionStatus();
      setNotifPermission(latest);
      if (perm === 'granted') {
        saveNotificationSettings({ enabled: true, targetReminders: true });
        const sent = await sendTargetTestNotification(newTitle.trim() || undefined);
        setNotifFeedback(
          sent
            ? 'Notifikasi aktif! Cek bilah notifikasi HP / perangkat Anda.'
            : 'Izin notifikasi diaktifkan. Pengingat target telah siap digunakan.'
        );
      } else if (perm === 'denied') {
        setNotifFeedback('Izin notifikasi ditolak. Aktifkan lewat Setelan Situs browser Anda.');
      }
    } finally {
      setIsRequestingNotif(false);
    }
  };

  const handleTestDeviceNotif = async () => {
    setIsRequestingNotif(true);
    setNotifFeedback(null);
    try {
      const sent = await sendTargetTestNotification(newTitle.trim() || undefined);
      setNotifPermission(getNotificationPermissionStatus());
      setNotifFeedback(
        sent
          ? 'Notifikasi uji coba terkirim ke HP / perangkat Anda!'
          : 'Pastikan izin notifikasi browser/HP sudah diizinkan.'
      );
    } finally {
      setIsRequestingNotif(false);
    }
  };

  const filteredTargets = useMemo(
    () => (filterPeriod === 'all' ? targets : targets.filter((t) => t.period === filterPeriod)),
    [targets, filterPeriod]
  );

  const computeDeadlineFromDuration = (period: TargetPeriod, duration: number): string => {
    const now = new Date();
    if (period === 'weekly') return addDaysIso(now, duration * 7);
    if (period === 'monthly') return addMonthsIso(now, duration);
    return addDaysIso(now, duration);
  };

  const handlePeriodChange = (period: TargetPeriod) => {
    setNewPeriod(period);
    const nextDur =
      period === 'weekly'
        ? Math.max(1, Math.min(3, newDuration || 1))
        : period === 'monthly'
          ? Math.max(1, Math.min(12, newDuration || 1))
          : Math.max(1, Math.min(30, newDuration || 3));
    setNewDuration(nextDur);
    setNewDeadlineDate(computeDeadlineFromDuration(period, nextDur));
  };

  const handleDurationChange = (nextDur: number) => {
    setNewDuration(nextDur);
    setNewDeadlineDate(computeDeadlineFromDuration(newPeriod, nextDur));
  };

  const handleDeadlineDateChange = (dateStr: string) => {
    if (!dateStr) return;
    const clampedIso = dateStr < weekMeta.todayIso ? weekMeta.todayIso : dateStr;
    setNewDeadlineDate(clampedIso);
    const daysDiff = Math.max(1, diffDaysBetweenIso(weekMeta.todayIso, clampedIso));
    if (newPeriod === 'weekly') {
      setNewDuration(Math.max(1, Math.min(3, Math.ceil(daysDiff / 7))));
    } else if (newPeriod === 'monthly') {
      setNewDuration(Math.max(1, Math.min(12, Math.ceil(daysDiff / 30))));
    } else {
      setNewDuration(Math.max(1, Math.min(30, daysDiff)));
    }
  };

  const handleSelectReminderMode = (mode: 'daily' | 'deadline_only') => {
    setNewReminderMode(mode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) return;

    const clampedDuration =
      newPeriod === 'weekly'
        ? Math.max(1, Math.min(3, newDuration))
        : newPeriod === 'monthly'
          ? Math.max(1, Math.min(12, newDuration))
          : Math.max(1, Math.min(30, newDuration));

    const unitLabel = newPeriod === 'weekly' ? 'minggu' : newPeriod === 'monthly' ? 'bulan' : 'hari';
    const finalDeadline = newDeadlineDate || computeDeadlineFromDuration(newPeriod, clampedDuration);
    const chosenMode = newReminderMode;
    const chosenTime = chosenMode === 'daily' ? newReminderTime || '09:00' : undefined;

    onAddTarget({
      title: cleanTitle,
      period: newPeriod,
      targetCount: clampedDuration,
      currentCount: 0,
      unit: unitLabel,
      category: newCategory,
      completed: false,
      isManual: true,
      autoTrack: 'custom',
      deadlineDate: finalDeadline,
      reminderMode: chosenMode,
      reminderTime: chosenTime,
    });

    if (filterPeriod !== 'all' && filterPeriod !== newPeriod) {
      setFilterPeriod(newPeriod);
    }

    setNewTitle('');
    setNewDuration(3);
    setNewDeadlineDate(addDaysIso(new Date(), 3));
    setNewReminderMode('daily');
    setNewReminderTime('09:00');
    setNotifFeedback(null);
    setIsAdding(false);

    if (isWebNotificationSupported()) {
      let currentPerm = getNotificationPermissionStatus();
      if (currentPerm === 'default') {
        currentPerm = await requestNotificationPermission();
        setNotifPermission(currentPerm);
      }
      if (currentPerm === 'granted') {
        void sendTargetConfirmationNotification(cleanTitle, chosenMode, chosenTime, finalDeadline);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2
            className={`text-2xl font-black tracking-tight flex items-center gap-2 ${
              isLight ? 'text-slate-950' : 'text-white'
            }`}
          >
            <Target className={`w-6 h-6 ${isLight ? 'text-teal-600' : 'text-sky-400'}`} />
            <span>Target &amp; Gol Produktivitas</span>
          </h2>
          <p className={`text-sm mt-0.5 font-medium ${isLight ? 'text-slate-600' : 'text-white/60'}`}>
            Buat targetmu dan kamu nanti akan diingatkan untuk mencapai targetmu.
          </p>
        </div>

        {/* Segmented Period Filter */}
        <div
          className={`flex items-center gap-1 p-1 rounded-xl border ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#111827] border-[#263449]'
          }`}
        >
          {(
            [
              { id: 'daily', label: 'Harian' },
              { id: 'weekly', label: 'Mingguan' },
              { id: 'monthly', label: 'Bulanan' },
              { id: 'all', label: 'Semua' },
            ] as const
          ).map((tab) => {
            const active = filterPeriod === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterPeriod(tab.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? isLight
                      ? 'bg-white text-slate-950 shadow-xs'
                      : 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                    : isLight
                      ? 'text-slate-600 hover:text-slate-950'
                      : 'text-white/55 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Banner Aktivasi Notifikasi HP & Perangkat jika ada target dengan pengingat & izin belum aktif */}
      {targets.some((t) => t.reminderMode && !t.completed) && notifPermission !== 'granted' && (
        <div
          className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isLight
              ? 'bg-amber-50 border-amber-200 text-amber-950'
              : 'bg-amber-500/10 border-amber-400/30 text-amber-100'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2.5">
            <Bell className={`w-4 h-4 shrink-0 mt-0.5 sm:mt-0 ${isLight ? 'text-amber-600' : 'text-amber-300'}`} />
            <div className="text-xs leading-relaxed">
              <span className="font-black block">Notifikasi HP &amp; Perangkat Belum Aktif</span>
              <span className="opacity-85">
                {notifPermission === 'denied'
                  ? 'Izin notifikasi diblokir. Buka setelan browser / HP Anda dan izinkan notifikasi untuk situs ini.'
                  : iosNeedsHomeScreen
                    ? 'Untuk iPhone/iPad, ketuk Bagikan lalu "Tambahkan ke Layar Utama" agar notifikasi HP bisa muncul.'
                    : 'Izinkan notifikasi agar pengingat target muncul langsung di layar HP atau perangkat Anda.'}
              </span>
            </div>
          </div>
          {notifPermission === 'default' && (
            <button
              type="button"
              onClick={() => void handleEnableDeviceNotifications()}
              disabled={isRequestingNotif}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shrink-0 transition-colors cursor-pointer whitespace-nowrap self-start sm:self-center"
            >
              {isRequestingNotif ? 'Mengaktifkan...' : 'Aktifkan Notifikasi HP'}
            </button>
          )}
        </div>
      )}

      {/* Target Items List */}
      <div className="space-y-3.5">
        {filteredTargets.length === 0 ? (
          <div
            className={`p-8 text-center rounded-3xl border flex flex-col items-center justify-center gap-4 transition-all ${
              isLight ? 'text-slate-600 bg-slate-50/80 border-slate-200' : 'text-white/60 bg-white/[0.02] border-white/10'
            }`}
          >
            <TargetIllustration theme={theme} className="w-28 h-28 sm:w-32 sm:h-32" />
            <div className="max-w-md space-y-1">
              <h4 className={`text-base font-black ${isLight ? 'text-slate-950' : 'text-white'}`}>
                Belum Ada Target di Kategori Ini
              </h4>
              <p className="text-xs font-medium">
                Buat target baru untuk mulai melacak pencapaian dan progres mingguan Anda.
              </p>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsAdding(true)}
              className={`px-5 py-2.5 rounded-xl ${
                isLight ? 'bg-[#003B2F] hover:bg-[#002e24]' : 'bg-gradient-to-r from-teal-500 via-sky-500 to-indigo-500'
              } text-white text-xs font-black flex items-center gap-2 shadow-md shadow-teal-500/25 transition-all cursor-pointer`}
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Tambah Target Baru</span>
            </motion.button>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredTargets.map((target) => (
              <TargetCard
                key={target.id}
                target={target}
                isLight={isLight}
                todayIso={weekMeta.todayIso}
                weekDays={weekMeta.weekDays}
                isEndOfWeek={weekMeta.isEndOfWeek}
                onToggleTarget={onToggleTarget}
                onDeleteTarget={onDeleteTarget}
                onToggleSubTask={onToggleSubTask}
                onDeleteSubTask={onDeleteSubTask}
              />
            ))}
          </AnimatePresence>
        )}

        {filteredTargets.length > 0 && (
          <div className="pt-2 flex justify-center sm:justify-start">
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => setIsAdding(true)}
              className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
                isLight
                  ? 'bg-white hover:bg-teal-50/60 border-slate-300 hover:border-teal-400 text-slate-800'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-teal-500/40 text-white'
              }`}
            >
              <Plus className="w-4 h-4 text-teal-400 stroke-[2.5]" />
              <span>Tambah Target Baru</span>
            </motion.button>
          </div>
        )}
      </div>

      {/* Add Target Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <form
            onSubmit={handleSubmit}
            className={`w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl space-y-4 border ${
              isLight ? 'bg-white border-slate-200 text-slate-950' : 'bg-[#0e0e14] border-white/15 text-white'
            }`}
          >
            <h3 className={`text-base font-black flex items-center gap-2 ${isLight ? 'text-slate-950' : 'text-white'}`}>
              <Plus className={`w-5 h-5 ${isLight ? 'text-teal-600' : 'text-sky-400'}`} />
              <span>Tambah Target Baru</span>
            </h3>

            <div>
              <label className={`text-xs block mb-1 font-bold ${isLight ? 'text-slate-700' : 'text-white/60'}`}>
                Nama Target:
              </label>
              <input
                type="text"
                placeholder="cth: Selesaikan proyek laporan / Tabung dana darurat..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className={`w-full text-xs p-2.5 rounded-xl outline-hidden transition-all font-semibold border ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-950 placeholder-slate-400 focus:border-teal-500'
                    : 'bg-white/5 border-white/15 text-white placeholder-white/30 focus:border-sky-400'
                }`}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`text-xs block mb-1 font-bold ${isLight ? 'text-slate-700' : 'text-white/60'}`}>
                  Kategori:
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className={`w-full text-xs p-2.5 rounded-xl outline-hidden border font-semibold ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-950 focus:border-teal-500'
                      : 'bg-[#1a1a24] border-white/15 text-white focus:border-sky-400'
                  }`}
                >
                  <option value="Produktif">Produktif</option>
                  <option value="Kesehatan">Kesehatan</option>
                  <option value="Keuangan">Keuangan</option>
                  <option value="Konsistensi">Konsistensi</option>
                  <option value="Pengembangan">Pengembangan</option>
                </select>
              </div>

              <div>
                <label className={`text-xs block mb-1 font-bold ${isLight ? 'text-slate-700' : 'text-white/60'}`}>
                  Rentang Batas Waktu:
                </label>
                <select
                  value={newPeriod}
                  onChange={(e) => handlePeriodChange(e.target.value as TargetPeriod)}
                  className={`w-full text-xs p-2.5 rounded-xl outline-hidden border font-semibold ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-950 focus:border-teal-500'
                      : 'bg-[#1a1a24] border-white/15 text-white focus:border-sky-400'
                  }`}
                >
                  <option value="daily">Hitungan Hari</option>
                  <option value="weekly">Mingguan (1–3 Mgg)</option>
                  <option value="monthly">Bulanan</option>
                </select>
              </div>
            </div>

            {/* Batas Hari Tertentu & Durasi */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className={`text-xs font-bold ${isLight ? 'text-slate-700' : 'text-white/60'}`}>
                  {newPeriod === 'daily'
                    ? 'Batas Berapa Hari:'
                    : newPeriod === 'weekly'
                      ? 'Batas Minggu (Maks 3 Minggu):'
                      : 'Batas Berapa Bulan:'}
                </label>
                <span className={`text-[11px] font-bold ${isLight ? 'text-teal-700' : 'text-sky-300'}`}>
                  Selesai: {formatDateIndoFull(newDeadlineDate)}
                </span>
              </div>

              {newPeriod === 'weekly' ? (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((wk) => {
                    const selected = newDuration === wk;
                    return (
                      <button
                        key={wk}
                        type="button"
                        onClick={() => handleDurationChange(wk)}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          selected
                            ? isLight
                              ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                              : 'bg-sky-500/25 border-sky-400 text-sky-200'
                            : isLight
                              ? 'bg-slate-50 border-slate-200 text-slate-700 hover:border-teal-400'
                              : 'bg-white/5 border-white/15 text-white/70 hover:border-sky-400/50'
                        }`}
                      >
                        {wk} Minggu
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <input
                    type="number"
                    min={1}
                    max={newPeriod === 'monthly' ? 12 : 30}
                    value={newDuration}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const maxVal = newPeriod === 'monthly' ? 12 : 30;
                      handleDurationChange(Number.isNaN(val) ? 1 : Math.max(1, Math.min(maxVal, val)));
                    }}
                    className={`w-24 text-xs p-2.5 rounded-xl outline-hidden border font-mono tabular-nums font-bold ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-950 focus:border-teal-500'
                        : 'bg-[#1a1a24] border-white/15 text-white focus:border-sky-400'
                    }`}
                  />
                  <span className={`text-xs font-bold ${isLight ? 'text-slate-600' : 'text-white/60'}`}>
                    {newPeriod === 'monthly' ? 'Bulan' : 'Hari'}
                  </span>
                </div>
              )}

              <div>
                <label className={`text-[11px] block mb-1 font-bold ${isLight ? 'text-slate-600' : 'text-white/55'}`}>
                  Atau Pilih Tanggal Batas Hari Tertentu:
                </label>
                <div className="relative flex items-center">
                  <Calendar
                    className={`w-4 h-4 absolute left-3 pointer-events-none ${
                      isLight ? 'text-slate-500' : 'text-white/45'
                    }`}
                  />
                  <input
                    type="date"
                    min={weekMeta.todayIso}
                    value={newDeadlineDate}
                    onChange={(e) => handleDeadlineDateChange(e.target.value)}
                    className={`w-full text-xs pl-9 pr-3 py-2.5 rounded-xl outline-hidden border font-semibold ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-950 focus:border-teal-500'
                        : 'bg-[#1a1a24] border-white/15 text-white focus:border-sky-400'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Pengingat Target */}
            <div
              className={`pt-3 border-t space-y-2.5 ${
                isLight ? 'border-slate-200' : 'border-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className={`text-xs flex items-center gap-1.5 font-bold ${isLight ? 'text-slate-700' : 'text-white/70'}`}>
                  <Bell className={`w-3.5 h-3.5 ${isLight ? 'text-teal-600' : 'text-sky-400'}`} />
                  <span>Apakah butuh diingatkan setiap hari?</span>
                </label>

                {notifPermission === 'granted' ? (
                  <button
                    type="button"
                    onClick={() => void handleTestDeviceNotif()}
                    disabled={isRequestingNotif}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800'
                        : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-400/30 text-emerald-300'
                    }`}
                  >
                    {isRequestingNotif ? 'Mengirim...' : 'Tes Notifikasi HP'}
                  </button>
                ) : notifPermission === 'default' ? (
                  <button
                    type="button"
                    onClick={() => void handleEnableDeviceNotifications()}
                    disabled={isRequestingNotif}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/35 text-amber-200'
                    }`}
                  >
                    {isRequestingNotif ? 'Meminta Izin...' : 'Aktifkan Notifikasi HP'}
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectReminderMode('daily')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                    newReminderMode === 'daily'
                      ? isLight
                        ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                        : 'bg-sky-500/25 border-sky-400 text-sky-200'
                      : isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:border-teal-400'
                        : 'bg-white/5 border-white/15 text-white/70 hover:border-sky-400/50'
                  }`}
                >
                  Ya, Setiap Hari
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectReminderMode('deadline_only')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                    newReminderMode === 'deadline_only'
                      ? isLight
                        ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                        : 'bg-sky-500/25 border-sky-400 text-sky-200'
                      : isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:border-teal-400'
                        : 'bg-white/5 border-white/15 text-white/70 hover:border-sky-400/50'
                  }`}
                >
                  Tidak (Saat Selesai)
                </button>
              </div>

              {newReminderMode === 'daily' ? (
                <div
                  className={`p-3 rounded-xl border space-y-2 ${
                    isLight ? 'bg-teal-50/70 border-teal-200' : 'bg-sky-500/10 border-sky-400/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="target-reminder-time"
                      className={`text-xs font-bold flex items-center gap-1.5 ${
                        isLight ? 'text-teal-900' : 'text-sky-200'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>Pilih Jam Pengingat:</span>
                    </label>
                    <input
                      id="target-reminder-time"
                      type="time"
                      value={newReminderTime}
                      onChange={(e) => setNewReminderTime(e.target.value)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg outline-hidden border font-mono tabular-nums font-bold ${
                        isLight
                          ? 'bg-white border-teal-300 text-slate-950 focus:border-teal-500'
                          : 'bg-[#1a1a24] border-sky-400/40 text-white focus:border-sky-300'
                      }`}
                    />
                  </div>
                  <p className={`text-[11px] leading-snug ${isLight ? 'text-teal-800/80' : 'text-sky-200/75'}`}>
                    Notifikasi HP &amp; perangkat akan muncul setiap hari pukul{' '}
                    <span className="font-bold">{newReminderTime}</span> hingga batas target tiba.
                  </p>
                </div>
              ) : (
                <div
                  className={`p-3 rounded-xl border text-[11px] leading-snug ${
                    isLight
                      ? 'bg-slate-50 border-slate-200 text-slate-600'
                      : 'bg-white/[0.04] border-white/10 text-white/65'
                  }`}
                >
                  Notifikasi HP &amp; perangkat hanya akan muncul ketika hari batas target selesai tiba pada{' '}
                  <span className="font-bold">{formatDateIndoFull(newDeadlineDate)}</span>.
                </div>
              )}

              {notifPermission === 'denied' && (
                <p className={`text-[11px] font-semibold ${isLight ? 'text-rose-600' : 'text-rose-400'}`}>
                  Izin notifikasi diblokir peramban. Buka Setelan Situs pada HP/browser Anda lalu ubah Notifikasi ke Izinkan.
                </p>
              )}

              {iosNeedsHomeScreen && notifPermission !== 'granted' && (
                <p className={`text-[11px] font-semibold ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
                  Pengguna iPhone/iPad: ketuk Bagikan → Tambahkan ke Layar Utama agar notifikasi perangkat dapat tampil.
                </p>
              )}

              {notifFeedback && (
                <p className={`text-[11px] font-bold ${isLight ? 'text-teal-700' : 'text-emerald-300'}`}>
                  {notifFeedback}
                </p>
              )}
            </div>

            <div className={`flex justify-end gap-2 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className={`text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer font-bold ${
                  isLight ? 'text-slate-600 hover:text-slate-950' : 'text-white/60 hover:text-white'
                }`}
              >
                Batal
              </button>
              <button
                type="submit"
                className={`text-xs px-5 py-2.5 ${
                  isLight
                    ? 'bg-[#003B2F] hover:bg-[#002e24]'
                    : 'bg-gradient-to-r from-indigo-500 via-sky-500 to-teal-500 hover:from-indigo-600 hover:via-sky-600 hover:to-teal-600'
                } text-white rounded-xl font-bold shadow-md transition-all cursor-pointer`}
              >
                Simpan Target
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
