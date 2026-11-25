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
import { checkIsAdminUser, DEFAULT_ADMIN_EMAILS } from '../../utils/admin';
import { AdminFeedbackView } from './AdminFeedbackView';

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

type AdminTab = 'dashboard' | 'features' | 'announcements' | 'security' | 'system' | 'feedback';

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
    loadPortalData();
  }, [loadPortalData, currentUser?.id, propAnnouncements.length]);

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
        className={`w-full min-h-[60vh] flex items-center justify-center p-6 text-center ${
          isLight ? 'text-slate-900' : 'text-white'
        }`}
      >
        <div
          className={`max-w-md p-8 rounded-3xl border shadow-xl ${
            isLight ? 'bg-white border-rose-200' : 'bg-[#0f172a] border-rose-500/30'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 mx-auto flex items-center justify-center mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold mb-2">Akses Dibatasi</h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Halaman ini merupakan portal eksklusif Administrator ASCEND Journal. Akun Anda tidak memiliki hak akses
            administratif.
          </p>
          <button
            type="button"
            onClick={onNavigateToDashboard}
            className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-all cursor-pointer"
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  const cardSurface = isLight
    ? 'bg-white border-slate-200/90 text-slate-900'
    : 'bg-[#0f172a] border-white/10 text-white';

  const skeletonBlock = isLight ? 'bg-slate-200' : 'bg-white/10';
  const skeletonSubtle = isLight ? 'bg-slate-100' : 'bg-white/5';

  const tablesTotalCount = Object.keys(tablesHealth).length;
  const tablesAccessibleCount = Object.values(tablesHealth).filter((t) => t.exists && t.accessible).length;
  const tablesPercent = tablesTotalCount > 0 ? Math.round((tablesAccessibleCount / tablesTotalCount) * 100) : 0;
  const isDbHealthy = supabaseConfigured && allTablesOk && tablesPercent === 100 && systemErrors.length === 0;

  const moduleList = [
    {
      id: 'mod_agendas',
      name: 'Agenda & Tugas Harian',
      tableKey: 'agendas',
      description: 'Manajemen tugas harian, status penyelesaian, dan penanda prioritas pengguna.',
      icon: Calendar,
      metricText:
        tablesHealth.agendas?.accessible
          ? `${counts.agendasTotal} baris (${counts.agendasActive} aktif • ${counts.agendasCompleted} selesai)`
          : '-',
    },
    {
      id: 'mod_calendar',
      name: 'Kalender Jadwal Acara',
      tableKey: 'calendar_events',
      description: 'Penjadwalan acara berdasarkan tanggal, jam, kategori, dan status selesai.',
      icon: Clock,
      metricText: tablesHealth.calendar_events?.accessible ? `${counts.calendarEventsTotal} acara tercatat` : '-',
    },
    {
      id: 'mod_habits',
      name: 'Pelacak Kebiasaan (Habits)',
      tableKey: 'habits',
      description: 'Pencatatan rutinitas harian dan perhitungan hari penyelesaian kebiasaan.',
      icon: Flame,
      metricText: tablesHealth.habits?.accessible ? `${counts.habitsTotal} kebiasaan tercatat` : '-',
    },
    {
      id: 'mod_wallets',
      name: 'Manajemen Keuangan & Kas',
      tableKey: 'wallets',
      description: 'Penyimpanan saldo utama, saldo aman, dan riwayat transaksi keuangan.',
      icon: Wallet,
      metricText: tablesHealth.wallets?.accessible
        ? `${counts.walletsTotal} dompet • ${counts.walletTransactionsTotal} transaksi`
        : '-',
    },
    {
      id: 'mod_targets',
      name: 'Target & Sasaran',
      tableKey: 'targets',
      description: 'Pelacakan target harian, mingguan, dan pencapaian progres sasaran.',
      icon: Award,
      metricText: tablesHealth.targets?.accessible ? `${counts.targetsTotal} target tercatat` : '-',
    },
    {
      id: 'mod_journals',
      name: 'Catatan Jurnal Harian',
      tableKey: 'journals',
      description: 'Penyimpanan refleksi harian, tag topik, dan riwayat catatan pribadi.',
      icon: FileText,
      metricText: tablesHealth.journals?.accessible ? `${counts.journalsTotal} catatan jurnal` : '-',
    },
    {
      id: 'mod_feedbacks',
      name: 'Penilaian & Saran Pengguna',
      tableKey: 'user_feedbacks',
      description: 'Pengumpulan rating bintang dan masukan langsung dari pengguna aplikasi.',
      icon: Star,
      metricText: tablesHealth.user_feedbacks?.accessible ? `${counts.feedbacksTotal} ulasan tersimpan` : '-',
    },
    {
      id: 'mod_announcements',
      name: 'Pemberitahuan Aplikasi',
      tableKey: 'announcements',
      description: 'Siaran pengumuman dan pembaruan resmi ke seluruh akun pengguna.',
      icon: Megaphone,
      metricText: tablesHealth.announcements?.accessible ? `${counts.announcementsTotal} pemberitahuan` : '-',
    },
  ];

  return (
    <div
      className={`w-full pb-32 sm:pb-24 transition-colors duration-200 ${
        isLight ? 'bg-transparent text-slate-900' : 'bg-transparent text-white'
      }`}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 1. Header Portal Administrator */}
        <div
          className={`rounded-3xl p-6 sm:p-7 relative overflow-hidden border shadow-xl ${
            isLight
              ? 'bg-gradient-to-r from-amber-500/10 via-teal-500/5 to-emerald-500/10 border-amber-300 text-slate-900'
              : 'bg-gradient-to-r from-[#17130b] via-[#0c1827] to-[#0a1f26] border-amber-500/30 text-white'
          }`}
        >
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {isLoadingStats ? (
                  <span className="h-5 w-36 rounded-full bg-white/10 animate-pulse inline-block" />
                ) : (
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full border font-mono font-bold ${
                      !supabaseConfigured
                        ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                        : isDbHealthy
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {!supabaseConfigured
                      ? '▲ SUPABASE BELUM TERHUBUNG'
                      : isDbHealthy
                        ? '● SUPABASE OPTIMAL'
                        : '▲ PERIKSA TABEL / RLS'}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                Portal Manajemen ASCEND Journal
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={loadPortalData}
                disabled={isLoadingStats}
                className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-60 ${
                  isLight
                    ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800 shadow-xs'
                    : 'bg-white/5 hover:bg-white/10 border-white/15 text-white'
                }`}
                title="Muat ulang seluruh data portal dari Supabase"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isLoadingStats ? 'Memuat...' : 'Segarkan Data'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Navigasi Menu Portal Administrator */}
        <div
          className={`p-2 rounded-2xl border grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 ${
            isLight
              ? 'bg-white border-slate-200/80 shadow-[0_2px_12px_rgba(15,23,42,0.04)]'
              : 'bg-[#0f172a] border-white/10 shadow-lg'
          }`}
        >
          {[
            { id: 'dashboard' as AdminTab, label: 'Dashboard', icon: Activity },
            { id: 'features' as AdminTab, label: 'Status Modul', icon: Sliders },
            { id: 'announcements' as AdminTab, label: 'Pemberitahuan', icon: Megaphone },
            { id: 'security' as AdminTab, label: 'Keamanan & Log', icon: Shield },
            { id: 'system' as AdminTab, label: 'Database & Sistem', icon: Server },
            { id: 'feedback' as AdminTab, label: 'Bantuan & Saran', icon: MessageSquare },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activePortalTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivePortalTab(tab.id)}
                className={`px-3 py-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer active:scale-[0.98] ${
                  isActive
                    ? isLight
                      ? 'bg-[#0B1324] text-white border-[#0B1324] shadow-sm'
                      : 'bg-cyan-500/15 text-white border-cyan-400/40 shadow-sm'
                    : isLight
                      ? 'bg-slate-50/80 hover:bg-slate-100 text-slate-700 border-slate-200/70'
                      : 'bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 border-white/5'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isActive
                      ? isLight
                        ? 'bg-white/15 text-emerald-300'
                        : 'bg-cyan-400/20 text-cyan-300'
                      : isLight
                        ? 'bg-white text-slate-500 border border-slate-200/80'
                        : 'bg-white/5 text-slate-400'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 stroke-[2.2]" />
                </div>
                <span className="text-xs font-bold leading-tight truncate flex-1">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Banner Peringatan Jujur jika Supabase belum terhubung atau ada kendala query/RLS */}
        {!isLoadingStats && (!supabaseConfigured || systemErrors.length > 0) && activePortalTab !== 'feedback' && (
          <div
            className={`p-4 rounded-2xl border flex items-start gap-3 text-xs ${
              !supabaseConfigured
                ? isLight
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                : isLight
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-100'
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="space-y-1 min-w-0">
              <p className="font-bold">
                {!supabaseConfigured
                  ? 'Koneksi Supabase Belum Terhubung'
                  : `Terdeteksi ${systemErrors.length} Catatan Query / Tabel Supabase`}
              </p>
              <p className="opacity-85 leading-relaxed">
                {!supabaseConfigured
                  ? 'Seluruh metrik menampilkan kondisi kosong karena aplikasi belum terhubung ke proyek Supabase.'
                  : systemErrors[0]}
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: DASHBOARD ADMIN (100% DATA SUPABASE ASLI)                          */}
        {/* ========================================================================= */}
        {activePortalTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* 4 Kartu Metrik Utama */}
            {isLoadingStats ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-busy="true">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className={`p-5 rounded-2xl border space-y-3 ${cardSurface}`}>
                    <div className="flex items-center justify-between">
                      <div className={`h-3 w-28 rounded-md animate-pulse ${skeletonBlock}`} />
                      <div className={`w-8 h-8 rounded-xl animate-pulse ${skeletonSubtle}`} />
                    </div>
                    <div className={`h-8 w-20 rounded-lg animate-pulse ${skeletonBlock}`} />
                    <div className={`h-3 w-40 rounded-md animate-pulse ${skeletonSubtle}`} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Kartu 1: Total Pengguna */}
                <div className={`p-5 rounded-2xl border relative overflow-hidden transition-all shadow-xs ${cardSurface}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Pengguna</span>
                    <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
                      <Users className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black font-mono tabular-nums">
                    {counts.totalUsers}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {profilesError
                      ? 'Gagal memuat tabel user_profiles'
                      : counts.totalUsers > 0
                        ? `${counts.totalUsers} profil di tabel user_profiles`
                        : 'Belum ada pengguna terdaftar'}
                  </p>
                </div>

                {/* Kartu 2: Pengguna Aktif (Streak > 0 di Database) */}
                <div className={`p-5 rounded-2xl border relative overflow-hidden transition-all shadow-xs ${cardSurface}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pengguna Aktif</span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                      <Activity className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-500 tabular-nums">
                    {counts.activeUsers}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {counts.activeUsers > 0
                      ? `Memiliki streak aktif > 0 hari di database`
                      : 'Belum ada pengguna dengan streak > 0 hari'}
                  </p>
                </div>

                {/* Kartu 3: Total Baris Asli di Supabase */}
                <div className={`p-5 rounded-2xl border relative overflow-hidden transition-all shadow-xs ${cardSurface}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Data di Supabase</span>
                    <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
                      <Database className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-purple-400 tabular-nums">
                    {totalDbRecords}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {totalDbRecords > 0
                      ? `${counts.agendasTotal} agenda • ${counts.habitsTotal} kebiasaan • ${counts.journalsTotal + counts.walletsTotal} jurnal & kas`
                      : 'Belum ada baris data terbaca dari Supabase'}
                  </p>
                </div>

                {/* Kartu 4: Integritas Tabel Supabase */}
                <div className={`p-5 rounded-2xl border relative overflow-hidden transition-all shadow-xs ${cardSurface}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Integritas Database</span>
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        isDbHealthy ? 'bg-teal-500/15 text-teal-400' : 'bg-amber-500/15 text-amber-400'
                      }`}
                    >
                      <Server className="w-4 h-4" />
                    </div>
                  </div>
                  <div
                    className={`text-xl sm:text-2xl font-black flex items-center gap-1.5 ${
                      isDbHealthy ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {isDbHealthy ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                    )}
                    <span>{tablesTotalCount > 0 ? `${tablesPercent}% Siap` : '0% Siap'}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {tablesTotalCount > 0
                      ? `${tablesAccessibleCount} dari ${tablesTotalCount} tabel dapat diakses${
                          dbLatencyMs !== null ? ` • Ping ${dbLatencyMs}ms` : ''
                        }`
                      : 'Belum ada tabel yang diperiksa'}
                  </p>
                </div>
              </div>
            )}

            {/* Daftar Pengguna & Ringkasan Infrastruktur Cloud */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Kolom Kiri: Daftar Pengguna dari Tabel user_profiles */}
              <div className={`lg:col-span-7 p-6 rounded-3xl border ${cardSurface}`}>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-teal-400" />
                    <h3 className="font-bold text-base">Daftar Pengguna Database (user_profiles)</h3>
                  </div>
                  <span className="text-xs text-teal-400 font-mono font-bold bg-teal-500/10 border border-teal-500/20 px-2.5 py-1 rounded-lg">
                    {isLoadingStats ? '...' : `${userProfilesList.length} Akun`}
                  </span>
                </div>

                {isLoadingStats ? (
                  <div className="space-y-2.5" aria-busy="true">
                    {[0, 1, 2].map((idx) => (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                          isLight ? 'border-slate-200 bg-slate-50/70' : 'border-white/5 bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl animate-pulse ${skeletonBlock}`} />
                          <div className="space-y-1.5">
                            <div className={`h-3.5 w-32 rounded-md animate-pulse ${skeletonBlock}`} />
                            <div className={`h-3 w-44 rounded-md animate-pulse ${skeletonSubtle}`} />
                          </div>
                        </div>
                        <div className={`h-6 w-20 rounded-xl animate-pulse ${skeletonBlock}`} />
                      </div>
                    ))}
                  </div>
                ) : profilesError ? (
                  <div
                    className={`p-5 rounded-2xl border text-xs flex items-start gap-2.5 ${
                      isLight ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                    <div>
                      <p className="font-bold">Gagal membaca tabel user_profiles</p>
                      <p className="opacity-85 mt-0.5">{profilesError}</p>
                    </div>
                  </div>
                ) : userProfilesList.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">
                    Belum ada baris profil pengguna pada tabel <code className="font-mono">user_profiles</code> di Supabase.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {userProfilesList.map((user) => {
                      const displayName = user.full_name?.trim() || 'Tanpa nama';
                      const displayEmail = user.email?.trim() || '-';
                      const displayInitial = user.full_name?.trim()
                        ? user.full_name.trim().charAt(0).toUpperCase()
                        : user.email?.trim()
                          ? user.email.trim().charAt(0).toUpperCase()
                          : '?';
                      const isRowAdmin = Boolean(
                        user.email && DEFAULT_ADMIN_EMAILS.includes(user.email.toLowerCase().trim())
                      );

                      return (
                        <div
                          key={user.id}
                          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs transition-all ${
                            isRowAdmin
                              ? isLight
                                ? 'bg-amber-50/60 border-amber-200 text-amber-950 shadow-xs'
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                              : isLight
                                ? 'bg-slate-50 border-slate-200 text-slate-800'
                                : 'bg-white/[0.03] border-white/5 text-white'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {user.avatar_url ? (
                              <img
                                src={user.avatar_url}
                                alt={displayName}
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded-xl object-cover border border-white/15 shrink-0"
                              />
                            ) : (
                              <div
                                className={`w-9 h-9 rounded-xl font-bold flex items-center justify-center shrink-0 border ${
                                  isRowAdmin
                                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                    : 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                                }`}
                              >
                                {displayInitial}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-bold truncate text-sm flex items-center gap-2">
                                <span className="truncate">{displayName}</span>
                                {isRowAdmin && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                                    Admin
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                                <span className="truncate">{displayEmail}</span>
                                <span className="text-[10px] text-slate-500 shrink-0">
                                  • {user.created_at ? `Terdaftar ${new Date(user.created_at).toLocaleDateString('id-ID')}` : 'Tanggal tidak tercatat'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 block tabular-nums">
                              Streak: {user.streak_days} Hari
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Kolom Kanan: Ringkasan Infrastruktur Supabase */}
              <div className={`lg:col-span-5 p-6 rounded-3xl border flex flex-col justify-between ${cardSurface}`}>
                <div>
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                    <Server className="w-5 h-5 text-amber-400" />
                    <h3 className="font-bold text-base">Ringkasan Infrastruktur Supabase</h3>
                  </div>

                  {isLoadingStats ? (
                    <div className="space-y-3" aria-busy="true">
                      {[0, 1, 2, 3, 4].map((idx) => (
                        <div key={idx} className="flex justify-between items-center py-1.5">
                          <div className={`h-3 w-28 rounded-md animate-pulse ${skeletonSubtle}`} />
                          <div className={`h-3.5 w-36 rounded-md animate-pulse ${skeletonBlock}`} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between items-center py-1.5 border-b border-white/5 gap-2">
                        <span className="text-slate-400">Database Engine:</span>
                        <span className="font-bold font-mono text-right">PostgreSQL (Supabase)</span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-white/5 gap-2">
                        <span className="text-slate-400">Status Koneksi:</span>
                        <span
                          className={`font-bold flex items-center gap-1 text-right ${
                            !supabaseConfigured
                              ? 'text-rose-400'
                              : isDbHealthy
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                          }`}
                        >
                          {supabaseConfigured ? (
                            <>
                              {isDbHealthy ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                              <span>
                                {isDbHealthy
                                  ? `Terkoneksi (${dbLatencyMs ?? '-'}ms)`
                                  : `Terkoneksi (Ada kendala tabel/RLS)`}
                              </span>
                            </>
                          ) : (
                            <span>Belum Terhubung</span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-white/5 gap-2">
                        <span className="text-slate-400">Sesi Login Saat Ini:</span>
                        <span className="font-bold font-mono truncate max-w-[200px]" title={sessionEmail || '-'}>
                          {sessionVerified ? sessionEmail || '-' : 'Tidak terverifikasi'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-white/5 gap-2">
                        <span className="text-slate-400">Identitas Profil Aktif:</span>
                        <span className="font-bold text-amber-400 truncate max-w-[200px]">
                          {userProfile.name?.trim() || 'Tanpa nama'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 gap-2">
                        <span className="text-slate-400">Kendala / Error Query:</span>
                        <span
                          className={`font-bold text-right ${
                            !supabaseConfigured || systemErrors.length > 0 ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {supabaseConfigured
                            ? systemErrors.length === 0
                              ? '0 Kesalahan'
                              : `${systemErrors.length} Catatan Error`
                            : 'Konfigurasi Tidak Aktif'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 mt-4 border-t border-white/10 flex justify-end">
                  <button
                    type="button"
                    onClick={handleExportSystemBackup}
                    disabled={isLoadingStats}
                    className="w-full py-2.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh Snapshot Data Supabase</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: STATUS MODUL & DATA SUPABASE (100% TABEL REALTIME)                 */}
        {/* ========================================================================= */}
        {activePortalTab === 'features' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className={`p-6 rounded-3xl border ${cardSurface}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-bold">Status Modul Aplikasi &amp; Tabel Supabase</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Ketersediaan tabel, status akses RLS, dan jumlah baris riil setiap modul di database Supabase.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 self-start sm:self-auto">
                  {isLoadingStats ? '...' : `${tablesAccessibleCount}/${tablesTotalCount} Tabel Terbaca`}
                </span>
              </div>

              {isLoadingStats ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                        isLight ? 'border-slate-200 bg-slate-50/70' : 'border-white/10 bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 flex-1">
                        <div className={`w-11 h-11 rounded-2xl animate-pulse ${skeletonBlock}`} />
                        <div className="space-y-2 flex-1">
                          <div className={`h-4 w-40 rounded-md animate-pulse ${skeletonBlock}`} />
                          <div className={`h-3 w-56 rounded-md animate-pulse ${skeletonSubtle}`} />
                        </div>
                      </div>
                      <div className={`h-6 w-20 rounded-xl animate-pulse ${skeletonBlock}`} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {moduleList.map((mod) => {
                    const FeatureIcon = mod.icon;
                    const tbl = tablesHealth[mod.tableKey];
                    const isReady = Boolean(tbl?.exists && tbl?.accessible);
                    const isExistsButBlocked = Boolean(tbl?.exists && !tbl?.accessible);

                    return (
                      <div
                        key={mod.id}
                        className={`p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between gap-3.5 ${
                          isReady
                            ? isLight
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : 'bg-emerald-500/5 border-emerald-500/25'
                            : isExistsButBlocked
                              ? isLight
                                ? 'bg-amber-50/70 border-amber-200'
                                : 'bg-amber-500/10 border-amber-500/30'
                              : isLight
                                ? 'bg-rose-50/60 border-rose-200'
                                : 'bg-rose-500/10 border-rose-500/30'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                              isReady
                                ? isLight
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : isExistsButBlocked
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            <FeatureIcon className="w-5 h-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <h4 className="font-bold text-sm truncate">{mod.name}</h4>
                              <span className="text-[10px] font-mono text-slate-400">({mod.tableKey})</span>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{mod.description}</p>
                            <p className="text-[11px] font-semibold mt-1 text-teal-400">
                              {tbl?.error ? `Error: ${tbl.error}` : mod.metricText}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border shrink-0 ${
                            isReady
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : isExistsButBlocked
                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {isReady ? 'Tersedia' : isExistsButBlocked ? 'Terkendala RLS' : 'Belum Ada'}
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
        {/* TAB 3: NOTIFIKASI & PENGUMUMAN (100% DARI TABEL announcements)            */}
        {/* ========================================================================= */}
        {activePortalTab === 'announcements' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className={`p-6 rounded-3xl border ${cardSurface}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-bold">Siaran Pengumuman &amp; Notifikasi Pengguna</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Daftar pengumuman resmi langsung dari tabel <code className="font-mono">announcements</code> Supabase.
                  </p>
                </div>
                {onOpenAnnouncementsAdmin && (
                  <button
                    type="button"
                    onClick={onOpenAnnouncementsAdmin}
                    className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tulis Pengumuman Baru</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {isLoadingStats ? (
                  <div className="space-y-3" aria-busy="true">
                    {[0, 1].map((idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-2xl border space-y-2.5 ${
                          isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`h-4 w-20 rounded-full animate-pulse ${skeletonBlock}`} />
                          <div className={`h-3 w-24 rounded-md animate-pulse ${skeletonSubtle}`} />
                        </div>
                        <div className={`h-4 w-56 rounded-md animate-pulse ${skeletonBlock}`} />
                        <div className={`h-8 w-full rounded-xl animate-pulse ${skeletonSubtle}`} />
                      </div>
                    ))}
                  </div>
                ) : announcementsError ? (
                  <div
                    className={`p-5 rounded-2xl border text-xs flex items-start gap-2.5 ${
                      isLight ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                    <div>
                      <p className="font-bold">Gagal memuat tabel announcements dari Supabase</p>
                      <p className="opacity-85 mt-0.5">{announcementsError}</p>
                    </div>
                  </div>
                ) : cloudAnnouncements.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    Belum ada pengumuman yang tersimpan di tabel <code className="font-mono">announcements</code> Supabase.
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
                        className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                          isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/5'
                        }`}
                      >
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${meta.bg}`}>
                            <AnnIcon className="w-5 h-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-400 border border-teal-500/30 uppercase">
                                {ann.type}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  ann.isActive
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                    : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                                }`}
                              >
                                {ann.isActive ? 'Aktif' : 'Nonaktif'}
                              </span>
                              {ann.isPinned && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Disematkan
                                </span>
                              )}
                              <span className="text-[11px] text-slate-400">
                                {ann.createdAt ? new Date(ann.createdAt).toLocaleDateString('id-ID') : 'Tanggal tidak tercatat'}
                              </span>
                            </div>
                            <h4 className="font-bold text-sm">{ann.title || '-'}</h4>
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{ann.message || '-'}</p>
                            <p className="text-[11px] text-slate-500 mt-1">
                              Penerbit: {ann.authorName?.trim() || ann.authorEmail || '-'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {onOpenAnnouncementsAdmin && (
                            <button
                              type="button"
                              onClick={onOpenAnnouncementsAdmin}
                              className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                              title="Buka untuk perbarui pengumuman"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Perbarui</span>
                            </button>
                          )}
                          {announcementDeleteConfirmId === ann.id ? (
                            <div className="flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
                              <span className="text-[11px] text-rose-300 font-bold whitespace-nowrap">Hapus?</span>
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
                                className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                              >
                                Ya
                              </button>
                              <button
                                type="button"
                                onClick={() => setAnnouncementDeleteConfirmId(null)}
                                className="px-2 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 text-xs font-semibold cursor-pointer transition-all"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAnnouncementDeleteConfirmId(ann.id)}
                              className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
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
        {/* TAB 4: KEAMANAN & RIWAYAT AKTIVITAS AUDIT (100% DARI SUPABASE)            */}
        {/* ========================================================================= */}
        {activePortalTab === 'security' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className={`p-6 rounded-3xl border ${cardSurface}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-bold">Keamanan Sesi &amp; Jejak Aktivitas Database</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Status verifikasi sesi Supabase Auth dan riwayat pencatatan aktivitas langsung dari baris tabel Supabase.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isLoadingStats ? (
                    <div className={`h-7 w-44 rounded-xl animate-pulse ${skeletonBlock}`} />
                  ) : (
                    <span
                      className={`px-3 py-1 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                        sessionVerified
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        {sessionVerified
                          ? `Sesi Terverifikasi (${sessionEmail || '-'})`
                          : 'Sesi Supabase Belum Terverifikasi'}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {isLoadingStats ? (
                <div className="space-y-2.5" aria-busy="true">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                        isLight ? 'border-slate-200 bg-slate-50' : 'border-white/5 bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`w-8 h-8 rounded-xl animate-pulse ${skeletonBlock}`} />
                        <div className="space-y-1.5 flex-1">
                          <div className={`h-3.5 w-44 rounded-md animate-pulse ${skeletonBlock}`} />
                          <div className={`h-3 w-64 rounded-md animate-pulse ${skeletonSubtle}`} />
                        </div>
                      </div>
                      <div className={`h-3 w-28 rounded-md animate-pulse ${skeletonSubtle}`} />
                    </div>
                  ))}
                </div>
              ) : auditEvents.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Belum ada riwayat aktivitas database yang tercatat pada tabel Supabase yang dapat diakses.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {auditEvents.map((log) => (
                    <div
                      key={log.id}
                      className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/5'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-amber-500 flex items-center gap-2 flex-wrap">
                            <span>{log.action}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">
                              {log.sourceTable}
                            </span>
                          </div>
                          <p className={`mt-0.5 leading-relaxed ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                            {log.details}
                          </p>
                          <div className="text-[11px] text-slate-400 mt-1 font-mono">Aktor: {log.actor}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 text-[11px] text-slate-400 font-mono">
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
        {/* TAB 5: SISTEM & DATABASE STATUS (100% SUPABASE)                           */}
        {/* ========================================================================= */}
        {activePortalTab === 'system' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className={`p-6 rounded-3xl border ${cardSurface}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-bold">Integritas Database Supabase &amp; Jumlah Rekaman</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pemeriksaan langsung ketersediaan, kebijakan akses RLS, dan jumlah baris di setiap tabel PostgreSQL.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadPortalData}
                  disabled={isLoadingStats}
                  className="px-3.5 py-1.5 rounded-xl bg-teal-500/15 text-teal-300 border border-teal-500/30 text-xs font-bold hover:bg-teal-500/25 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isLoadingStats ? 'Memuat...' : 'Uji Ulang Koneksi'}</span>
                </button>
              </div>

              {isLoadingStats ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6" aria-busy="true">
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                        isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.03]'
                      }`}
                    >
                      <div className={`h-4 w-48 rounded-md animate-pulse ${skeletonBlock}`} />
                      <div className={`h-5 w-20 rounded-full animate-pulse ${skeletonSubtle}`} />
                    </div>
                  ))}
                </div>
              ) : Object.keys(tablesHealth).length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 mb-6">
                  Belum ada hasil pemeriksaan tabel Supabase.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                  {Object.entries(tablesHealth).map(([key, item]) => (
                    <div
                      key={key}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
                        item.exists && item.accessible
                          ? isLight
                            ? 'bg-emerald-50/50 border-emerald-200'
                            : 'bg-emerald-500/5 border-emerald-500/20'
                          : item.exists
                            ? isLight
                              ? 'bg-amber-50 border-amber-200'
                              : 'bg-amber-500/10 border-amber-500/30'
                            : isLight
                              ? 'bg-rose-50 border-rose-200'
                              : 'bg-rose-500/10 border-rose-500/30'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Database
                            className={`w-4 h-4 shrink-0 ${
                              item.exists && item.accessible
                                ? 'text-emerald-400'
                                : item.exists
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                            }`}
                          />
                          <span className="font-bold truncate">{item.label}</span>
                        </div>
                        {item.error && (
                          <p className="text-[11px] text-rose-400 mt-1 truncate pl-6" title={item.error}>
                            {item.error}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.accessible && item.count !== null && (
                          <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                            {item.count} baris
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            item.exists && item.accessible
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : item.exists
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {item.exists && item.accessible
                            ? 'Tersedia'
                            : item.exists
                              ? 'Terkendala RLS'
                              : 'Belum Ada'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Log Error Supabase & pdf_reports */}
              <div className="p-4 rounded-2xl border bg-black/20 border-white/10 space-y-2">
                <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Log Error Database &amp; Diagnostik RLS Supabase</span>
                </div>
                {isLoadingStats ? (
                  <div className={`h-4 w-72 rounded-md animate-pulse ${skeletonBlock}`} />
                ) : systemErrors.length === 0 ? (
                  <p className="text-xs text-emerald-400">
                    ✓ Tidak ada kesalahan query, tabel hilang, atau error log Supabase yang terdeteksi.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {systemErrors.map((err, i) => (
                      <p key={i} className="text-xs text-rose-400 font-mono">
                        • {err}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: BANTUAN & FEEDBACK PENGGUNA (100% SUPABASE)                        */}
        {/* ========================================================================= */}
        {activePortalTab === 'feedback' && (
          <div className="animate-in fade-in duration-200">
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
