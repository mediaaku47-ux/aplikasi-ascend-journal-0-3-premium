// Utilitas Notifikasi Pengingat Perangkat (HP / Laptop Web Push Notification)
// Mematuhi izin resmi browser/OS, mendukung pengingat agenda sebelum 22.00 dan pengingat jurnal
import { Habit, Task, TargetItem } from '../types';

export interface JournalDeadlineStatus {
  isApproaching: boolean;       // 20 menit sebelum 22:30 (antara 22:10 sampai 22:30)
  remainingMinutes: number;     // Sisa menit sebelum 22:30
  remainingHours: number;       // Sisa jam sebelum 22:30
  isTimeLocked: boolean;        // Melebihi 22:30
  cutoffTimeStr: string;        // '22:30 WIB'
  reminderTimeStr: string;      // '22:10 WIB'
}

export interface DeviceNotificationSettings {
  enabled: boolean;                  // Master switch notifikasi perangkat
  agendaReminders: boolean;          // Pengingat agenda harian
  agendaPreCutoffReminder: boolean;  // Pengingat selesaikan agenda sebelum pukul 22.00
  agendaReminderHour: number;        // Jam pengingat agenda sebelum 22.00 (default 21:00 WIB)
  journalReminders: boolean;         // Pengingat pengisian jurnal harian
  journalWarningMinutes: number;     // Menit peringatan sebelum batas (default 20 menit)
  habitReminders: boolean;           // Pengingat rutinitas kebiasaan harian
  habitReminderHour: number;         // Jam pengingat kebiasaan (default 20:00 WIB)
  targetReminders: boolean;          // Pengingat target batas hari tertentu
}

const DEFAULT_NOTIFICATION_SETTINGS: DeviceNotificationSettings = {
  enabled: true,
  agendaReminders: true,
  agendaPreCutoffReminder: true,
  agendaReminderHour: 21, // Pukul 21:00 WIB (sebelum batas malam 22.00)
  journalReminders: false, // Dinonaktifkan sesuai permintaan pengguna
  journalWarningMinutes: 20,
  habitReminders: true,
  habitReminderHour: 20, // Pukul 20:00 WIB
  targetReminders: true,
};

const SETTINGS_STORAGE_KEY = 'ascend_device_notification_settings';
const PROMPT_DISMISSED_KEY = 'ascend_notification_prompt_dismissed';
const CUTOFF_HOUR = 22;
const CUTOFF_MINUTE = 30;

/**
 * Cek status izin notifikasi di peramban / HP pengguna
 */
export function getNotificationPermissionStatus(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Cek apakah Web Notification didukung di sistem / peramban
 */
export function isWebNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Cek apakah pengguna memakai Safari iPhone/iPad di luar mode PWA (Home Screen)
 */
export function isIOSNotStandalone(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
  return isIOS && !isStandalone;
}

/**
 * Cek apakah pengguna telah menutup / menolak penjelasan izin awal
 */
export function hasDismissedPermissionPrompt(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(PROMPT_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Simpan status penolakan penjelasan izin
 */
export function setDismissedPermissionPrompt(dismissed: boolean = true): void {
  if (typeof window === 'undefined') return;
  try {
    if (dismissed) {
      localStorage.setItem(PROMPT_DISMISSED_KEY, 'true');
    } else {
      localStorage.removeItem(PROMPT_DISMISSED_KEY);
    }
  } catch {}
}

/**
 * Ambil preferensi notifikasi dari LocalStorage
 */
export function getNotificationSettings(): DeviceNotificationSettings {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

/**
 * Simpan preferensi notifikasi ke LocalStorage
 */
export function saveNotificationSettings(settings: Partial<DeviceNotificationSettings>): DeviceNotificationSettings {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const current = getNotificationSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

/**
 * Meminta izin Web Notification dari pengguna secara resmi (Notification.requestPermission())
 * Selalu dipanggil hanya setelah pengguna memilih "Izinkan"
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isWebNotificationSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setDismissedPermissionPrompt(false);
    }
    return permission;
  } catch (e) {
    console.warn('Gagal meminta izin notifikasi peramban:', e);
    return 'denied';
  }
}

/**
 * Kirim notifikasi ke perangkat pengguna (HP / Laptop) melalui Web Push / Service Worker
 * Mengikuti aturan keamanan: jangan mengirim jika pengguna belum memberikan izin 'granted'
 */
export async function sendDeviceNotification(
  title: string,
  options?: NotificationOptions & { onClickUrl?: string }
): Promise<boolean> {
  if (!isWebNotificationSupported()) return false;
  // Keamanan: Jangan mengirim notifikasi jika pengguna belum memberikan izin
  if (Notification.permission !== 'granted') return false;

  const settings = getNotificationSettings();
  if (!settings.enabled) return false;

  const notificationOptions: any = {
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [300, 100, 300],
    renotify: true,
    tag: options?.tag || `ascend-notif-${Date.now()}`,
    data: {
      url: options?.onClickUrl || '/',
      timestamp: Date.now()
    },
    ...options,
  };

  // 1. Coba utamakan Service Worker aktif (Wajib untuk HP Android / iOS PWA mobile & desktop tray)
  if ('serviceWorker' in navigator) {
    try {
      let reg: ServiceWorkerRegistration | null = (await navigator.serviceWorker.getRegistration()) || null;
      if (!reg) {
        try {
          reg = await navigator.serviceWorker.register('/sw.js');
        } catch {
          reg = null;
        }
      }
      if (!reg || !reg.active) {
        const readyReg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
        ]);
        if (readyReg) reg = readyReg;
      }

      if (reg && reg.active && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, notificationOptions);
        return true;
      }

      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_DEVICE_NOTIFICATION',
          title,
          options: notificationOptions,
        });
        return true;
      }
    } catch (swErr) {
      console.warn('SW notification dispatch notice:', swErr);
    }
  }

  // 2. Fallback ke window.Notification langsung (Laptop / Desktop browser)
  try {
    const notif = new Notification(title, notificationOptions);
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    return true;
  } catch (err) {
    console.warn('Desktop window.Notification error:', err);
    return false;
  }
}

/**
 * Kirim notifikasi uji coba seketika ke HP / Laptop untuk memverifikasi izin resmi
 */
export async function sendTestNotification(): Promise<boolean> {
  const perm = getNotificationPermissionStatus();
  if (perm !== 'granted') {
    const requested = await requestNotificationPermission();
    if (requested !== 'granted') return false;
  }

  return sendDeviceNotification('🔔 Notifikasi ASCEND Terhubung!', {
    body: 'Notifikasi perangkat Anda aktif. Anda akan menerima pengingat agenda sebelum pukul 22.00 dan peringatan batas pengisian jurnal.',
    tag: 'ascend-test-notification',
  });
}

/**
 * Memeriksa status batas waktu pengisian jurnal harian (22:30 WIB)
 */
export function checkJournalDeadlineStatus(date: Date = new Date()): JournalDeadlineStatus {
  const settings = getNotificationSettings();
  const warningMinutes = settings.journalWarningMinutes ?? 20;

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const cutoffMinutes = CUTOFF_HOUR * 60 + CUTOFF_MINUTE; // 1350 menit (22:30)
  const warningStartMinutes = cutoffMinutes - warningMinutes;

  const isTimeLocked = currentMinutes > cutoffMinutes;
  const remainingMinutesTotal = Math.max(0, cutoffMinutes - currentMinutes);
  const remainingHours = Math.floor(remainingMinutesTotal / 60);

  // Sedang dalam rentang peringatan sebelum batas waktu
  const isApproaching = !isTimeLocked && currentMinutes >= warningStartMinutes && currentMinutes <= cutoffMinutes;

  const reminderH = Math.floor(warningStartMinutes / 60);
  const reminderM = warningStartMinutes % 60;
  const reminderTimeStr = `${String(reminderH).padStart(2, '0')}:${String(reminderM).padStart(2, '0')} WIB`;

  return {
    isApproaching,
    remainingMinutes: remainingMinutesTotal,
    remainingHours,
    isTimeLocked,
    cutoffTimeStr: '22:30 WIB',
    reminderTimeStr,
  };
}

const STORAGE_REMINDER_JOURNAL_KEY = 'ascend_journal_20min_reminded_date';
const STORAGE_REMINDER_PRE22_KEY = 'ascend_agenda_pre22_reminded_date';
const STORAGE_REMINDER_AGENDA_KEY = 'ascend_agenda_reminded_date';
const STORAGE_REMINDER_HABIT_KEY = 'ascend_habit_reminded_date';

function getTodayDateString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Periksa apakah notifikasi jurnal batas 22:30 sudah dikirim hari ini
 */
export function hasBeenRemindedToday(date: Date = new Date()): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_REMINDER_JOURNAL_KEY) === getTodayDateString(date);
  } catch {
    return false;
  }
}

/**
 * Tandai bahwa notifikasi jurnal batas 22:30 sudah dikirim hari ini
 */
export function markRemindedToday(date: Date = new Date()): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_REMINDER_JOURNAL_KEY, getTodayDateString(date));
  } catch {}
}

/**
 * Kirim Web Notification pengingat jurnal (Telah dinonaktifkan sesuai permintaan pengguna)
 */
export function triggerSystemJournalReminder(_remainingMinutes?: number): boolean {
  return false;
}

/**
 * Pengingat Agenda Sebelum Pukul 22.00
 * Mengingatkan pengguna untuk menuntaskan agenda dan bersiap mengisi jurnal sebelum batas malam
 */
export function triggerPre22AgendaReminder(pendingCount: number, taskSample?: string): boolean {
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.agendaPreCutoffReminder) return false;
  if (!isWebNotificationSupported() || Notification.permission !== 'granted') return false;

  const todayStr = getTodayDateString();
  if (localStorage.getItem(STORAGE_REMINDER_PRE22_KEY) === todayStr) return false;

  try {
    const title = '📋 Selesaikan Agenda Sebelum 22.00!';
    const body = taskSample
      ? `Masih ada ${pendingCount} agenda belum selesai (misal: "${taskSample}"). Selesaikan sebelum pukul 22.00 dan siapkan evaluasi jurnal Anda.`
      : `Anda memiliki ${pendingCount} agenda harian yang belum selesai hari ini. Selesaikan sebelum pukul 22.00 dan pantau perkembangan jurnal Anda!`;

    sendDeviceNotification(title, {
      body,
      tag: `ascend-agenda-pre22-${todayStr}`,
    });

    localStorage.setItem(STORAGE_REMINDER_PRE22_KEY, todayStr);
    return true;
  } catch (err) {
    console.warn('Gagal memicu Web Notification Agenda Pre-22:', err);
    return false;
  }
}

/**
 * Kirim Web Notification pengingat agenda & tugas umum (pagi/siang)
 */
export function triggerAgendaReminder(pendingCount: number, taskSample?: string): boolean {
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.agendaReminders) return false;
  if (!isWebNotificationSupported() || Notification.permission !== 'granted') return false;

  const todayStr = getTodayDateString();
  if (localStorage.getItem(STORAGE_REMINDER_AGENDA_KEY) === todayStr) return false;

  try {
    const title = `📋 Pengingat Agenda: ${pendingCount} Tugas Belum Selesai`;
    const body = taskSample
      ? `Agenda hari ini: "${taskSample}" dan tugas lainnya menanti diselesaikan.`
      : `Anda memiliki ${pendingCount} agenda harian yang belum ditandai selesai hari ini.`;

    sendDeviceNotification(title, {
      body,
      tag: `ascend-agenda-daily-${todayStr}`,
    });

    localStorage.setItem(STORAGE_REMINDER_AGENDA_KEY, todayStr);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kirim Web Notification pengingat kebiasaan (habits)
 */
export function triggerHabitReminder(pendingCount: number): boolean {
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.habitReminders) return false;
  if (!isWebNotificationSupported() || Notification.permission !== 'granted') return false;

  const todayStr = getTodayDateString();
  if (localStorage.getItem(STORAGE_REMINDER_HABIT_KEY) === todayStr) return false;

  try {
    const title = `🔥 Pertahankan Streak Kebiasaan Anda!`;
    const body = `Ada ${pendingCount} rutinitas kebiasaan harian yang belum Anda selesaikan hari ini.`;

    sendDeviceNotification(title, {
      body,
      tag: `ascend-habit-daily-${todayStr}`,
    });

    localStorage.setItem(STORAGE_REMINDER_HABIT_KEY, todayStr);
    return true;
  } catch {
    return false;
  }
}

/**
 * Perhitungan hitung mundur presisi menuju jam 12 malam (24:00 pergantian hari)
 */
export function calculateMidnightCountdown(now: Date = new Date()) {
  const midnightToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 0, 0
  );
  const remainingMs = Math.max(0, midnightToday.getTime() - now.getTime());
  const totalRemainingSec = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalRemainingSec / 3600);
  const minutes = Math.floor((totalRemainingSec % 3600) / 60);
  const seconds = totalRemainingSec % 60;

  const countdownHours = String(hours).padStart(2, '0');
  const countdownMinutes = String(minutes).padStart(2, '0');
  const countdownSeconds = String(seconds).padStart(2, '0');

  const countdownStr = `${countdownHours}:${countdownMinutes}:${countdownSeconds}`;
  const countdownDetailed = `${countdownHours}j ${countdownMinutes}m ${countdownSeconds}d`;
  const remainingHoursTotal = remainingMs / (1000 * 3600);

  return {
    remainingMs,
    remainingHoursTotal,
    countdownStr,
    countdownDetailed,
    hours,
    minutes,
    seconds
  };
}

/**
 * Notifikasi Perangkat Kebiasaan: 5 Jam & 3 Jam Sebelum Jam 12 Malam
 * Memunculkan notifikasi perangkat asli ke HP / Laptop pengguna:
 * - Notif 1: Tepat saat sisa waktu <= 5 jam menuju jam 12 malam
 * - Notif 2: Tepat saat sisa waktu <= 3 jam menuju jam 12 malam
 * Muncul cuma 2 kali per kebiasaan per hari (jika belum diselesaikan).
 * Format isi: "Ayo lakukan kebiasaan [Nama Kebiasaan], masih ada waktu!"
 */
export function checkAndTriggerHabitDeadlineNotification(
  habitId: string,
  habitTitle: string,
  remainingHoursTotalParam?: number,
  countdownDetailedParam?: string,
  todayStr: string = getTodayDateString()
): { triggered: boolean; type: '5h' | '3h' | null } {
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.habitReminders) {
    return { triggered: false, type: null };
  }
  if (!isWebNotificationSupported() || Notification.permission !== 'granted') {
    return { triggered: false, type: null };
  }

  const { remainingHoursTotal, countdownDetailed } =
    remainingHoursTotalParam !== undefined && countdownDetailedParam !== undefined
      ? { remainingHoursTotal: remainingHoursTotalParam, countdownDetailed: countdownDetailedParam }
      : calculateMidnightCountdown();

  // 1. Notifikasi 3 Jam Sebelum Jam 12 Malam (Sisa <= 3 jam dan > 0 jam)
  if (remainingHoursTotal <= 3 && remainingHoursTotal > 0) {
    const key3h = `ascend_habit_notif_3h_${habitId}_${todayStr}`;
    if (localStorage.getItem(key3h) !== 'true') {
      const title = `⏰ Pengingat: ${habitTitle}`;
      const body = `Ayo lakukan kebiasaan ${habitTitle}, masih ada waktu! (Tersisa ${countdownDetailed} menuju jam 12 malam)`;
      sendDeviceNotification(title, {
        body,
        tag: `habit-deadline-3h-${habitId}-${todayStr}`,
      });
      localStorage.setItem(key3h, 'true');
      return { triggered: true, type: '3h' };
    }
    return { triggered: false, type: null };
  }

  // 2. Notifikasi 5 Jam Sebelum Jam 12 Malam (Sisa <= 5 jam dan > 3 jam)
  if (remainingHoursTotal <= 5 && remainingHoursTotal > 3) {
    const key5h = `ascend_habit_notif_5h_${habitId}_${todayStr}`;
    if (localStorage.getItem(key5h) !== 'true') {
      const title = `⏰ Pengingat: ${habitTitle}`;
      const body = `Ayo lakukan kebiasaan ${habitTitle}, masih ada waktu! (Tersisa ${countdownDetailed} menuju jam 12 malam)`;
      sendDeviceNotification(title, {
        body,
        tag: `habit-deadline-5h-${habitId}-${todayStr}`,
      });
      localStorage.setItem(key5h, 'true');
      return { triggered: true, type: '5h' };
    }
    return { triggered: false, type: null };
  }

  return { triggered: false, type: null };
}

/**
 * Pemeriksaan Global Seluruh Kebiasaan
 * Berjalan di latar belakang (background) bahkan saat pengguna tidak membuka halaman kebiasaan
 */
export function checkAllHabitsForDeadlineReminders(habits: Habit[]): void {
  if (!habits || !Array.isArray(habits) || habits.length === 0) return;
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.habitReminders) return;
  if (!isWebNotificationSupported() || Notification.permission !== 'granted') return;

  const now = new Date();
  const todayStr = getTodayDateString(now);
  const countdown = calculateMidnightCountdown(now);

  // Notifikasi hanya berlaku dalam rentang 5 jam sebelum jam 12 malam (antara pukul 19:00 sampai 23:59:59)
  if (countdown.remainingHoursTotal > 5 || countdown.remainingHoursTotal <= 0) {
    return;
  }

  habits.forEach((habit) => {
    // Periksa apakah kebiasaan ini sudah diselesaikan hari ini
    const isDone = habit.completedToday ||
      habit.lastCompletedDate === todayStr ||
      (Array.isArray(habit.completedDates) && habit.completedDates.includes(todayStr));

    if (!isDone) {
      checkAndTriggerHabitDeadlineNotification(
        habit.id,
        habit.title,
        countdown.remainingHoursTotal,
        countdown.countdownDetailed,
        todayStr
      );
    }
  });
}

/**
 * Uji coba notifikasi perangkat kebiasaan seketika ke HP / Laptop pengguna
 */
export async function sendHabitTestNotification(habitTitle: string, countdownDetailed: string): Promise<boolean> {
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.habitReminders) {
    return false;
  }
  const perm = getNotificationPermissionStatus();
  if (perm !== 'granted') {
    const requested = await requestNotificationPermission();
    if (requested !== 'granted') return false;
  }

  const title = `⏰ Pengingat: ${habitTitle}`;
  const body = `Ayo lakukan kebiasaan ${habitTitle}, masih ada waktu! (Tersisa ${countdownDetailed} menuju jam 12 malam)`;
  return sendDeviceNotification(title, {
    body,
    tag: `habit-test-${Date.now()}`,
  });
}

export interface MonthClosingStatus {
  isEndOfMonth: boolean;
  isPastDue: boolean;
  isLastDay: boolean;
  isMonthFull: boolean;
  daysRemaining: number;
  totalDaysInMonth: number;
  monthName: string;
  monthIndex: number;
  year: number;
  title: string;
  body: string;
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Periksa apakah saat ini sudah memasuki akhir bulan (H-2 sampai Hari Terakhir),
 * melewati pergantian bulan kalender, atau seluruh hari pada agenda bulan berjalan sudah terisi penuh.
 */
export function getMonthClosingStatus(
  monthName?: string,
  monthIndex?: number,
  year?: number,
  tasks: Task[] = [],
  now: Date = new Date()
): MonthClosingStatus {
  const activeMonthIndex = typeof monthIndex === 'number' ? monthIndex : now.getMonth();
  const activeYear = typeof year === 'number' ? year : now.getFullYear();
  const activeMonthName = monthName || MONTH_NAMES_ID[activeMonthIndex] || 'Bulan Ini';
  const totalDaysInMonth = new Date(activeYear, activeMonthIndex + 1, 0).getDate();

  const realYear = now.getFullYear();
  const realMonth = now.getMonth();
  const realDay = now.getDate();

  const isPastDue =
    activeYear < realYear ||
    (activeYear === realYear && activeMonthIndex < realMonth);

  const isCurrentActiveMonth = activeYear === realYear && activeMonthIndex === realMonth;
  const daysRemaining = isPastDue
    ? 0
    : isCurrentActiveMonth
    ? Math.max(0, totalDaysInMonth - realDay)
    : totalDaysInMonth;

  const isLastDay = isCurrentActiveMonth && daysRemaining === 0;

  const isMonthFull =
    tasks.length > 0 &&
    tasks.every((task) => {
      for (let d = 1; d <= totalDaysInMonth; d++) {
        const st = task.days?.[d];
        if (st !== 'done' && st !== 'missed') return false;
      }
      return true;
    });

  // Akhir bulan: masuk 3 hari terakhir bulan berjalan (daysRemaining <= 2), sudah lewat bulan, atau semua hari penuh
  const isEndOfMonth = isPastDue || (isCurrentActiveMonth && daysRemaining <= 2) || isMonthFull;

  let title = `📅 Akhir Bulan ${activeMonthName} ${activeYear}`;
  let body = `Bulan ${activeMonthName} ${activeYear} akan segera tutup. Buka halaman Agenda / Arsip untuk Tutup Bulan & simpan laporan PDF.`;

  if (isPastDue) {
    title = `⚠️ Bulan ${activeMonthName} ${activeYear} Akan Tutup!`;
    body = `Bulan ${activeMonthName} ${activeYear} telah berakhir. Segera lakukan Tutup Bulan & Arsip PDF agar agenda kosong kembali untuk bulan baru.`;
  } else if (isLastDay) {
    title = `⏳ Hari Terakhir Bulan ${activeMonthName}!`;
    body = `Hari ini akhir bulan ${activeMonthName} ${activeYear}. Bulan akan segera tutup — siapkan Arsip PDF & Tutup Bulan untuk memulai bulan baru.`;
  } else if (isMonthFull) {
    title = `✅ Agenda Bulan ${activeMonthName} Sudah Penuh!`;
    body = `Seluruh hari bulan ${activeMonthName} ${activeYear} telah terisi. Lakukan Tutup Bulan & Arsip PDF untuk mengosongkan checklist bulan berikutnya.`;
  } else if (isCurrentActiveMonth && daysRemaining <= 2) {
    title = `📅 Akhir Bulan: ${activeMonthName} Tutup ${daysRemaining} Hari Lagi`;
    body = `Bulan ${activeMonthName} ${activeYear} akan segera tutup dalam ${daysRemaining} hari lagi. Jangan lupa arsipkan PDF & tutup bulan.`;
  }

  return {
    isEndOfMonth,
    isPastDue,
    isLastDay,
    isMonthFull,
    daysRemaining,
    totalDaysInMonth,
    monthName: activeMonthName,
    monthIndex: activeMonthIndex,
    year: activeYear,
    title,
    body,
  };
}

/**
 * Mengirim notifikasi perangkat langsung ke HP / OS pengguna saat akhir bulan (bukan toast di dalam app).
 * Terkirim otomatis maksimal 1x per hari selama masa akhir bulan jika izin notifikasi perangkat aktif.
 */
export async function checkAndTriggerMonthClosingDeviceNotification(
  monthName?: string,
  monthIndex?: number,
  year?: number,
  tasks: Task[] = [],
  forceSend: boolean = false
): Promise<boolean> {
  const settings = getNotificationSettings();
  if (!settings.enabled) return false;
  if (!isWebNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const now = new Date();
  const status = getMonthClosingStatus(monthName, monthIndex, year, tasks, now);
  if (!status.isEndOfMonth) return false;

  const todayStr = getTodayDateString(now);
  const storageKey = `ascend_month_closing_notif_${status.year}_${status.monthIndex}_${todayStr}`;

  if (!forceSend) {
    try {
      if (localStorage.getItem(storageKey) === 'true') {
        return false;
      }
    } catch {
      // ignore storage read error
    }
  }

  const sent = await sendDeviceNotification(status.title, {
    body: status.body,
    tag: `ascend-month-closing-${status.year}-${status.monthIndex}-${todayStr}`,
    onClickUrl: '/',
  });

  if (sent) {
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {
      // ignore storage write error
    }
  }

  return sent;
}

const formatDeadlineDateId = (isoDate: string): string => {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return isoDate;
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dateObj);
};

const calcRemainingDaysIso = (fromIso: string, toIso?: string): number | null => {
  if (!toIso) return null;
  const fromParts = fromIso.split('-').map(Number);
  const toParts = toIso.split('-').map(Number);
  if (fromParts.length !== 3 || toParts.length !== 3) return null;
  if (fromParts.some(Number.isNaN) || toParts.some(Number.isNaN)) return null;
  const a = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]);
  const b = new Date(toParts[0], toParts[1] - 1, toParts[2]);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * Pengingat Target:
 * - Jika reminderMode === 'daily': mengingatkan setiap hari pada jam yang dipilih (reminderTime) sampai batas hari target.
 * - Jika reminderMode === 'deadline_only': hanya mengingatkan saat hari batas target selesai tiba (deadlineDate === today).
 */
export function checkAllTargetsForReminders(targets: TargetItem[]): void {
  if (!targets || !Array.isArray(targets) || targets.length === 0) return;
  const settings = getNotificationSettings();
  if (!settings.enabled || settings.targetReminders === false) return;
  if (!isWebNotificationSupported() || Notification.permission !== 'granted') return;

  const now = new Date();
  const todayStr = getTodayDateString(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  targets.forEach((target) => {
    if (target.completed) return;

    const isDoneToday =
      Array.isArray(target.completedDates) && target.completedDates.includes(todayStr);

    if (target.reminderMode === 'daily') {
      if (isDoneToday) return;
      if (target.deadlineDate && todayStr > target.deadlineDate) return;

      const timeStr = target.reminderTime || '09:00';
      const [hhRaw, mmRaw] = timeStr.split(':').map(Number);
      const hh = Number.isNaN(hhRaw) ? 9 : hhRaw;
      const mm = Number.isNaN(mmRaw) ? 0 : mmRaw;
      const targetMinutes = hh * 60 + mm;

      if (nowMinutes >= targetMinutes) {
        const keyDaily = `ascend_target_notif_daily_${target.id}_${todayStr}`;
        try {
          if (localStorage.getItem(keyDaily) !== 'true') {
            const deadlineLabel = target.deadlineDate ? formatDeadlineDateId(target.deadlineDate) : '';
            const remainingDays = calcRemainingDaysIso(todayStr, target.deadlineDate);

            let title = `🎯 Kamu Pasti Bisa! Target: ${target.title}`;
            let body = '';

            if (target.deadlineDate && remainingDays === 0) {
              title = `⏰ Hari Ini Batas Target Kamu: ${target.title}`;
              body = `Batas target kamu hari ini (${deadlineLabel}) dan kamu harus mencapainya! Kamu pasti bisa menyelesaikannya dengan hasil terbaik!`;
            } else if (target.deadlineDate && remainingDays !== null && remainingDays > 0) {
              body = `Batas target kamu ${deadlineLabel} dan kamu harus mencapainya, dan kamu akan diingatkan setiap hari pada jam ${timeStr} dalam ${remainingDays} hari ke depan agar kamu mencapai targetmu. Tetap semangat, langkah kecil hari ini sangat berarti!`;
            } else {
              body = `Pengingat harian pada jam ${timeStr} untuk target "${target.title}". Tetap semangat, kamu selangkah lebih dekat mencapai targetmu!`;
            }

            void sendDeviceNotification(title, {
              body,
              tag: `target-daily-${target.id}-${todayStr}`,
            });
            localStorage.setItem(keyDaily, 'true');
          }
        } catch {}
      }
      return;
    }

    if (target.reminderMode === 'deadline_only' && target.deadlineDate) {
      if (todayStr === target.deadlineDate) {
        const keyDeadline = `ascend_target_notif_deadline_${target.id}_${todayStr}`;
        try {
          if (localStorage.getItem(keyDeadline) !== 'true') {
            const deadlineLabel = formatDeadlineDateId(target.deadlineDate);
            void sendDeviceNotification(`⏰ Hari Batas Target Tiba: ${target.title}`, {
              body: `Hari ini (${deadlineLabel}) adalah batas target kamu untuk "${target.title}" dan kamu harus mencapainya! Terus melangkah dengan yakin, kamu mampu menuntaskan targetmu hari ini!`,
              tag: `target-deadline-${target.id}-${todayStr}`,
            });
            localStorage.setItem(keyDeadline, 'true');
          }
        } catch {}
      }
    }
  });
}

/**
 * Kirim notifikasi konfirmasi langsung ke HP / perangkat pengguna saat pengingat target disimpan
 */
export async function sendTargetConfirmationNotification(
  targetTitle: string,
  reminderMode: 'daily' | 'deadline_only',
  reminderTime?: string,
  deadlineDate?: string
): Promise<boolean> {
  if (!isWebNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }
  saveNotificationSettings({ enabled: true, targetReminders: true });

  const todayStr = getTodayDateString();
  const deadlineLabel = deadlineDate ? formatDeadlineDateId(deadlineDate) : 'sesuai jadwal';
  const remainingDays = calcRemainingDaysIso(todayStr, deadlineDate);
  const jam = reminderTime || '09:00';

  let title = '';
  let body = '';

  if (reminderMode === 'daily') {
    title = `🔔 Semangat! Target Kamu Disimpan: ${targetTitle}`;
    if (remainingDays !== null && remainingDays > 0) {
      body = `Batas target kamu ${deadlineLabel} dan kamu harus mencapainya, dan kamu akan diingatkan setiap hari pada jam ${jam} dalam ${remainingDays} hari ke depan agar kamu mencapai targetmu. Kamu pasti bisa!`;
    } else {
      body = `Batas target kamu ${deadlineLabel} dan kamu harus mencapainya, dan kamu akan diingatkan pada jam ${jam} agar kamu mencapai targetmu. Kamu pasti bisa!`;
    }
  } else {
    title = `🔔 Target Disimpan! Kamu Pasti Bisa: ${targetTitle}`;
    body = `Batas target kamu ${deadlineLabel} dan kamu harus mencapainya, dan nanti kamu akan diingatkan ketika hari selesai target. Tetap fokus dan percaya pada prosesmu!`;
  }

  return sendDeviceNotification(title, {
    body,
    tag: `target-confirm-${Date.now()}`,
  });
}

/**
 * Kirim notifikasi uji coba pengingat target ke HP / perangkat pengguna
 */
export async function sendTargetTestNotification(sampleTitle?: string): Promise<boolean> {
  const perm = getNotificationPermissionStatus();
  if (perm !== 'granted') {
    const requested = await requestNotificationPermission();
    if (requested !== 'granted') return false;
  }
  saveNotificationSettings({ enabled: true, targetReminders: true });
  return sendDeviceNotification('🔔 Notifikasi Target HP & Perangkat Aktif!', {
    body: sampleTitle
      ? `Siap menyemangatimu! Pengingat untuk "${sampleTitle}" akan muncul langsung di perangkatmu agar kamu mencapai targetmu.`
      : 'Notifikasi perangkat aktif! Setiap pengingat target siap menyemangatimu langsung di HP atau komputermu.',
    tag: `target-test-${Date.now()}`,
  });
}

const INITIAL_PERMISSIONS_PROMPTED_KEY = 'ascend_initial_permissions_prompted';
let isRequestingInitialPermissions = false;

const stopMediaTracksSafe = (stream: MediaStream | null | undefined) => {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
  } catch {}
};

const isPermissionAlreadyGranted = async (name: 'microphone' | 'camera'): Promise<boolean> => {
  if (typeof navigator === 'undefined') return false;
  try {
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      const status = await navigator.permissions.query({ name: name as PermissionName });
      return status.state === 'granted';
    }
  } catch {}
  return false;
};

/**
 * Langsung memunculkan dialog izin resmi browser untuk Notifikasi, Audio (Mikrofon), dan Kamera
 * saat pengguna baru masuk tanpa menampilkan kartu/modal perantara.
 */
export async function requestInitialDevicePermissions(): Promise<void> {
  if (typeof window === 'undefined' || isRequestingInitialPermissions) return;

  try {
    if (localStorage.getItem(INITIAL_PERMISSIONS_PROMPTED_KEY) === 'true') {
      return;
    }
  } catch {}

  isRequestingInitialPermissions = true;

  try {
    // 1. Langsung minta izin Notifikasi jika masih 'default'
    if (isWebNotificationSupported() && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {}
    }

    // 2. Langsung minta izin Audio (Mikrofon) & Kamera jika belum granted
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      const [micGranted, camGranted] = await Promise.all([
        isPermissionAlreadyGranted('microphone'),
        isPermissionAlreadyGranted('camera'),
      ]);

      const needAudio = !micGranted;
      const needCamera = !camGranted;

      if (needAudio || needCamera) {
        let combinedStream: MediaStream | null = null;
        try {
          combinedStream = await navigator.mediaDevices.getUserMedia({
            audio: needAudio,
            video: needCamera,
          });
        } catch {
          stopMediaTracksSafe(combinedStream);
          combinedStream = null;

          if (needAudio) {
            let audioStream: MediaStream | null = null;
            try {
              audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch {
            } finally {
              stopMediaTracksSafe(audioStream);
            }
          }

          if (needCamera) {
            let videoStream: MediaStream | null = null;
            try {
              videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
            } catch {
            } finally {
              stopMediaTracksSafe(videoStream);
            }
          }
        } finally {
          stopMediaTracksSafe(combinedStream);
        }
      }
    }

    try {
      localStorage.setItem(INITIAL_PERMISSIONS_PROMPTED_KEY, 'true');
    } catch {}
  } finally {
    isRequestingInitialPermissions = false;
  }
}




