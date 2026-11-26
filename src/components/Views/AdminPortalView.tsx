import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Users,
  Activity,
  Megaphone,
  Lock,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  Clock,
  Download,
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  FileText,
  MessageSquare,
  Sliders,
  Check,
  Shield,
  Calendar,
  Flame,
  Wallet,
  Award,
  Star,
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { UserProfile, AppAnnouncement } from '../../types';
import { dbService, isSupabaseConfigured } from '../../lib/supabaseService';
import { checkIsAdminUser } from '../../utils/admin';
import { AdminFeedbackView } from './AdminFeedbackView';
import { AnimatedCounter } from '../AnimatedCounter';

interface AdminPortalViewProps {
  currentUser?: User | null;
  userProfile: UserProfile;
  announcements?: AppAnnouncement[];
  onAnnouncementsUpdated?: (list: AppAnnouncement[]) => void;
  onOpenAnnouncementsAdmin?: () => void;
  onShowToast?: (msg: string) => void;
  onNavigateToDashboard?: () => void;
  theme?: 'dark' | 'light';
}

type AdminTab = 'dashboard' | 'features' | 'announcements' | 'security' | 'feedback';

type TableHealthEntry = {
  exists: boolean;
  accessible: boolean;
  label: string;
  count: number | null;
  error?: string;
};

type AdminProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role?: 'user' | 'admin';
  avatar_url: string | null;
  streak_days: number;
  last_streak_date: string | null;
  first_app_open_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  has_feedback: boolean;
};

type AdminAuditEvent = {
  id: string;
  action: string;
  category: 'user' | 'announcement' | 'feedback' | 'report' | 'security' | 'database';
  details: string;
  timestamp: string;
  actor: string;
  sourceTable: string;
};

const EMPTY_COUNTS = {
  totalUsers: 0,
  activeUsers: 0,
  agendasTotal: 0,
  agendasActive: 0,
  agendasCompleted: 0,
  habitsTotal: 0,
  journalsTotal: 0,
  walletsTotal: 0,
  walletTransactionsTotal: 0,
  targetsTotal: 0,
  calendarEventsTotal: 0,
  announcementsTotal: 0,
  feedbacksTotal: 0,
  pdfReportsTotal: 0,
};

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({
  currentUser,
  userProfile,
  announcements: propAnnouncements = [],
  onAnnouncementsUpdated,
  onOpenAnnouncementsAdmin,
  onShowToast,
  onNavigateToDashboard,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const isAdmin = checkIsAdminUser(currentUser, userProfile);

  const [activePortalTab, setActivePortalTab] = useState<AdminTab>('dashboard');

  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean>(() => isSupabaseConfigured());
  const [sessionVerified, setSessionVerified] = useState<boolean>(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [userProfilesList, setUserProfilesList] = useState<AdminProfileRow[]>([]);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [cloudAnnouncements, setCloudAnnouncements] = useState<AppAnnouncement[]>([]);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);
  const [tablesHealth, setTablesHealth] = useState<Record<string, TableHealthEntry>>({});
  const [allTablesOk, setAllTablesOk] = useState<boolean>(false);
  const [systemErrors, setSystemErrors] = useState<string[]>([]);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [totalDbRecords, setTotalDbRecords] = useState<number>(0);
  const [dbLatencyMs, setDbLatencyMs] = useState<number | null>(null);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [announcementDeleteConfirmId, setAnnouncementDeleteConfirmId] = useState<string | null>(null);
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState<string | null>(null);
  const [kpiTouchKeys, setKpiTouchKeys] = useState<[number, number, number, number]>([0, 0, 0, 0]);

  const replayKpiCard = (index: 0 | 1 | 2 | 3) => {
    setKpiTouchKeys((prev) => {
      const next: [number, number, number, number] = [...prev] as [number, number, number, number];
      next[index] = next[index] + 1;
      return next;
    });
  };

  const loadPortalData = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const overview = await dbService.fetchAdminPortalOverview();
      setSupabaseConfigured(overview.configured);
      setDbLatencyMs(overview.latencyMs);
      setSessionVerified(overview.sessionVerified);
      setSessionEmail(overview.sessionEmail);
      setAllTablesOk(overview.allTablesOk);
      setTablesHealth(overview.tablesHealth);
      setTotalDbRecords(overview.totalDbRecords);
      setCounts(overview.counts);
      setUserProfilesList(overview.userProfiles);
      setProfilesError(overview.profilesError || null);
      setCloudAnnouncements(overview.announcements);
      setAnnouncementsError(overview.announcementsError || null);
      setAuditEvents(overview.auditEvents);
      setSystemErrors(overview.systemErrors);
    } catch (err: any) {
      setSupabaseConfigured(isSupabaseConfigured());
      setAllTablesOk(false);
      setUserProfilesList([]);
      setCloudAnnouncements([]);
      setAuditEvents([]);
      setCounts(EMPTY_COUNTS);
      setTotalDbRecords(0);
      setSystemErrors([err?.message || 'Gagal memuat data Portal Administrator dari Supabase.']);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setIsLoadingStats(false);
      setUserProfilesList([]);
      setCloudAnnouncements([]);
      setAuditEvents([]);
      setCounts(EMPTY_COUNTS);
      return;
    }
    loadPortalData();
  }, [isAdmin, loadPortalData, currentUser?.id, propAnnouncements.length]);

  const handleExportSystemBackup = () => {
    try {
      const backupData = {
        exportedAt: new Date().toISOString(),
        exportedBy: sessionEmail || currentUser?.email || null,
        supabaseConfigured,
        sessionVerified,
        allTablesOk,
        latencyMs: dbLatencyMs,
        counts,
        tablesHealth,
        userProfiles: userProfilesList,
        announcements: cloudAnnouncements,
        auditEvents,
        systemErrors,
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ASCEND_JOURNAL_SUPABASE_SNAPSHOT_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onShowToast?.('Snapshot data Supabase berhasil diunduh.');
    } catch {
      onShowToast?.('Gagal mengunduh snapshot data Supabase.');
    }
  };

  if (!isAdmin) {
    return (
      <div
        className={`w-full min-h-[60vh] flex items-center justify-center p-4 sm:p-6 text-center ${
          isLight ? 'text-slate-900' : 'text-white'
        }`}
      >
        <div
          className={`max-w-md p-6 sm:p-8 rounded-2xl border shadow-sm ${
            isLight ? 'bg-white border-rose-200' : 'bg-[#0f172a] border-rose-500/30'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 mx-auto flex items-center justify-center mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="font-['Poppins',sans-serif] text-lg font-bold tracking-tight mb-2">
            Akses Ditolak
          </h2>
          <p className={`text-xs font-normal mb-5 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Halaman Portal Administrator hanya dapat diakses oleh akun yang memiliki role{' '}
            <span className="font-['JetBrains_Mono',monospace] font-semibold">admin</span> resmi di Supabase.
          </p>
          <button
            type="button"
            onClick={onNavigateToDashboard}
            className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs transition-all cursor-pointer"
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  // Token warna & hirarki tipografi konsisten untuk Tema Terang & Gelap
  const cardSurface = isLight
    ? 'bg-white border-slate-200/90 text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.04)]'
    : 'bg-[#0f172a] border-white/10 text-white';

  const rowDividerColor = isLight ? 'border-slate-200/70' : 'border-white/10';
  const labelMuted = isLight ? 'text-slate-500' : 'text-slate-400';
  const bodyMuted = isLight ? 'text-slate-600' : 'text-slate-300';
  const skeletonBlock = isLight ? 'bg-slate-200' : 'bg-white/10';
  const skeletonSubtle = isLight ? 'bg-slate-100' : 'bg-white/5';

  const displayTitleClass = "font-['Poppins',sans-serif] font-semibold tracking-tight";
  const metricLabelClass = `text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider ${labelMuted}`;
  const monoNumberClass = "font-['JetBrains_Mono',monospace] tabular-nums";

  const tablesTotalCount = Object.keys(tablesHealth).length;
  const tablesAccessibleCount = Object.values(tablesHealth).filter((t) => t.exists && t.accessible).length;
  const tablesPercent = tablesTotalCount > 0 ? Math.round((tablesAccessibleCount / tablesTotalCount) * 100) : 0;
  const isDbHealthy = supabaseConfigured && allTablesOk && tablesPercent === 100 && systemErrors.length === 0;

  const moduleList = [
    {
      id: 'mod_agendas',
      name: 'Agenda & Tugas Harian',
      tableKey: 'agendas',
      icon: Calendar,
      accessible: Boolean(tablesHealth.agendas?.accessible),
      count: counts.agendasTotal,
      unit: 'agenda',
      detail: `${counts.agendasActive} aktif · ${counts.agendasCompleted} selesai`,
    },
    {
      id: 'mod_calendar',
      name: 'Kalender Jadwal Acara',
      tableKey: 'calendar_events',
      icon: Clock,
      accessible: Boolean(tablesHealth.calendar_events?.accessible),
      count: counts.calendarEventsTotal,
      unit: 'acara tercatat',
      detail: '',
    },
    {
      id: 'mod_habits',
      name: 'Pelacak Kebiasaan',
      tableKey: 'habits',
      icon: Flame,
      accessible: Boolean(tablesHealth.habits?.accessible),
      count: counts.habitsTotal,
      unit: 'kebiasaan tercatat',
      detail: '',
    },
    {
      id: 'mod_wallets',
      name: 'Manajemen Keuangan & Kas',
      tableKey: 'wallets',
      icon: Wallet,
      accessible: Boolean(tablesHealth.wallets?.accessible),
      count: counts.walletsTotal,
      unit: 'dompet',
      detail: `${counts.walletTransactionsTotal} transaksi`,
    },
    {
      id: 'mod_targets',
      name: 'Target & Sasaran',
      tableKey: 'targets',
      icon: Award,
      accessible: Boolean(tablesHealth.targets?.accessible),
      count: counts.targetsTotal,
      unit: 'target tercatat',
      detail: '',
    },
    {
      id: 'mod_journals',
      name: 'Catatan Jurnal Harian',
      tableKey: 'journals',
      icon: FileText,
      accessible: Boolean(tablesHealth.journals?.accessible),
      count: counts.journalsTotal,
      unit: 'catatan jurnal',
      detail: '',
    },
    {
      id: 'mod_feedbacks',
      name: 'Penilaian & Saran Pengguna',
      tableKey: 'user_feedbacks',
      icon: Star,
      accessible: Boolean(tablesHealth.user_feedbacks?.accessible),
      count: counts.feedbacksTotal,
      unit: 'ulasan tersimpan',
      detail: '',
    },
    {
      id: 'mod_announcements',
      name: 'Pemberitahuan Aplikasi',
      tableKey: 'announcements',
      icon: Megaphone,
      accessible: Boolean(tablesHealth.announcements?.accessible),
      count: counts.announcementsTotal,
      unit: 'pemberitahuan',
      detail: '',
    },
  ];

  const portalNavItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'features', label: 'Status Modul', icon: Sliders },
    { id: 'announcements', label: 'Pengumuman', icon: Megaphone },
    { id: 'security', label: 'Keamanan', icon: Shield },
    { id: 'feedback', label: 'Bantuan', icon: MessageSquare },
  ];

  const renderTabRefreshButton = (titleText = 'Segarkan data halaman ini') => (
    <button
      type="button"
      onClick={loadPortalData}
      disabled={isLoadingStats}
      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap disabled:opacity-50 ${
        isLight
          ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
          : 'bg-white/5 hover:bg-white/10 border-white/15 text-white'
      }`}
      title={titleText}
    >
      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? 'animate-spin' : ''}`} />
      <span>{isLoadingStats ? 'Memuat...' : 'Segarkan'}</span>
    </button>
  );

  return (
    <div
      className={`w-full pb-28 sm:pb-20 transition-colors duration-200 ${
        isLight ? 'bg-transparent text-slate-900' : 'bg-transparent text-white'
      }`}
    >
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-5">
        {/* 1. Header Ringkas Portal Administrator */}
        <div
          className={`rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 border transition-colors ${
            isLight
              ? 'bg-white border-slate-200/90 text-slate-900 shadow-[0_1px_4px_rgba(15,23,42,0.04)]'
              : 'bg-[#0f172a] border-white/10 text-white'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-1.5">
                {isLoadingStats ? (
                  <span className={`h-3.5 w-32 rounded animate-pulse inline-block ${skeletonBlock}`} />
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider ${
                      !supabaseConfigured
                        ? isLight
                          ? 'text-rose-700'
                          : 'text-rose-400'
                        : isDbHealthy
                          ? isLight
                            ? 'text-emerald-700'
                            : 'text-emerald-400'
                          : isLight
                            ? 'text-amber-700'
                            : 'text-amber-400'
                    }`}
                  >
                    {!supabaseConfigured ? (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    ) : isDbHealthy ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>
                      {!supabaseConfigured
                        ? 'Supabase Belum Terhubung'
                        : isDbHealthy
                          ? 'Supabase Optimal'
                          : 'Periksa Tabel & RLS'}
                    </span>
                  </span>
                )}
              </div>
              <h1 className={`font-['Poppins',sans-serif] text-lg sm:text-2xl font-bold tracking-tight leading-snug truncate`}>
                Portal Administrator
              </h1>
            </div>
          </div>
        </div>

        {/* 2. Langsung Tampilkan Ringkasan Statistik Utama di Bagian Atas */}
        {isLoadingStats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5" aria-busy="true">
            {[0, 1, 2, 3].map((idx) => (
              <div key={idx} className={`p-3.5 sm:p-4 rounded-2xl border space-y-2.5 ${cardSurface}`}>
                <div className="flex items-center justify-between">
                  <div className={`h-3 w-20 rounded animate-pulse ${skeletonBlock}`} />
                  <div className={`w-7 h-7 rounded-lg animate-pulse ${skeletonSubtle}`} />
                </div>
                <div className={`h-7 w-16 rounded-md animate-pulse ${skeletonBlock}`} />
                <div className={`h-3 w-28 rounded animate-pulse ${skeletonSubtle}`} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
            {/* KPI 1: Total Pengguna */}
            <div
              onClick={() => replayKpiCard(0)}
              className={`group p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 hover:-translate-y-1 active:scale-[0.96] active:translate-y-0.5 cursor-pointer select-none ${
                isLight
                  ? 'bg-gradient-to-br from-sky-50 via-white to-blue-50/70 border-sky-200/80 text-slate-900 shadow-[0_2px_10px_rgba(2,132,199,0.06)] hover:shadow-md'
                  : 'bg-gradient-to-br from-sky-950/60 via-[#0f172a] to-blue-950/40 border-sky-500/25 text-white hover:border-sky-400/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider ${
                    isLight ? 'text-sky-700/90' : 'text-sky-300/85'
                  }`}
                >
                  Total Pengguna
                </span>
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 group-active:scale-95 ${
                    isLight ? 'bg-sky-100 text-sky-700' : 'bg-sky-500/20 text-sky-300'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                </div>
              </div>
              <div
                className={`text-2xl sm:text-3xl font-bold tracking-tight mt-1.5 inline-block origin-left transition-transform duration-200 group-hover:scale-105 group-active:translate-x-0.5 ${monoNumberClass} ${
                  isLight ? 'text-sky-950' : 'text-sky-200'
                }`}
              >
                <AnimatedCounter key={`kpi-0-${kpiTouchKeys[0]}`} value={counts.totalUsers} />
              </div>
              <p
                className={`text-[11px] font-normal mt-1 truncate ${
                  isLight ? 'text-sky-800/75' : 'text-sky-200/65'
                }`}
              >
                {profilesError ? 'Gagal memuat profil' : 'Akun terdaftar'}
              </p>
            </div>

            {/* KPI 2: Pengguna Aktif */}
            <div
              onClick={() => replayKpiCard(1)}
              className={`group p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 hover:-translate-y-1 active:scale-[0.96] active:translate-y-0.5 cursor-pointer select-none ${
                isLight
                  ? 'bg-gradient-to-br from-emerald-50 via-white to-teal-50/70 border-emerald-200/80 text-slate-900 shadow-[0_2px_10px_rgba(16,185,129,0.06)] hover:shadow-md'
                  : 'bg-gradient-to-br from-emerald-950/60 via-[#0f172a] to-teal-950/40 border-emerald-500/25 text-white hover:border-emerald-400/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider ${
                    isLight ? 'text-emerald-700/90' : 'text-emerald-300/85'
                  }`}
                >
                  Pengguna Aktif
                </span>
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 group-active:scale-95 ${
                    isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                </div>
              </div>
              <div
                className={`text-2xl sm:text-3xl font-bold tracking-tight mt-1.5 inline-block origin-left transition-transform duration-200 group-hover:scale-105 group-active:translate-x-0.5 ${monoNumberClass} ${
                  isLight ? 'text-emerald-900' : 'text-emerald-300'
                }`}
              >
                <AnimatedCounter key={`kpi-1-${kpiTouchKeys[1]}`} value={counts.activeUsers} />
              </div>
              <p
                className={`text-[11px] font-normal mt-1 truncate ${
                  isLight ? 'text-emerald-800/75' : 'text-emerald-200/65'
                }`}
              >
                Streak &gt; 0 hari
              </p>
            </div>

            {/* KPI 3: Data Supabase */}
            <div
              onClick={() => replayKpiCard(2)}
              className={`group p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 hover:-translate-y-1 active:scale-[0.96] active:translate-y-0.5 cursor-pointer select-none ${
                isLight
                  ? 'bg-gradient-to-br from-indigo-50 via-white to-slate-50 border-indigo-200/80 text-slate-900 shadow-[0_2px_10px_rgba(79,70,229,0.06)] hover:shadow-md'
                  : 'bg-gradient-to-br from-indigo-950/60 via-[#0f172a] to-slate-900 border-indigo-500/25 text-white hover:border-indigo-400/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider ${
                    isLight ? 'text-indigo-700/90' : 'text-indigo-300/85'
                  }`}
                >
                  Data Supabase
                </span>
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 group-active:scale-95 ${
                    isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500/20 text-indigo-300'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                </div>
              </div>
              <div
                className={`text-2xl sm:text-3xl font-bold tracking-tight mt-1.5 inline-block origin-left transition-transform duration-200 group-hover:scale-105 group-active:translate-x-0.5 ${monoNumberClass} ${
                  isLight ? 'text-indigo-950' : 'text-indigo-200'
                }`}
              >
                <AnimatedCounter key={`kpi-2-${kpiTouchKeys[2]}`} value={totalDbRecords} />
              </div>
              <p
                className={`text-[11px] font-normal mt-1 truncate ${monoNumberClass} ${
                  isLight ? 'text-indigo-800/75' : 'text-indigo-200/65'
                }`}
              >
                {counts.agendasTotal} agenda · {counts.habitsTotal} habit
              </p>
            </div>

            {/* KPI 4: Integritas Database */}
            <div
              onClick={() => replayKpiCard(3)}
              className={`group p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 hover:-translate-y-1 active:scale-[0.96] active:translate-y-0.5 cursor-pointer select-none ${
                isDbHealthy
                  ? isLight
                    ? 'bg-gradient-to-br from-teal-50 via-white to-cyan-50/70 border-teal-200/80 text-slate-900 shadow-[0_2px_10px_rgba(13,148,136,0.06)] hover:shadow-md'
                    : 'bg-gradient-to-br from-teal-950/60 via-[#0f172a] to-cyan-950/40 border-teal-500/25 text-white hover:border-teal-400/50'
                  : isLight
                    ? 'bg-gradient-to-br from-amber-50 via-white to-orange-50/60 border-amber-200/80 text-slate-900 shadow-[0_2px_10px_rgba(217,119,6,0.06)] hover:shadow-md'
                    : 'bg-gradient-to-br from-amber-950/55 via-[#0f172a] to-orange-950/35 border-amber-500/25 text-white hover:border-amber-400/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider ${
                    isDbHealthy
                      ? isLight
                        ? 'text-teal-700/90'
                        : 'text-teal-300/85'
                      : isLight
                        ? 'text-amber-700/90'
                        : 'text-amber-300/85'
                  }`}
                >
                  Integritas DB
                </span>
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 group-active:scale-95 ${
                    isDbHealthy
                      ? isLight
                        ? 'bg-teal-100 text-teal-700'
                        : 'bg-teal-500/20 text-teal-300'
                      : isLight
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                </div>
              </div>
              <div
                className={`text-2xl sm:text-3xl font-bold tracking-tight mt-1.5 flex items-baseline gap-1 origin-left transition-transform duration-200 group-hover:scale-105 group-active:translate-x-0.5 ${monoNumberClass} ${
                  isDbHealthy
                    ? isLight
                      ? 'text-teal-900'
                      : 'text-teal-200'
                    : isLight
                      ? 'text-amber-900'
                      : 'text-amber-200'
                }`}
              >
                <AnimatedCounter
                  key={`kpi-3-${kpiTouchKeys[3]}`}
                  value={tablesTotalCount > 0 ? tablesPercent : 0}
                  suffix="%"
                />
                <span className="font-['Plus_Jakarta_Sans',sans-serif] text-xs font-semibold">Siap</span>
              </div>
              <p
                className={`text-[11px] font-normal mt-1 truncate ${monoNumberClass} ${
                  isDbHealthy
                    ? isLight
                      ? 'text-teal-800/75'
                      : 'text-teal-200/65'
                    : isLight
                      ? 'text-amber-800/75'
                      : 'text-amber-200/65'
                }`}
              >
                {tablesAccessibleCount}/{tablesTotalCount} tabel{dbLatencyMs !== null ? ` · ${dbLatencyMs}ms` : ''}
              </p>
            </div>
          </div>
        )}

        {/* 3. Baris Ikon Ringkas Pemilihan Fitur (Horizontal Scroll Tanpa Kotak Besar) */}
        <nav
          aria-label="Navigasi fitur admin"
          className="flex items-start justify-start sm:justify-between gap-3.5 sm:gap-4 overflow-x-auto py-1 px-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {portalNavItems.map((tab) => {
            const Icon = tab.icon;
            const isActive = activePortalTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivePortalTab(tab.id)}
                className="flex flex-col items-center justify-start shrink-0 min-w-[66px] sm:min-w-[80px] group cursor-pointer active:scale-95 transition-transform"
              >
                <div
                  className={`w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-2xl border flex items-center justify-center shrink-0 transition-all duration-150 ${
                    isActive
                      ? isLight
                        ? 'bg-[#0B1324] border-[#0B1324] text-teal-300 shadow-sm'
                        : 'bg-teal-500/20 border-teal-400/60 text-teal-300 shadow-sm'
                      : isLight
                        ? 'bg-white border-slate-200/90 text-slate-600 shadow-[0_2px_8px_rgba(15,23,42,0.04)] group-hover:border-slate-300 group-hover:text-slate-900'
                        : 'bg-[#141F36] border-slate-700/60 text-slate-300 group-hover:border-slate-500 group-hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5 stroke-[2]" />
                </div>
                <span
                  className={`mt-1.5 text-center text-[11px] sm:text-xs leading-tight whitespace-nowrap transition-colors ${
                    isActive
                      ? isLight
                        ? 'font-bold text-slate-950'
                        : 'font-bold text-teal-300'
                      : isLight
                        ? 'font-semibold text-slate-600 group-hover:text-slate-900'
                        : 'font-semibold text-slate-400 group-hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Banner Peringatan jika Supabase belum terhubung atau ada kendala query/RLS */}
        {!isLoadingStats && (!supabaseConfigured || systemErrors.length > 0) && activePortalTab !== 'feedback' && (
          <div
            className={`p-3.5 sm:p-4 rounded-2xl border flex items-start gap-2.5 text-xs ${
              !supabaseConfigured
                ? isLight
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                : isLight
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-100'
            }`}
          >
            <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <div className="space-y-0.5 min-w-0">
              <p className="font-semibold">
                {!supabaseConfigured
                  ? 'Koneksi Supabase Belum Terhubung'
                  : `Terdeteksi ${systemErrors.length} Catatan Query Supabase`}
              </p>
              <p className="font-normal opacity-85 leading-relaxed">
                {!supabaseConfigured
                  ? 'Metrik menampilkan kondisi kosong karena aplikasi belum terhubung ke proyek Supabase.'
                  : systemErrors[0]}
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: DASHBOARD ADMIN (DAFTAR PENGGUNA & RINGKASAN INFRASTRUKTUR)        */}
        {/* ========================================================================= */}
        {activePortalTab === 'dashboard' && (
          <div className="animate-in fade-in duration-150">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-7">
              {/* Kolom Kiri: Daftar Pengguna Database */}
              <div className="lg:col-span-7 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className={`w-5 h-5 shrink-0 ${isLight ? 'text-teal-700' : 'text-teal-400'}`} />
                    <h2 className={`${displayTitleClass} text-lg sm:text-xl font-bold truncate`}>
                      Daftar Pengguna Database
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border shrink-0 ${monoNumberClass} ${
                        isLight
                          ? 'bg-teal-50 text-teal-800 border-teal-200'
                          : 'bg-teal-500/10 text-teal-300 border-teal-500/25'
                      }`}
                    >
                      {isLoadingStats ? '...' : `${userProfilesList.length} Akun`}
                    </span>
                    {renderTabRefreshButton('Segarkan data pengguna dan statistik dashboard')}
                  </div>
                </div>

                {isLoadingStats ? (
                  <div className="space-y-2.5" aria-busy="true">
                    {[0, 1, 2].map((idx) => (
                      <div key={idx} className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${cardSurface}`}>
                        <div className="space-y-1.5 flex-1">
                          <div className={`h-3.5 w-32 rounded animate-pulse ${skeletonBlock}`} />
                          <div className={`h-3 w-44 rounded animate-pulse ${skeletonSubtle}`} />
                        </div>
                        <div className={`h-6 w-20 rounded-lg animate-pulse ${skeletonBlock}`} />
                      </div>
                    ))}
                  </div>
                ) : profilesError ? (
                  <div
                    className={`p-4 rounded-2xl border text-xs flex items-start gap-2.5 ${
                      isLight ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    }`}
                  >
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${isLight ? 'text-rose-600' : 'text-rose-400'}`} />
                    <div>
                      <p className="font-semibold">Gagal membaca daftar profil</p>
                      <p className="font-normal opacity-85 mt-0.5">{profilesError}</p>
                    </div>
                  </div>
                ) : userProfilesList.length === 0 ? (
                  <div className={`p-6 rounded-2xl border text-center text-xs font-normal ${cardSurface} ${labelMuted}`}>
                    Belum ada pengguna terdaftar di database Supabase.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5 custom-scrollbar">
                    {userProfilesList.map((user) => {
                      const displayName = user.full_name?.trim() || 'Tanpa nama';
                      const displayEmail = user.email?.trim() || '-';
                      const isRowAdmin = user.role === 'admin';

                      return (
                        <div
                          key={user.id}
                          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs transition-colors ${
                            isRowAdmin
                              ? isLight
                                ? 'bg-amber-50/90 border-amber-200 text-amber-950 shadow-[0_1px_3px_rgba(217,119,6,0.06)]'
                                : 'bg-amber-950/30 border-amber-500/30 text-amber-100'
                              : cardSurface
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`${displayTitleClass} text-[13px] sm:text-sm truncate`}>
                                {displayName}
                              </span>
                              {isRowAdmin && (
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border shrink-0 ${
                                    isLight
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                  }`}
                                >
                                  Admin
                                </span>
                              )}
                            </div>
                            <div className={`text-[11px] font-normal flex items-center gap-1.5 mt-0.5 min-w-0 ${labelMuted}`}>
                              <span className="truncate">{displayEmail}</span>
                              <span aria-hidden="true" className="shrink-0">·</span>
                              <span className={`text-[10px] shrink-0 ${monoNumberClass}`}>
                                {user.created_at ? new Date(user.created_at).toLocaleDateString('id-ID') : '-'}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border inline-block ${monoNumberClass} ${
                                isLight
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              {user.streak_days} Hari
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Kolom Kanan: Ringkasan Infrastruktur Supabase */}
              <div className="lg:col-span-5 space-y-3.5">
                <div className="flex items-center gap-2 px-0.5">
                  <Server className={`w-5 h-5 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                  <h2 className={`${displayTitleClass} text-lg sm:text-xl font-bold`}>
                    Ringkasan Infrastruktur
                  </h2>
                </div>

                {isLoadingStats ? (
                  <div className="space-y-3 px-0.5" aria-busy="true">
                    {[0, 1, 2, 3, 4].map((idx) => (
                      <div key={idx} className="flex justify-between items-center py-1.5">
                        <div className={`h-3 w-28 rounded animate-pulse ${skeletonSubtle}`} />
                        <div className={`h-3.5 w-32 rounded animate-pulse ${skeletonBlock}`} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1 text-xs px-0.5">
                    <div className={`flex justify-between items-center py-2.5 border-b ${rowDividerColor} gap-3`}>
                      <span className={`font-normal ${labelMuted}`}>Database Engine</span>
                      <span className={`font-semibold text-right ${monoNumberClass}`}>PostgreSQL</span>
                    </div>
                    <div className={`flex justify-between items-center py-2.5 border-b ${rowDividerColor} gap-3`}>
                      <span className={`font-normal ${labelMuted}`}>Status Koneksi</span>
                      <span
                        className={`font-semibold flex items-center gap-1 text-right ${monoNumberClass} ${
                          !supabaseConfigured
                            ? isLight
                              ? 'text-rose-700'
                              : 'text-rose-400'
                            : isDbHealthy
                              ? isLight
                                ? 'text-emerald-700'
                                : 'text-emerald-400'
                              : isLight
                                ? 'text-amber-700'
                                : 'text-amber-400'
                        }`}
                      >
                        {supabaseConfigured ? (
                          <>
                            {isDbHealthy ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                            <span>
                              {isDbHealthy ? `Terkoneksi (${dbLatencyMs ?? '-'}ms)` : 'Kendala Tabel / RLS'}
                            </span>
                          </>
                        ) : (
                          <span>Belum Terhubung</span>
                        )}
                      </span>
                    </div>
                    <div className={`flex justify-between items-center py-2.5 border-b ${rowDividerColor} gap-3`}>
                      <span className={`font-normal ${labelMuted}`}>Sesi Login</span>
                      <span className={`font-semibold truncate max-w-[185px] text-right ${monoNumberClass}`} title={sessionEmail || '-'}>
                        {sessionVerified ? sessionEmail || '-' : 'Belum terverifikasi'}
                      </span>
                    </div>
                    <div className={`flex justify-between items-center py-2.5 border-b ${rowDividerColor} gap-3`}>
                      <span className={`font-normal ${labelMuted}`}>Profil Aktif</span>
                      <span
                        className={`font-semibold truncate max-w-[185px] text-right ${
                          isLight ? 'text-amber-700' : 'text-amber-400'
                        }`}
                      >
                        {userProfile.name?.trim() || 'Tanpa nama'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 gap-3">
                      <span className={`font-normal ${labelMuted}`}>Kendala Query</span>
                      <span
                        className={`font-semibold text-right ${monoNumberClass} ${
                          !supabaseConfigured || systemErrors.length > 0
                            ? isLight
                              ? 'text-amber-700'
                              : 'text-amber-400'
                            : isLight
                              ? 'text-emerald-700'
                              : 'text-emerald-400'
                        }`}
                      >
                        {supabaseConfigured
                          ? systemErrors.length === 0
                            ? '0 Kesalahan'
                            : `${systemErrors.length} Error`
                          : 'Nonaktif'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleExportSystemBackup}
                    disabled={isLoadingStats}
                    className={`w-full py-2.5 px-4 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                      isLight
                        ? 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-800'
                        : 'bg-teal-500/15 hover:bg-teal-500/25 border-teal-500/30 text-teal-300'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Snapshot Data</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: STATUS MODUL APLIKASI                                              */}
        {/* ========================================================================= */}
        {activePortalTab === 'features' && (
          <div className="animate-in fade-in duration-150">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <h2 className={`${displayTitleClass} text-lg sm:text-xl font-bold truncate`}>
                  Status Modul Aplikasi
                </h2>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border shrink-0 ${monoNumberClass} ${
                      isLight
                        ? 'bg-teal-50 text-teal-800 border-teal-200'
                        : 'bg-teal-500/10 text-teal-300 border-teal-500/25'
                    }`}
                  >
                    {isLoadingStats ? '...' : `${tablesAccessibleCount}/${tablesTotalCount} Modul`}
                  </span>
                  {renderTabRefreshButton('Segarkan status modul aplikasi')}
                </div>
              </div>

              {isLoadingStats ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3" aria-busy="true">
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
                    <div key={idx} className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${cardSurface}`}>
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`w-9 h-9 rounded-xl animate-pulse ${skeletonBlock}`} />
                        <div className="space-y-1.5 flex-1">
                          <div className={`h-3.5 w-36 rounded animate-pulse ${skeletonBlock}`} />
                          <div className={`h-3 w-48 rounded animate-pulse ${skeletonSubtle}`} />
                        </div>
                      </div>
                      <div className={`h-5 w-16 rounded-lg animate-pulse ${skeletonBlock}`} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {moduleList.map((mod) => {
                    const FeatureIcon = mod.icon;
                    const tbl = tablesHealth[mod.tableKey];
                    const isReady = Boolean(tbl?.exists && tbl?.accessible);
                    const isExistsButBlocked = Boolean(tbl?.exists && !tbl?.accessible);

                    return (
                      <div
                        key={mod.id}
                        className={`p-3.5 sm:p-4 rounded-2xl border transition-colors flex items-center justify-between gap-3 ${
                          isReady
                            ? isLight
                              ? 'bg-white border-emerald-200/90 shadow-[0_1px_3px_rgba(15,23,42,0.04)] text-slate-900'
                              : 'bg-[#0f172a] border-emerald-500/25 text-white'
                            : isExistsButBlocked
                              ? isLight
                                ? 'bg-amber-50/90 border-amber-200 text-slate-900'
                                : 'bg-amber-950/30 border-amber-500/30 text-white'
                              : isLight
                                ? 'bg-rose-50/90 border-rose-200 text-slate-900'
                                : 'bg-rose-950/30 border-rose-500/30 text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                              isReady
                                ? isLight
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : isExistsButBlocked
                                  ? isLight
                                    ? 'bg-amber-100 text-amber-700 border-amber-300'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                  : isLight
                                    ? 'bg-rose-100 text-rose-700 border-rose-300'
                                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            <FeatureIcon className="w-4 h-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <h3 className={`${displayTitleClass} text-[13px] sm:text-sm truncate`}>{mod.name}</h3>
                            <p className="mt-1 flex items-baseline gap-x-1.5 flex-wrap leading-snug">
                              {tbl?.error ? (
                                <span
                                  className={`text-xs font-medium ${
                                    isLight ? 'text-rose-700' : 'text-rose-300'
                                  }`}
                                >
                                  Error: {tbl.error}
                                </span>
                              ) : mod.accessible ? (
                                <>
                                  <span
                                    className={`text-lg sm:text-xl font-bold leading-none ${monoNumberClass} ${
                                      isLight ? 'text-teal-800' : 'text-teal-300'
                                    }`}
                                  >
                                    {mod.count}
                                  </span>
                                  <span
                                    className={`text-xs sm:text-[13px] font-semibold ${
                                      isLight ? 'text-slate-700' : 'text-slate-200'
                                    }`}
                                  >
                                    {mod.unit}
                                  </span>
                                  {mod.detail && (
                                    <span
                                      className={`text-xs font-medium ${monoNumberClass} ${
                                        isLight ? 'text-slate-500' : 'text-slate-400'
                                      }`}
                                    >
                                      · {mod.detail}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className={`text-sm font-semibold ${monoNumberClass} ${labelMuted}`}>
                                  -
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider border shrink-0 ${
                            isReady
                              ? isLight
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : isExistsButBlocked
                                ? isLight
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : isLight
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {isReady ? 'Tersedia' : isExistsButBlocked ? 'RLS' : 'Belum Ada'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: PENGUMUMAN & NOTIFIKASI PENGGUNA                                   */}
        {/* ========================================================================= */}
        {activePortalTab === 'announcements' && (
          <div className="animate-in fade-in duration-150">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
                <div className="min-w-0">
                  <h2 className={`${displayTitleClass} text-lg sm:text-xl font-bold`}>
                    Siaran Pengumuman &amp; Notifikasi
                  </h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {renderTabRefreshButton('Segarkan daftar pengumuman & notifikasi')}
                  {onOpenAnnouncementsAdmin && (
                    <button
                      type="button"
                      onClick={onOpenAnnouncementsAdmin}
                      className="px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tulis Pengumuman</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2.5">
                {isLoadingStats ? (
                  <div className="space-y-2.5" aria-busy="true">
                    {[0, 1].map((idx) => (
                      <div key={idx} className={`p-3.5 sm:p-4 rounded-2xl border space-y-2 ${cardSurface}`}>
                        <div className="flex items-center gap-2">
                          <div className={`h-3.5 w-16 rounded animate-pulse ${skeletonBlock}`} />
                          <div className={`h-3 w-24 rounded animate-pulse ${skeletonSubtle}`} />
                        </div>
                        <div className={`h-4 w-48 rounded animate-pulse ${skeletonBlock}`} />
                        <div className={`h-7 w-full rounded-lg animate-pulse ${skeletonSubtle}`} />
                      </div>
                    ))}
                  </div>
                ) : announcementsError ? (
                  <div
                    className={`p-4 rounded-2xl border text-xs flex items-start gap-2.5 ${
                      isLight ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    }`}
                  >
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${isLight ? 'text-rose-600' : 'text-rose-400'}`} />
                    <div>
                      <p className="font-semibold">Gagal memuat daftar pengumuman</p>
                      <p className="font-normal opacity-85 mt-0.5">{announcementsError}</p>
                    </div>
                  </div>
                ) : cloudAnnouncements.length === 0 ? (
                  <div className={`p-6 rounded-2xl border text-center text-xs font-normal ${cardSurface} ${labelMuted}`}>
                    Belum ada pengumuman yang tersimpan.
                  </div>
                ) : (
                  cloudAnnouncements.map((ann) => {
                    const getBadgeMeta = (type: string) => {
                      switch (type) {
                        case 'warning':
                          return {
                            icon: AlertTriangle,
                            bg: isLight
                              ? 'bg-amber-100 text-amber-700 border-amber-300'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30',
                          };
                        case 'update':
                          return {
                            icon: Sparkles,
                            bg: isLight
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                          };
                        case 'event':
                          return {
                            icon: Calendar,
                            bg: isLight
                              ? 'bg-purple-100 text-purple-700 border-purple-300'
                              : 'bg-purple-500/20 text-purple-300 border-purple-500/30',
                          };
                        default:
                          return {
                            icon: Megaphone,
                            bg: isLight
                              ? 'bg-sky-100 text-sky-700 border-sky-300'
                              : 'bg-sky-500/20 text-sky-300 border-sky-500/30',
                          };
                      }
                    };
                    const meta = getBadgeMeta(ann.type);
                    const AnnIcon = meta.icon;

                    return (
                      <div
                        key={ann.id}
                        className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${cardSurface}`}
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${meta.bg}`}>
                            <AnnIcon className="w-4 h-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap text-[10px] font-semibold uppercase tracking-wider">
                              <span className={isLight ? 'text-teal-700' : 'text-teal-300'}>{ann.type}</span>
                              <span aria-hidden="true" className={labelMuted}>·</span>
                              <span
                                className={
                                  ann.isActive
                                    ? isLight
                                      ? 'text-emerald-700'
                                      : 'text-emerald-400'
                                    : labelMuted
                                }
                              >
                                {ann.isActive ? 'Aktif' : 'Nonaktif'}
                              </span>
                              {ann.isPinned && (
                                <>
                                  <span aria-hidden="true" className={labelMuted}>·</span>
                                  <span className={isLight ? 'text-amber-700' : 'text-amber-300'}>Disematkan</span>
                                </>
                              )}
                              <span aria-hidden="true" className={labelMuted}>·</span>
                              <span className={`normal-case tracking-normal font-normal ${monoNumberClass} ${labelMuted}`}>
                                {ann.createdAt ? new Date(ann.createdAt).toLocaleDateString('id-ID') : '-'}
                              </span>
                            </div>
                            <h3 className={`${displayTitleClass} text-[13px] sm:text-sm`}>{ann.title || '-'}</h3>
                            <p className={`text-xs font-normal mt-0.5 line-clamp-2 leading-relaxed ${bodyMuted}`}>
                              {ann.message || '-'}
                            </p>
                            <p className={`text-[11px] font-normal mt-1 ${labelMuted}`}>
                              Penerbit: {ann.authorName?.trim() || ann.authorEmail || '-'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {onOpenAnnouncementsAdmin && (
                            <button
                              type="button"
                              onClick={onOpenAnnouncementsAdmin}
                              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                                isLight
                                  ? 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'
                                  : 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border-sky-500/30'
                              }`}
                              title="Buka untuk perbarui pengumuman"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Perbarui</span>
                            </button>
                          )}
                          {announcementDeleteConfirmId === ann.id ? (
                            <div className="flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
                              <span className={`text-[11px] font-semibold whitespace-nowrap ${isLight ? 'text-rose-700' : 'text-rose-300'}`}>
                                Hapus?
                              </span>
                              <button
                                type="button"
                                disabled={deletingAnnouncementId === ann.id}
                                onClick={async () => {
                                  setDeletingAnnouncementId(ann.id);
                                  const res = await dbService.deleteAnnouncementWithStatus(ann.id);
                                  setDeletingAnnouncementId(null);
                                  setAnnouncementDeleteConfirmId(null);
                                  if (!res.success) {
                                    onShowToast?.(`Gagal menghapus di Supabase: ${res.error || 'Akses ditolak'}`);
                                    return;
                                  }
                                  const nextList = cloudAnnouncements.filter((a) => a.id !== ann.id);
                                  setCloudAnnouncements(nextList);
                                  onAnnouncementsUpdated?.(nextList.filter((a) => a.isActive));
                                  onShowToast?.('Pemberitahuan berhasil dihapus dari Supabase.');
                                  await loadPortalData();
                                }}
                                className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                              >
                                Ya
                              </button>
                              <button
                                type="button"
                                onClick={() => setAnnouncementDeleteConfirmId(null)}
                                className={`px-2 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                                  isLight
                                    ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                                    : 'bg-white/10 hover:bg-white/20 text-white/80'
                                }`}
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAnnouncementDeleteConfirmId(ann.id)}
                              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                                isLight
                                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                  : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
                              }`}
                              title="Hapus pemberitahuan ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: KEAMANAN & RIWAYAT AKTIVITAS AUDIT                                 */}
        {/* ========================================================================= */}
        {activePortalTab === 'security' && (
          <div className="animate-in fade-in duration-150">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 px-0.5">
                <h2 className={`${displayTitleClass} text-lg sm:text-xl font-bold`}>
                  Keamanan Sesi &amp; Jejak Aktivitas
                </h2>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isLoadingStats ? (
                    <div className={`h-6 w-36 rounded-lg animate-pulse ${skeletonBlock}`} />
                  ) : (
                    <span
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 ${
                        sessionVerified
                          ? isLight
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : isLight
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate max-w-[200px]">
                        {sessionVerified ? `Sesi Aktif (${sessionEmail || '-'})` : 'Sesi Belum Terverifikasi'}
                      </span>
                    </span>
                  )}
                  {renderTabRefreshButton('Segarkan status sesi dan jejak aktivitas')}
                </div>
              </div>

              {isLoadingStats ? (
                <div className="space-y-2.5" aria-busy="true">
                  {[0, 1, 2, 3].map((idx) => (
                    <div key={idx} className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${cardSurface}`}>
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`w-8 h-8 rounded-lg animate-pulse ${skeletonBlock}`} />
                        <div className="space-y-1.5 flex-1">
                          <div className={`h-3.5 w-40 rounded animate-pulse ${skeletonBlock}`} />
                          <div className={`h-3 w-56 rounded animate-pulse ${skeletonSubtle}`} />
                        </div>
                      </div>
                      <div className={`h-3 w-24 rounded animate-pulse ${skeletonSubtle}`} />
                    </div>
                  ))}
                </div>
              ) : auditEvents.length === 0 ? (
                <div className={`p-6 rounded-2xl border text-center text-xs font-normal ${cardSurface} ${labelMuted}`}>
                  Belum ada riwayat aktivitas yang tercatat.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-0.5 custom-scrollbar">
                  {auditEvents.map((log) => (
                    <div
                      key={log.id}
                      className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-xs ${cardSurface}`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div
                            className={`${displayTitleClass} text-[13px] ${
                              isLight ? 'text-amber-800' : 'text-amber-400'
                            }`}
                          >
                            {log.action}
                          </div>
                          <p className={`mt-0.5 font-normal leading-relaxed ${bodyMuted}`}>{log.details}</p>
                          <div className={`text-[11px] mt-1 ${monoNumberClass} ${labelMuted}`}>
                            Aktor: {log.actor}
                          </div>
                        </div>
                      </div>
                      <div className={`sm:text-right shrink-0 text-[11px] pl-9 sm:pl-0 ${monoNumberClass} ${labelMuted}`}>
                        {new Date(log.timestamp).toLocaleString('id-ID')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: BANTUAN & FEEDBACK PENGGUNA                                        */}
        {/* ========================================================================= */}
        {activePortalTab === 'feedback' && (
          <div className="animate-in fade-in duration-150">
            <AdminFeedbackView
              currentUser={currentUser}
              userProfile={userProfile}
              onShowToast={onShowToast}
              onNavigateToDashboard={onNavigateToDashboard}
              theme={theme}
              embedded={true}
            />
          </div>
        )}
      </div>
    </div>
  );
};
