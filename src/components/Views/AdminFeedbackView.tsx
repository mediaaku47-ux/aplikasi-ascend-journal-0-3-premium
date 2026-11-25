import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Star,
  MessageSquare,
  ShieldCheck,
  RefreshCw,
  Search,
  Clock,
  Download,
  TrendingUp,
  AlertTriangle,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { UserProfile } from '../../types';
import { dbService, isSupabaseConfigured, subscribeToAllFeedbacks } from '../../lib/supabaseService';
import { isSupabaseConfigured as hasSupabaseClient } from '../../lib/supabase';

export interface UserFeedbackRecord {
  id: string;
  email?: string;
  fullName: string;
  avatarUrl?: string;
  rating: number;
  suggestions: string;
  tags?: string[];
  submittedAt?: string;
  updatedAt?: string;
  firstAppOpenAt?: string;
}

interface AdminFeedbackViewProps {
  currentUser?: User | null;
  userProfile: UserProfile;
  onShowToast?: (message: string) => void;
  onNavigateToDashboard?: () => void;
  theme?: 'dark' | 'light';
  embedded?: boolean;
}

export const AdminFeedbackView: React.FC<AdminFeedbackViewProps> = ({
  currentUser,
  userProfile,
  onShowToast,
  theme = 'light',
  embedded = false,
}) => {
  const isLight = theme === 'light';
  const [feedbacks, setFeedbacks] = useState<UserFeedbackRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cloudDiagnosticError, setCloudDiagnosticError] = useState<string | null>(null);
  const [rlsRestrictedLikely, setRlsRestrictedLikely] = useState<boolean>(false);
  const [userFeedbacksTableExists, setUserFeedbacksTableExists] = useState<boolean>(true);
  const [sqlCopied, setSqlCopied] = useState<boolean>(false);
  const [dismissedDiagnosticBanner, setDismissedDiagnosticBanner] = useState<boolean>(false);

  const hasLoadedOnceRef = useRef(false);

  // Muat data feedback 100% langsung dari database Supabase tanpa fallback/mock lokal
  const loadFeedbacks = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) {
      setIsLoading(true);
    }
    try {
      if (isSupabaseConfigured() && hasSupabaseClient()) {
        const statusRes = await dbService.fetchAllUserFeedbacksWithStatus();
        setCloudDiagnosticError(statusRes.errorMessage || null);
        setRlsRestrictedLikely(statusRes.rlsRestrictedLikely);
        setUserFeedbacksTableExists(statusRes.userFeedbacksTableExists);
        setFeedbacks(statusRes.feedbacks);
      } else {
        setCloudDiagnosticError('Konfigurasi Supabase belum terhubung pada sesi ini.');
        setRlsRestrictedLikely(false);
        setUserFeedbacksTableExists(false);
        setFeedbacks([]);
      }
    } catch (err: any) {
      console.warn('Error loading admin feedback:', err);
      setCloudDiagnosticError(err?.message || 'Gagal membaca data ulasan dari Supabase.');
      setFeedbacks([]);
    } finally {
      hasLoadedOnceRef.current = true;
      setIsLoading(false);
    }
  }, []);

  const ADMIN_RLS_SQL_SNIPPET = `-- Jalankan di Supabase SQL Editor agar Admin dapat membaca semua saran & penilaian pengguna
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS feedback JSONB;

DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (
    auth.uid() = id
    OR feedback IS NOT NULL
    OR (auth.jwt() ->> 'email') = 'kamalizudin36@gmail.com'
    OR (auth.jwt() ->> 'email') LIKE 'admin@%'
  );

CREATE TABLE IF NOT EXISTS public.user_feedbacks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT NOT NULL DEFAULT 'Pengguna',
  avatar_url TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  suggestions TEXT NOT NULL DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_feedbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin or owner can view feedbacks" ON public.user_feedbacks;
CREATE POLICY "Admin or owner can view feedbacks" ON public.user_feedbacks
  FOR SELECT USING (
    auth.uid() = user_id
    OR (auth.jwt() ->> 'email') = 'kamalizudin36@gmail.com'
    OR (auth.jwt() ->> 'email') LIKE 'admin@%'
  );

DROP POLICY IF EXISTS "Users can insert own feedback" ON public.user_feedbacks;
CREATE POLICY "Users can insert own feedback" ON public.user_feedbacks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own feedback" ON public.user_feedbacks;
CREATE POLICY "Users can update own feedback" ON public.user_feedbacks
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_feedbacks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_feedbacks;
  END IF;
END $$;`;

  const handleCopyAdminRlsSql = async () => {
    try {
      await navigator.clipboard.writeText(ADMIN_RLS_SQL_SNIPPET);
      setSqlCopied(true);
      onShowToast?.('SQL RLS Admin berhasil disalin! Tempel & jalankan di Supabase SQL Editor.');
      setTimeout(() => setSqlCopied(false), 3000);
    } catch {
      onShowToast?.('Gagal menyalin otomatis. Silakan salin ulang SQL.');
    }
  };

  // Sinkronisasi awal & saat sesi akun berubah
  useEffect(() => {
    loadFeedbacks(!hasLoadedOnceRef.current);
  }, [currentUser?.id, loadFeedbacks]);

  // Channel Realtime Cloud + fokus tab + interval latar belakang
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerSilentRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadFeedbacks(false);
      }, 150);
    };

    const unsubscribeRealtime = subscribeToAllFeedbacks(
      () => {
        triggerSilentRefresh();
      },
      (status) => {
        setIsRealtimeConnected(status === 'SUBSCRIBED');
      }
    );

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        loadFeedbacks(false);
      }
    };

    window.addEventListener('ascend-feedback-synced', triggerSilentRefresh);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    const syncInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadFeedbacks(false);
      }
    }, 15000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribeRealtime();
      window.removeEventListener('ascend-feedback-synced', triggerSilentRefresh);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      clearInterval(syncInterval);
    };
  }, [loadFeedbacks]);

  // Statistik Agregat
  const stats = useMemo(() => {
    const total = feedbacks.length;
    if (total === 0) {
      return {
        total: 0,
        average: 0,
        fiveStars: 0,
        fourStars: 0,
        threeStars: 0,
        twoStars: 0,
        oneStars: 0,
        lowStars: 0,
        satisfiedCount: 0,
        satisfactionPct: 0,
        topTags: [] as { tag: string; count: number }[],
      };
    }

    let sum = 0;
    let fiveStars = 0;
    let fourStars = 0;
    let threeStars = 0;
    let twoStars = 0;
    let oneStars = 0;
    const tagCountMap: Record<string, number> = {};

    feedbacks.forEach((fb) => {
      sum += fb.rating;
      if (fb.rating === 5) fiveStars++;
      else if (fb.rating === 4) fourStars++;
      else if (fb.rating === 3) threeStars++;
      else if (fb.rating === 2) twoStars++;
      else oneStars++;

      if (Array.isArray(fb.tags)) {
        fb.tags.forEach((t) => {
          tagCountMap[t] = (tagCountMap[t] || 0) + 1;
        });
      }
    });

    const average = Number((sum / total).toFixed(1));
    const satisfiedCount = fiveStars + fourStars;
    const satisfactionPct = Math.round((satisfiedCount / total) * 100);
    const lowStars = twoStars + oneStars;
    const topTags = Object.entries(tagCountMap)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      total,
      average,
      fiveStars,
      fourStars,
      threeStars,
      twoStars,
      oneStars,
      lowStars,
      satisfiedCount,
      satisfactionPct,
      topTags,
    };
  }, [feedbacks]);

  // Filter & Sort (terbaru berdasarkan waktu kirim atau pembaruan terakhir)
  const filteredFeedbacks = useMemo(() => {
    return feedbacks
      .filter((item) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = item.fullName.toLowerCase().includes(q);
          const matchEmail = (item.email || '').toLowerCase().includes(q);
          const matchSuggestion = item.suggestions.toLowerCase().includes(q);
          const matchTag = item.tags?.some((t) => t.toLowerCase().includes(q));
          if (!matchName && !matchEmail && !matchSuggestion && !matchTag) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.submittedAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.submittedAt || 0).getTime();
        return timeB - timeA;
      });
  }, [feedbacks, searchQuery]);

  // Ekspor feedback ke CSV
  const handleExportCSV = () => {
    if (feedbacks.length === 0) {
      onShowToast?.('Tidak ada data penilaian untuk diekspor.');
      return;
    }

    const headers = ['ID Pengguna', 'Nama Lengkap', 'Email', 'Bintang (Rating)', 'Label/Tags', 'Saran & Masukan', 'Waktu Kirim'];
    const rows = feedbacks.map((f) => [
      `"${f.id}"`,
      `"${(f.fullName.trim() || 'Tanpa nama').replace(/"/g, '""')}"`,
      `"${f.email || '-'}"`,
      f.rating,
      `"${(f.tags || []).join(', ')}"`,
      `"${f.suggestions.replace(/"/g, '""')}"`,
      `"${f.submittedAt || '-'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Penilaian_Pengguna_Ascend_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onShowToast?.('Data penilaian pengguna berhasil diekspor ke CSV!');
  };

  const starDistributionRows = [
    { star: 5, count: stats.fiveStars },
    { star: 4, count: stats.fourStars },
    { star: 3, count: stats.threeStars },
    { star: 2, count: stats.twoStars },
    { star: 1, count: stats.oneStars },
  ];

  const cardBase = isLight
    ? 'bg-white border border-slate-200/80 shadow-[0_2px_12px_rgba(15,23,42,0.04)] text-slate-900'
    : 'bg-[#0f172a] border border-white/10 shadow-lg text-white';

  return (
    <div className={`space-y-4 animate-fade-in ${embedded ? '' : 'pb-24 sm:pb-14 max-w-5xl mx-auto'}`}>
      {/* Header Banner (tampil penuh jika bukan mode embedded di Portal Admin) */}
      {!embedded ? (
        <div
          className={`relative overflow-hidden rounded-3xl p-5 sm:p-6 border shadow-md ${
            isLight
              ? 'bg-gradient-to-br from-[#064E3B] via-[#043E30] to-[#022C22] border-emerald-700/40 text-white'
              : 'bg-gradient-to-br from-[#0c1427] via-[#111C38] to-[#0A1020] border-white/10 text-white'
          }`}
        >
          <div className="pointer-events-none absolute -right-12 -top-12 w-52 h-52 bg-emerald-400/15 rounded-full blur-3xl" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-xl bg-white/10 text-emerald-200 border border-white/15 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Panel Administrator</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-lg bg-white/10 border border-white/10 text-white/75 text-[11px]">
                  {currentUser?.email || '-'}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Penilaian &amp; Saran Pengguna
              </h1>
              <p className="text-xs sm:text-sm text-emerald-100/80 max-w-2xl leading-relaxed">
                Pantau rata-rata penilaian, tingkat kepuasan, distribusi bintang, dan saran masukan pengguna.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  loadFeedbacks(true);
                  onShowToast?.('Memperbarui data penilaian...');
                }}
                disabled={isLoading}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/15 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                title="Segarkan data dari cloud"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isLoading ? 'Memuat...' : 'Muat Ulang'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3.5 py-2 rounded-xl bg-white text-emerald-950 hover:bg-emerald-50 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-98"
                title="Unduh data dalam format file CSV / Excel"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Ekspor CSV</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div>
            <h3 className={`text-base sm:text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Penilaian &amp; Penerimaan Saran Pengguna
            </h3>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Ringkasan kepuasan, distribusi bintang, dan masukan langsung dari pengguna.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                loadFeedbacks(true);
                onShowToast?.('Memperbarui data penilaian...');
              }}
              disabled={isLoading}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 ${
                isLight
                  ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs'
                  : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Memuat...' : 'Muat Ulang'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                isLight
                  ? 'bg-[#0B1324] text-white hover:bg-slate-800'
                  : 'bg-teal-500 text-slate-950 hover:bg-teal-400'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor CSV</span>
            </button>
          </div>
        </div>
      )}

      {/* Banner Diagnostik Jujur bila RLS/Tabel Cloud Membatasi Pembacaan Ulasan Pengguna Lain */}
      {!isLoading &&
        !dismissedDiagnosticBanner &&
        (cloudDiagnosticError || (isSupabaseConfigured() && (rlsRestrictedLikely || !userFeedbacksTableExists))) && (
        <div
          className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isLight
              ? 'bg-amber-50/90 border-amber-200 text-amber-950'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-100'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <div className="space-y-1 text-xs leading-relaxed">
              <p className="font-bold">
                {cloudDiagnosticError
                  ? 'Sinkronisasi Ulasan Cloud Mengalami Kendala'
                  : 'Kebijakan Akses (RLS) Supabase Perlu Diperbarui untuk Admin'}
              </p>
              <p className={isLight ? 'text-amber-800' : 'text-amber-200/85'}>
                {cloudDiagnosticError
                  ? `Detail: ${cloudDiagnosticError}.`
                  : `Server belum mendeteksi akses penuh tabel ulasan (${!userFeedbacksTableExists ? 'tabel user_feedbacks belum terbaca dan ' : ''}kebijakan RLS user_profiles di Supabase kemungkinan masih membatasi SELECT hanya ke milik sendiri). Jalankan SQL RLS Admin di Supabase SQL Editor lalu tekan Muat Ulang.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyAdminRlsSql}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${
                isLight
                  ? 'bg-amber-900 hover:bg-amber-950 text-white'
                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
              }`}
            >
              {sqlCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{sqlCopied ? 'SQL Tersalin' : 'Salin SQL RLS Admin'}</span>
            </button>
            <button
              type="button"
              onClick={() => setDismissedDiagnosticBanner(true)}
              aria-label="Tutup pemberitahuan"
              title="Tutup pemberitahuan"
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isLight
                  ? 'border-amber-300/80 text-amber-700 hover:bg-amber-100'
                  : 'border-amber-400/30 text-amber-200 hover:bg-amber-500/20'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3 Kartu Statistik Ringkas (Skeleton Loading saat memuat) */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5" aria-busy="true" aria-label="Memuat ringkasan penilaian">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className={`rounded-2xl p-5 space-y-3 ${cardBase}`}>
              <div className={`h-3 w-32 rounded-md animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
              <div className={`h-9 w-24 rounded-lg animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
              <div className={`h-3.5 w-44 rounded-md animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/5'}`} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          {/* Kartu 1: RATA-RATA PENILAIAN */}
          <div className={`rounded-2xl p-5 transition-all ${cardBase}`}>
            <span className={`text-[11px] font-bold uppercase tracking-wider block ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              RATA-RATA PENILAIAN
            </span>
            <div className="mt-2.5 flex items-baseline gap-1.5">
              <span className={`text-3xl sm:text-4xl font-black tracking-tight tabular-nums ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}>
                {stats.average > 0 ? stats.average.toFixed(1) : '0.0'}
              </span>
              <span className={`text-sm font-semibold ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                / 5.0
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${
                    star <= Math.round(stats.average)
                      ? 'text-amber-400 fill-amber-400'
                      : isLight
                        ? 'text-slate-200 fill-slate-100'
                        : 'text-white/15'
                  }`}
                />
              ))}
              <span className={`text-xs font-medium ml-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                ({stats.total} ulasan)
              </span>
            </div>
          </div>

          {/* Kartu 2: TINGKAT KEPUASAN */}
          <div className={`rounded-2xl p-5 transition-all ${cardBase}`}>
            <span className={`text-[11px] font-bold uppercase tracking-wider block ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              TINGKAT KEPUASAN
            </span>
            <div className="mt-2.5">
              <span className="text-3xl sm:text-4xl font-black tracking-tight text-emerald-500 tabular-nums">
                {stats.satisfactionPct}%
              </span>
            </div>
            <p className={`mt-2.5 text-xs font-medium flex items-center gap-1.5 ${
              isLight ? 'text-slate-600' : 'text-slate-300'
            }`}>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>
                {stats.satisfiedCount} dari {stats.total} pengguna memberi bintang 4 atau 5
              </span>
            </p>
          </div>

          {/* Kartu 3: DISTRIBUSI BINTANG */}
          <div className={`rounded-2xl p-5 transition-all ${cardBase}`}>
            <span className={`text-[11px] font-bold uppercase tracking-wider block mb-3 ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              DISTRIBUSI BINTANG
            </span>
            <div className="space-y-2">
              {starDistributionRows.map(({ star, count }) => {
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={star} className="flex items-center gap-2.5">
                    <div className="flex items-center gap-1 w-7 shrink-0">
                      <span className={`text-xs font-bold tabular-nums ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                        {star}
                      </span>
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                    </div>
                    <div className={`flex-1 h-2 rounded-full overflow-hidden ${
                      isLight ? 'bg-slate-100' : 'bg-white/10'
                    }`}>
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold w-5 text-right tabular-nums ${
                      isLight ? 'text-slate-600' : 'text-slate-300'
                    }`}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Kartu Pencarian */}
      <div className={`rounded-2xl p-4 transition-all ${cardBase}`}>
        <div className="relative">
          <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${
            isLight ? 'text-slate-400' : 'text-white/40'
          }`} />
          <input
            type="text"
            placeholder="Cari nama, email, atau kata saran..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full rounded-xl pl-9 pr-3.5 py-2 text-xs border outline-hidden transition-colors ${
              isLight
                ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:bg-white focus:border-emerald-700'
                : 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:border-teal-400'
            }`}
          />
        </div>
      </div>

      {/* Daftar Saran & Ulasan Pengguna */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5" aria-busy="true" aria-label="Memuat ulasan pengguna">
          {[0, 1].map((idx) => (
            <div key={idx} className={`p-5 rounded-2xl space-y-3.5 ${cardBase}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
                  <div className="space-y-1.5">
                    <div className={`h-3.5 w-32 rounded-md animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
                    <div className={`h-3 w-40 rounded-md animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/5'}`} />
                  </div>
                </div>
                <div className={`h-6 w-14 rounded-xl animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
              </div>
              <div className={`h-3.5 w-28 rounded-md animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/5'}`} />
              <div className={`h-20 w-full rounded-xl animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/5'}`} />
            </div>
          ))}
        </div>
      ) : filteredFeedbacks.length === 0 ? (
        <div className={`p-10 text-center rounded-2xl ${cardBase}`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 border ${
            isLight
              ? 'bg-amber-50 border-amber-200 text-amber-500'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
          }`}>
            <MessageSquare className="w-6 h-6" />
          </div>
          <h3 className={`text-sm sm:text-base font-bold mb-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Belum Ada Saran yang Sesuai
          </h3>
          <p className={`text-xs max-w-md mx-auto mb-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {feedbacks.length === 0
              ? 'Pengguna belum mengirimkan penilaian bintang atau saran melalui menu profil.'
              : 'Tidak ditemukan ulasan yang cocok dengan filter atau kata kunci pencarian.'}
          </p>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                  : 'bg-white/10 hover:bg-white/15 text-white'
              }`}
            >
              Reset Pencarian
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className={`flex items-center justify-between text-xs px-1 ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}>
            <span>Menampilkan {filteredFeedbacks.length} dari {feedbacks.length} ulasan</span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className={`w-2 h-2 rounded-full ${
                isRealtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500/70'
              }`} />
              <span>{isRealtimeConnected ? 'Realtime Live Aktif' : 'Sinkronisasi Cloud Aktif'}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredFeedbacks.map((fb) => {
              const displayName = fb.fullName.trim() || 'Tanpa nama';
              const displayInitial = fb.fullName.trim()
                ? fb.fullName.trim().charAt(0).toUpperCase()
                : fb.email
                  ? fb.email.charAt(0).toUpperCase()
                  : '?';

              return (
              <div
                key={fb.id}
                className={`p-4 sm:p-5 rounded-2xl transition-all flex flex-col justify-between ${cardBase}`}
              >
                <div>
                  {/* Info Pengirim & Badge Bintang */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {fb.avatarUrl ? (
                        <img
                          src={fb.avatarUrl}
                          alt={displayName}
                          referrerPolicy="no-referrer"
                          className={`w-10 h-10 rounded-xl object-cover border shrink-0 ${
                            isLight ? 'border-slate-200' : 'border-white/15'
                          }`}
                        />
                      ) : (
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center font-bold text-sm shrink-0 ${
                          isLight
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-teal-500/15 border-teal-500/30 text-teal-300'
                        }`}>
                          {displayInitial}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className={`text-sm font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {displayName}
                        </h4>
                        <p className={`text-[11px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          {fb.email || '-'}
                        </p>
                      </div>
                    </div>

                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border shrink-0 ${
                      isLight
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    }`}>
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <span className="text-xs font-bold tabular-nums">{fb.rating}.0</span>
                    </div>
                  </div>

                  {/* Baris Bintang */}
                  <div className="flex items-center gap-1 mb-3">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= fb.rating
                            ? 'text-amber-400 fill-amber-400'
                            : isLight
                              ? 'text-slate-200 fill-slate-100'
                              : 'text-white/15'
                        }`}
                      />
                    ))}
                    <span className={`text-[11px] font-semibold ml-1.5 ${
                      isLight ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      {fb.rating === 5
                        ? 'Sangat Puas'
                        : fb.rating === 4
                          ? 'Puas'
                          : fb.rating === 3
                            ? 'Cukup'
                            : fb.rating === 2
                              ? 'Kurang Puas'
                              : 'Perlu Peningkatan'}
                    </span>
                  </div>

                  {/* Tags */}
                  {fb.tags && fb.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {fb.tags.map((t) => (
                        <span
                          key={t}
                          className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                            isLight
                              ? 'bg-slate-100 border-slate-200 text-slate-700'
                              : 'bg-white/5 border-white/10 text-slate-300'
                          }`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Isi Saran */}
                  <div className={`p-3.5 rounded-xl border text-xs leading-relaxed mb-3 ${
                    isLight
                      ? 'bg-slate-50 border-slate-200/80 text-slate-700'
                      : 'bg-white/[0.03] border-white/5 text-white/85'
                  }`}>
                    {fb.suggestions ? (
                      `"${fb.suggestions}"`
                    ) : (
                      <span className={isLight ? 'text-slate-400 italic' : 'text-white/35 italic'}>
                        Tidak menyertakan saran teks tambahan.
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Kartu */}
                <div className={`pt-2.5 border-t flex items-center justify-between text-[11px] ${
                  isLight ? 'border-slate-100 text-slate-400' : 'border-white/5 text-white/40'
                }`}>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {(fb.updatedAt || fb.submittedAt)
                        ? new Date(fb.updatedAt || fb.submittedAt || '').toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Waktu tidak tercatat'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono truncate max-w-[110px]" title={fb.id}>
                    ID: {fb.id.slice(0, 8)}...
                  </span>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
