import { getSupabase, isSupabaseConfigured } from './supabase';
export { isSupabaseConfigured };
import {
  Task,
  Habit,
  Transaction,
  QuickNote,
  UserProfile,
  TargetItem,
  AppAnnouncement,
  AppFeedback,
  CalendarEvent,
  CalendarEventCategory,
} from '../types';
import { User, RealtimeChannel } from '@supabase/supabase-js';
import { uploadUserAvatar, getAvatarSignedUrl, removeUserAvatar } from './avatarService';

// ==============================================================================
// 1. AUTHENTICATION SERVICE (SUPABASE AUTH - RESMI DENGAN SUPABASE USER ID)
// ==============================================================================

export const authService = {
  // Pendaftaran akun baru menggunakan Supabase Authentication resmi (auth.users)
  async signUp(email: string, password: string, fullName: string) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim() || cleanEmail.split('@')[0];

    // Pastikan konfigurasi Supabase aktif
    if (!isSupabaseConfigured()) {
      const err: any = new Error(
        'Proyek Supabase belum terhubung. Silakan masukkan Project URL dan Public/Anon Key Supabase Anda terlebih dahulu melalui menu konfigurasi agar akun dapat dibuat langsung di Supabase Auth.'
      );
      err.code = 'SUPABASE_NOT_CONFIGURED';
      throw err;
    }

    const client = getSupabase();

    // Buat akun langsung di Supabase Auth (Authentication -> Users pada dashboard Supabase)
    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
          name: cleanName,
        },
      },
    });

    if (error) {
      console.error('Supabase Auth signUp error:', error);
      throw error;
    }

    if (!data?.user) {
      throw new Error('Gagal membuat akun di Supabase Auth. Silakan coba beberapa saat lagi.');
    }

    return data;
  },

  // Masuk menggunakan Supabase Authentication resmi (auth.users)
  async signIn(email: string, password: string) {
    const cleanEmail = email.trim().toLowerCase();

    // Pastikan konfigurasi Supabase aktif
    if (!isSupabaseConfigured()) {
      const err: any = new Error(
        'Proyek Supabase belum terhubung. Silakan masukkan Project URL dan Public/Anon Key Supabase Anda terlebih dahulu melalui menu konfigurasi.'
      );
      err.code = 'SUPABASE_NOT_CONFIGURED';
      throw err;
    }

    const client = getSupabase();

    // Login via Supabase Auth
    const { data, error } = await client.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      console.error('Supabase Auth signIn error:', error);
      throw error;
    }

    if (!data?.user) {
      throw new Error('Email atau kata sandi tidak cocok. Silakan periksa kembali.');
    }

    return data;
  },

  // Masuk menggunakan Google OAuth resmi Supabase (auth.signInWithOAuth)
  async signInWithGoogle(customRedirectTo?: string) {
    if (!isSupabaseConfigured()) {
      const err: any = new Error(
        'Proyek Supabase belum terhubung. Silakan masukkan Project URL dan Public/Anon Key Supabase Anda terlebih dahulu melalui menu konfigurasi.'
      );
      err.code = 'SUPABASE_NOT_CONFIGURED';
      throw err;
    }

    const client = getSupabase();
    const defaultRedirect = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : undefined;
    const redirectTo = customRedirectTo || defaultRedirect;

    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });

    if (error) {
      console.error('Supabase Google OAuth signIn error:', error);
      throw error;
    }

    return data;
  },

  // Perbarui kata sandi pengguna yang sedang login (auth.updateUser)
  async updatePassword(newPassword: string, currentPassword?: string) {
    if (!isSupabaseConfigured()) {
      const err: any = new Error(
        'Layanan cloud belum terhubung. Silakan hubungkan penyimpanan cloud terlebih dahulu.'
      );
      err.code = 'SUPABASE_NOT_CONFIGURED';
      throw err;
    }

    const client = getSupabase();

    if (typeof currentPassword === 'string') {
      const { data: userData, error: userError } = await client.auth.getUser();
      const userEmail = userData?.user?.email;

      if (userError || !userEmail) {
        throw new Error('Sesi akun tidak ditemukan. Silakan masuk ulang terlebih dahulu.');
      }

      const { error: verifyError } = await client.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });

      if (verifyError) {
        throw new Error('Kata sandi lama tidak sesuai. Silakan periksa kembali.');
      }
    }

    const { data, error } = await client.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error('Cloud updatePassword error:', error);
      throw error;
    }

    return data;
  },

  // Keluar dari akun Supabase
  async signOut() {
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabase();
        await client.auth.signOut();
      } catch (err) {
        console.warn('Supabase signout notice:', err);
      }
    }
  },

  async getCurrentUser(): Promise<User | null> {
    try {
      if (isSupabaseConfigured()) {
        const client = getSupabase();
        const { data, error } = await client.auth.getUser();
        if (!error && data?.user) {
          return data.user;
        }
      }
      return null;
    } catch {
      return null;
    }
  },

  async getSession() {
    try {
      if (isSupabaseConfigured()) {
        const client = getSupabase();
        const { data, error } = await client.auth.getSession();
        if (!error && data?.session) return data.session;
      }
      return null;
    } catch {
      return null;
    }
  },

  onAuthStateChange(callback: (user: User | null) => void) {
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabase();
        const { data: authListener } = client.auth.onAuthStateChange(async (_event, session) => {
          callback(session?.user || null);
        });
        return () => {
          try {
            authListener?.subscription?.unsubscribe();
          } catch {}
        };
      } catch (err) {
        console.warn('onAuthStateChange subscription notice:', err);
        return () => {};
      }
    }
    return () => {};
  },
};

export function getReadableAuthError(error: any): string {
  if (!error) return 'Terjadi kesalahan, silakan coba lagi.';
  const msg = error.message || error.error_description || String(error);

  if (msg.includes('SUPABASE_NOT_CONFIGURED') || error.code === 'SUPABASE_NOT_CONFIGURED') {
    return 'Koneksi server cloud belum terhubung! Silakan periksa pengaturan sinkronisasi cloud terlebih dahulu.';
  }

  // Google OAuth specific provider errors
  if (
    msg.includes('Unsupported provider') || 
    msg.includes('provider is not enabled') ||
    msg.includes('provider is disabled') ||
    msg.includes('not enabled') || 
    (msg.toLowerCase().includes('google') && (msg.includes('disabled') || msg.includes('not enabled') || msg.includes('not configured') || msg.includes('configuration'))) ||
    msg.includes('Provider not found') ||
    msg.includes('OAuth provider') ||
    msg.includes('configuration_not_found') ||
    msg.includes('invalid_client') ||
    msg.includes('unauthorized_client')
  ) {
    return 'Masuk dengan Google belum diaktifkan pada server autentikasi. Silakan masuk menggunakan Email & Kata Sandi.';
  }

  if (
    msg.includes('Invalid path specified in request URL') ||
    msg.includes('Invalid path') ||
    msg.includes('PGRST126')
  ) {
    return 'URL server cloud tidak valid atau mengandung path tambahan. Harap gunakan alamat URL utama yang benar.';
  }

  if (msg.includes('Invalid login credentials') || msg.includes('invalid_grant')) {
    return 'Email atau kata sandi tidak cocok. Silakan periksa kembali.';
  }
  if (msg.includes('User already registered') || msg.includes('already registered') || msg.includes('User already exists')) {
    return 'Email ini sudah terdaftar. Silakan pilih tab "Masuk".';
  }
  if (msg.includes('Password should be at least') || msg.includes('password is too short')) {
    return 'Kata sandi minimal harus 6 karakter.';
  }
  if (msg.includes('Signup requires a valid password')) {
    return 'Pendaftaran memerlukan kata sandi yang valid.';
  }
  if (msg.includes('Email not confirmed')) {
    return 'Email belum dikonfirmasi. Harap periksa kotak masuk email Anda untuk menyelesaikan verifikasi.';
  }
  if (msg.includes('rate limit') || msg.includes('Too many requests') || msg.includes('over_email_send_rate_limit')) {
    return 'Terlalu banyak permintaan. Harap tunggu beberapa saat lalu coba kembali.';
  }
  if (msg.includes('Invalid email') || msg.includes('email is invalid') || msg.includes('valid email')) {
    return 'Format alamat email tidak valid (contoh: nama@domain.com).';
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('FetchError')) {
    return 'Gagal menghubungi server cloud. Pastikan koneksi internet Anda stabil dan konfigurasi server sudah benar.';
  }
  const lower = msg.toLowerCase();
  if (
    lower.includes('invalid api key') ||
    lower.includes('unauthorized_missing_api_key') ||
    lower.includes('no api key found') ||
    lower.includes('apikey') ||
    lower.includes('jwt')
  ) {
    return 'Kunci akses server cloud tidak valid atau terpotong. Silakan periksa kembali pengaturan koneksi cloud.';
  }
  return msg;
}

// ==============================================================================
// 2. DATABASE SERVICE (CRUD ON POSTGRESQL WITH RLS)
// ==============================================================================

export interface CloudFullData {
  userProfile?: UserProfile;
  tasks?: Task[];
  habits?: Habit[];
  transactions?: Transaction[];
  quickNotes?: QuickNote[];
  targets?: TargetItem[];
  calendarEvents?: CalendarEvent[];
  calendarEventsTableMissing?: boolean;
  totalBalance?: number;
  savingsBalance?: number;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidSupabaseUserId = (userId?: string | null): userId is string => {
  return Boolean(userId && UUID_REGEX.test(userId));
};

const DEVICE_SUPABASE_CREDS_KEY = 'ascend_device_supabase_creds';

async function verifyActiveSupabaseSession(
  userId?: string | null,
  autoProvisionIfMissing = false
): Promise<
  | { ok: true; client: ReturnType<typeof getSupabase>; userId: string; sessionUser: User }
  | { ok: false; error: { code: string; message: string } }
> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: {
        code: 'SUPABASE_NOT_CONFIGURED',
        message: 'Konfigurasi server cloud belum terhubung.',
      },
    };
  }
  try {
    const client = getSupabase();
    let { data, error } = await client.auth.getSession();
    if (error || !data?.session?.user) {
      const refreshed = await client.auth.refreshSession().catch(() => null);
      if (refreshed?.data?.session?.user) {
        data = refreshed.data as any;
        error = null;
      }
    }

    if ((error || !data?.session?.user) && autoProvisionIfMissing) {
      // Coba gunakan kredensial sesi perangkat yang pernah dibuat otomatis di browser ini
      try {
        const savedRaw = typeof window !== 'undefined' ? localStorage.getItem(DEVICE_SUPABASE_CREDS_KEY) : null;
        if (savedRaw) {
          const saved = JSON.parse(savedRaw);
          if (saved?.email && saved?.password) {
            const signInRes = await client.auth.signInWithPassword({
              email: saved.email,
              password: saved.password,
            });
            if (!signInRes.error && signInRes.data?.session?.user) {
              data = { session: signInRes.data.session } as any;
              error = null;
            }
          }
        }
      } catch {}

      // Jika belum ada atau tidak valid, buat akun perangkat otomatis di Supabase Auth (mailer_autoconfirm aktif)
      if (error || !data?.session?.user) {
        const randTag = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 7)}`;
        const deviceEmail = `ascend.device.${randTag}@ascendjournal.app`;
        const devicePassword = `Ascend!${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        const signUpRes = await client.auth.signUp({
          email: deviceEmail,
          password: devicePassword,
          options: {
            data: {
              full_name: 'Pengguna Ascend',
              name: 'Pengguna Ascend',
            },
          },
        });
        if (!signUpRes.error && signUpRes.data?.session?.user) {
          data = { session: signUpRes.data.session } as any;
          error = null;
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem(
                DEVICE_SUPABASE_CREDS_KEY,
                JSON.stringify({ email: deviceEmail, password: devicePassword })
              );
            }
          } catch {}
        } else if (signUpRes.error) {
          return {
            ok: false,
            error: {
              code: 'AUTO_SESSION_FAILED',
              message: signUpRes.error.message || 'Gagal menghubungkan sesi otomatis ke cloud.',
            },
          };
        }
      }
    }

    if (error || !data?.session?.user) {
      return {
        ok: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Sesi akun belum aktif. Silakan coba lagi.',
        },
      };
    }

    if (isValidSupabaseUserId(userId) && data.session.user.id !== userId && !autoProvisionIfMissing) {
      return {
        ok: false,
        error: {
          code: 'USER_MISMATCH',
          message: 'Akun aktif tidak cocok dengan sesi saat ini.',
        },
      };
    }

    return {
      ok: true,
      client,
      userId: data.session.user.id,
      sessionUser: data.session.user,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: 'SESSION_ERROR',
        message: err?.message || 'Gagal memverifikasi sesi akun.',
      },
    };
  }
}

export const dbService = {
  // Ambil semua data pengguna dari tabel-tabel Supabase
  async fetchAllUserData(userId: string): Promise<CloudFullData | null> {
    const check = await verifyActiveSupabaseSession(userId, false);
    if (check.ok === false) {
      return null;
    }
    const client = check.client;
    userId = check.userId;

    try {
      const [
        profileRes,
        journalsRes,
        agendasRes,
        habitsRes,
        targetsRes,
        walletsRes,
        calendarEventsRes,
      ] = await Promise.all([
        client.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
        client.from('journals').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        client.from('agendas').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        client.from('habits').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        client.from('targets').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        client.from('wallets').select('*').eq('user_id', userId).maybeSingle(),
        client
          .from('calendar_events')
          .select('*')
          .eq('user_id', userId)
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true }),
      ]);

      const result: CloudFullData = {};

      // Profile
      if (profileRes.data) {
        const p = profileRes.data;
        let parsedFeedback: AppFeedback | undefined;
        if (p.feedback) {
          try {
            parsedFeedback = typeof p.feedback === 'string' ? JSON.parse(p.feedback) : p.feedback;
          } catch {}
        }
        result.userProfile = {
          name: p.full_name || 'Pengguna',
          email: p.email || check.sessionUser?.email || undefined,
          avatarUrl: p.avatar_url || undefined,
          greetingTitle: p.greeting_title || `Selamat Datang, ${p.full_name || 'Pengguna'}`,
          greetingSubtitle: p.greeting_subtitle || 'Ayo lebih produktif lagi.',
          streakDays: Number(p.streak_days) || 0,
          lastStreakDate: p.last_streak_date,
          currencySymbol: p.currency_symbol || 'Rp',
          monthName: 'Bulan Berjalan',
          year: new Date().getFullYear(),
          totalDaysInMonth: 31,
          firstAppOpenAt: p.first_app_open_at || undefined,
          feedback: parsedFeedback,
        };
      }

      // Calendar Events (graceful if table not created on Supabase yet)
      if (calendarEventsRes.error) {
        const msg = calendarEventsRes.error.message || '';
        const code = calendarEventsRes.error.code || '';
        if (code === 'PGRST205' || code === '42P01' || msg.includes('calendar_events')) {
          result.calendarEventsTableMissing = true;
        } else {
          console.warn('Notice fetch calendar_events from Supabase:', msg);
        }
      } else if (calendarEventsRes.data) {
        result.calendarEventsTableMissing = false;
        result.calendarEvents = calendarEventsRes.data.map((ev: any): CalendarEvent => ({
          id: ev.id,
          userId: ev.user_id,
          title: ev.title,
          description: ev.description || '',
          date: ev.event_date,
          time: ev.event_time || undefined,
          category: (ev.category || 'pribadi') as CalendarEventCategory,
          completed: Boolean(ev.completed),
          createdAt: ev.created_at || new Date().toISOString(),
          updatedAt: ev.updated_at || undefined,
        }));
      }

      // Journals -> quickNotes
      result.quickNotes = journalsRes.data ? journalsRes.data.map((j: any): QuickNote => ({
        id: j.id,
        text: j.content,
        createdAt: j.date || new Date(j.created_at).toLocaleString('id-ID'),
        timestamp: Number(j.timestamp) || new Date(j.created_at).getTime(),
        tags: Array.isArray(j.tags) ? j.tags : [],
      })) : [];

      // Agendas -> tasks
      result.tasks = agendasRes.data ? agendasRes.data.map((a: any): Task => ({
        id: a.id,
        title: a.title,
        days: a.days || {},
        category: a.category || 'Umum',
        flagged: !!a.flagged,
        createdAt: a.created_at,
      })) : [];

      // Habits
      result.habits = habitsRes.data ? habitsRes.data.map((h: any): Habit => ({
        id: h.id,
        title: h.title,
        completedDays: Number(h.completed_days) || 0,
        totalDays: Number(h.total_days) || 30,
        color: h.color || '#38bdf8',
        completedToday: !!h.completed_today,
        lastCompletedDate: h.last_completed_date,
      })) : [];

      // Targets
      result.targets = targetsRes.data ? targetsRes.data.map((t: any): TargetItem => ({
        id: t.id,
        title: t.title,
        period: t.period || 'daily',
        targetCount: Number(t.target_amount) || 0,
        currentCount: Number(t.current_amount) || 0,
        unit: t.unit || 'kali',
        category: t.category,
        autoTrack: t.auto_track,
        isManual: !!t.is_manual,
        completed: !!t.completed,
        createdAt: t.created_at,
      })) : [];

      // Wallets -> totalBalance & transactions
      if (walletsRes.error) {
        console.warn('Notice fetch wallets from Supabase:', walletsRes.error.message);
      }
      if (journalsRes.error) {
        console.warn('Notice fetch journals from Supabase:', journalsRes.error.message);
      }
      if (agendasRes.error) {
        console.warn('Notice fetch agendas from Supabase:', agendasRes.error.message);
      }

      if (walletsRes.data) {
        const w = walletsRes.data;
        result.totalBalance = Number(w.total_balance) || 0;
        result.savingsBalance = Number(w.safe_balance) || 0;
        result.transactions = Array.isArray(w.transactions) ? w.transactions : [];
      } else {
        result.totalBalance = 0;
        result.savingsBalance = 0;
        result.transactions = [];
      }

      return result;
    } catch (err) {
      console.error('Error fetching all user data from Supabase:', err);
      throw err;
    }
  },

  // Inisialisasi profil dasar untuk pengguna baru tanpa mereset dompet/saldo yang sudah ada
  async ensureUserProfileInitialized(userId: string, email?: string, fullName?: string): Promise<UserProfile> {
    const client = getSupabase();
    let displayName = fullName || email?.split('@')[0] || 'Pengguna Baru';

    try {
      // Cek apakah profil sudah ada di tabel user_profiles
      const { data: existing, error } = await client.from('user_profiles').select('*').eq('id', userId).maybeSingle();
      
      if (!error && existing) {
        let displayAvatarUrl = existing.avatar_url || undefined;
        if (displayAvatarUrl && !displayAvatarUrl.startsWith('data:') && !displayAvatarUrl.startsWith('blob:') && !displayAvatarUrl.startsWith('http')) {
          try {
            displayAvatarUrl = await getAvatarSignedUrl(displayAvatarUrl, 86400);
          } catch (e) {
            console.warn('Gagal resolve signed url untuk avatar tersimpan:', e);
          }
        }

        return {
          name: existing.full_name || displayName,
          avatarUrl: displayAvatarUrl,
          greetingTitle: existing.greeting_title || `Selamat Datang, ${displayName}`,
          greetingSubtitle: existing.greeting_subtitle || 'Kelola agenda, kebiasaan, dan keuangan Anda hari ini.',
          streakDays: Number(existing.streak_days) || 0,
          lastStreakDate: existing.last_streak_date,
          currencySymbol: existing.currency_symbol || 'Rp',
          monthName: 'Bulan Berjalan',
          year: new Date().getFullYear(),
          totalDaysInMonth: 31,
          firstAppOpenAt: existing.first_app_open_at || undefined,
          feedback: existing.feedback ? (typeof existing.feedback === 'string' ? JSON.parse(existing.feedback) : existing.feedback) : undefined,
        };
      }

      // Inisialisasi profil baru untuk Supabase User ID jika belum terdaftar
      const initialProfile = {
        id: userId,
        email: email || null,
        full_name: displayName,
        greeting_title: `Selamat Datang, ${displayName}`,
        greeting_subtitle: 'Kelola agenda, kebiasaan, dan keuangan Anda hari ini.',
        streak_days: 0,
        last_streak_date: null,
        currency_symbol: 'Rp',
        updated_at: new Date().toISOString(),
      };

      await client.from('user_profiles').upsert(initialProfile);

      // Pastikan baris wallet ada HANYA jika belum ada.
      // JANGAN PERNAH menimpa saldo (total_balance) yang sudah ada di Supabase menjadi Rp 0!
      const { data: existingWallet } = await client.from('wallets').select('id, total_balance').eq('user_id', userId).maybeSingle();
      if (!existingWallet) {
        const walletId = `wallet_${userId}`;
        await client.from('wallets').insert({
          id: walletId,
          user_id: userId,
          total_balance: 0,
          transactions: [],
          updated_at: new Date().toISOString(),
        });
      }
    } catch (dbErr) {
      console.warn('Notice ensuring user profile table in Supabase:', dbErr);
    }

    return {
      name: displayName,
      greetingTitle: `Selamat Datang, ${displayName}`,
      greetingSubtitle: 'Kelola agenda, kebiasaan, dan keuangan Anda hari ini.',
      streakDays: 0,
      currencySymbol: 'Rp',
      monthName: 'Bulan Berjalan',
      year: new Date().getFullYear(),
      totalDaysInMonth: 31,
    };
  },

  // Upload/Sync data lokal ke Supabase secara serentak
  async uploadAllLocalData(
    userId: string,
    data: {
      userProfile: UserProfile;
      tasks: Task[];
      habits: Habit[];
      transactions: Transaction[];
      quickNotes: QuickNote[];
      targets: TargetItem[];
      totalBalance: number;
    }
  ) {
    const client = getSupabase();

    // 1. User Profile
    await client.from('user_profiles').upsert({
      id: userId,
      full_name: data.userProfile.name,
      avatar_url: data.userProfile.avatarUrl || null,
      greeting_title: data.userProfile.greetingTitle,
      greeting_subtitle: data.userProfile.greetingSubtitle,
      streak_days: data.userProfile.streakDays,
      last_streak_date: data.userProfile.lastStreakDate || null,
      currency_symbol: data.userProfile.currencySymbol,
      updated_at: new Date().toISOString(),
    });

    // 2. Wallets
    const walletId = `wallet_${userId}`;
    await client.from('wallets').upsert({
      id: walletId,
      user_id: userId,
      total_balance: data.totalBalance,
      transactions: data.transactions,
      updated_at: new Date().toISOString(),
    });

    // 3. Journals
    if (data.quickNotes.length > 0) {
      const journalPayloads = data.quickNotes.map((n) => ({
        id: n.id,
        user_id: userId,
        content: n.text,
        date: n.createdAt,
        tags: n.tags || [],
        timestamp: n.timestamp || Date.now(),
        updated_at: new Date().toISOString(),
      }));
      await client.from('journals').upsert(journalPayloads);
    }

    // 4. Agendas
    if (data.tasks.length > 0) {
      const agendaPayloads = data.tasks.map((t) => ({
        id: t.id,
        user_id: userId,
        title: t.title,
        days: t.days || {},
        category: t.category || 'Umum',
        flagged: !!t.flagged,
        updated_at: new Date().toISOString(),
      }));
      await client.from('agendas').upsert(agendaPayloads);
    }

    // 5. Habits
    if (data.habits.length > 0) {
      const habitPayloads = data.habits.map((h) => ({
        id: h.id,
        user_id: userId,
        title: h.title,
        completed_days: h.completedDays,
        total_days: h.totalDays,
        color: h.color || '#38bdf8',
        completed_today: !!h.completedToday,
        last_completed_date: h.lastCompletedDate || null,
        updated_at: new Date().toISOString(),
      }));
      await client.from('habits').upsert(habitPayloads);
    }

    // 6. Targets
    if (data.targets.length > 0) {
      const targetPayloads = data.targets.map((t) => ({
        id: t.id,
        user_id: userId,
        title: t.title,
        target_amount: t.targetCount,
        current_amount: t.currentCount,
        period: t.period,
        unit: t.unit,
        category: t.category || 'Produktivitas',
        auto_track: t.autoTrack || null,
        is_manual: !!t.isManual,
        completed: !!t.completed,
        updated_at: new Date().toISOString(),
      }));
      await client.from('targets').upsert(targetPayloads);
    }
  },

  // Operasi CRUD Tunggal (Granular)
  async upsertJournal(userId: string, note: QuickNote) {
    const client = getSupabase();
    return client.from('journals').upsert({
      id: note.id,
      user_id: userId,
      content: note.text,
      date: note.createdAt,
      tags: note.tags || [],
      timestamp: note.timestamp || Date.now(),
      updated_at: new Date().toISOString(),
    });
  },

  async deleteJournal(userId: string, noteId: string) {
    const client = getSupabase();
    return client.from('journals').delete().eq('id', noteId).eq('user_id', userId);
  },

  async upsertAgenda(userId: string | undefined, task: Task) {
    const check = await verifyActiveSupabaseSession(userId, true);
    if (check.ok === false) {
      return { data: null, error: check.error, sessionUser: null as User | null };
    }
    const activeUserId = check.userId;
    const dateText = task.createdAt
      ? task.createdAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const isCompleted = Object.values(task.days || {}).some((v) => v === 'done');

    const res = await check.client
      .from('agendas')
      .upsert(
        {
          id: task.id,
          user_id: activeUserId,
          title: task.title,
          date: dateText,
          is_completed: isCompleted,
          days: task.days || {},
          category: task.category || 'Umum',
          flagged: !!task.flagged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    return {
      ...res,
      sessionUser: check.sessionUser,
    };
  },

  async syncAllAgendas(userId: string | undefined, tasks: Task[]) {
    const check = await verifyActiveSupabaseSession(userId, true);
    if (check.ok === false) {
      return { data: null, error: check.error, sessionUser: null as User | null };
    }
    const client = check.client;
    const activeUserId = check.userId;
    if (tasks.length === 0) {
      const delRes = await client.from('agendas').delete().eq('user_id', activeUserId);
      return { ...delRes, sessionUser: check.sessionUser };
    }
    const payloads = tasks.map((t) => ({
      id: t.id,
      user_id: activeUserId,
      title: t.title,
      date: t.createdAt ? t.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      is_completed: Object.values(t.days || {}).some((v) => v === 'done'),
      days: t.days || {},
      category: t.category || 'Umum',
      flagged: !!t.flagged,
      updated_at: new Date().toISOString(),
    }));
    const res = await client.from('agendas').upsert(payloads, { onConflict: 'id' }).select();
    if (!res.error) {
      try {
        const currentIds = new Set(tasks.map((t) => t.id));
        const { data: remoteRows } = await client.from('agendas').select('id').eq('user_id', activeUserId);
        if (remoteRows) {
          const toDelete = remoteRows.filter((r: any) => !currentIds.has(r.id)).map((r: any) => r.id);
          if (toDelete.length > 0) {
            await client.from('agendas').delete().eq('user_id', activeUserId).in('id', toDelete);
          }
        }
      } catch {}
    }
    return {
      ...res,
      sessionUser: check.sessionUser,
    };
  },

  async deleteAgenda(userId: string | undefined, taskId: string) {
    const check = await verifyActiveSupabaseSession(userId, true);
    if (check.ok === false) {
      return { data: null, error: check.error, sessionUser: null as User | null };
    }
    const res = await check.client.from('agendas').delete().eq('id', taskId).eq('user_id', check.userId);
    return {
      ...res,
      sessionUser: check.sessionUser,
    };
  },

  async upsertHabit(userId: string, habit: Habit) {
    const client = getSupabase();
    return client.from('habits').upsert({
      id: habit.id,
      user_id: userId,
      title: habit.title,
      completed_days: habit.completedDays,
      total_days: habit.totalDays,
      color: habit.color || '#38bdf8',
      completed_today: !!habit.completedToday,
      last_completed_date: habit.lastCompletedDate || null,
      updated_at: new Date().toISOString(),
    });
  },

  async syncAllHabits(userId: string, habits: Habit[]) {
    const client = getSupabase();
    if (habits.length === 0) {
      return client.from('habits').delete().eq('user_id', userId);
    }
    const payloads = habits.map((h) => ({
      id: h.id,
      user_id: userId,
      title: h.title,
      completed_days: h.completedDays,
      total_days: h.totalDays,
      color: h.color || '#38bdf8',
      completed_today: !!h.completedToday,
      last_completed_date: h.lastCompletedDate || null,
      updated_at: new Date().toISOString(),
    }));
    const res = await client.from('habits').upsert(payloads);
    try {
      const currentIds = habits.map((h) => h.id);
      const { data: remoteRows } = await client.from('habits').select('id').eq('user_id', userId);
      if (remoteRows) {
        const toDelete = remoteRows.filter((r: any) => !currentIds.includes(r.id)).map((r: any) => r.id);
        if (toDelete.length > 0) {
          await client.from('habits').delete().eq('user_id', userId).in('id', toDelete);
        }
      }
    } catch {}
    return res;
  },

  async deleteHabit(userId: string, habitId: string) {
    const client = getSupabase();
    return client.from('habits').delete().eq('id', habitId).eq('user_id', userId);
  },

  async upsertTarget(userId: string, target: TargetItem) {
    const client = getSupabase();
    return client.from('targets').upsert({
      id: target.id,
      user_id: userId,
      title: target.title,
      target_amount: target.targetCount,
      current_amount: target.currentCount,
      period: target.period,
      unit: target.unit,
      category: target.category || 'Produktivitas',
      auto_track: target.autoTrack || null,
      is_manual: !!target.isManual,
      completed: !!target.completed,
      updated_at: new Date().toISOString(),
    });
  },

  async deleteTarget(userId: string, targetId: string) {
    const client = getSupabase();
    return client.from('targets').delete().eq('id', targetId).eq('user_id', userId);
  },

  async syncWallet(userId: string, totalBalance: number, transactions: Transaction[], savingsBalance?: number) {
    const client = getSupabase();
    const walletId = `wallet_${userId}`;
    const payload: any = {
      id: walletId,
      user_id: userId,
      total_balance: totalBalance,
      transactions: transactions,
      updated_at: new Date().toISOString(),
    };
    if (savingsBalance !== undefined) {
      payload.safe_balance = savingsBalance;
    }
    const res = await client.from('wallets').upsert(payload);
    // Jika kolom safe_balance belum ada pada tabel lama pengguna, simpan kembali tanpa safe_balance
    if (res.error && (res.error.message?.includes('safe_balance') || res.error.details?.includes('safe_balance'))) {
      delete payload.safe_balance;
      return client.from('wallets').upsert(payload);
    }
    return res;
  },

  async syncProfile(userId: string | undefined, profile: UserProfile) {
    const check = await verifyActiveSupabaseSession(userId, true);
    if (check.ok === false) {
      return { data: null, error: check.error, sessionUser: null as User | null };
    }
    const client = check.client;
    const activeUserId = check.userId;
    const resolvedEmail = profile.email || check.sessionUser?.email || null;

    const payload: any = {
      id: activeUserId,
      email: resolvedEmail,
      full_name: profile.name,
      avatar_url: profile.avatarUrl || null,
      greeting_title: profile.greetingTitle,
      greeting_subtitle: profile.greetingSubtitle,
      streak_days: profile.streakDays,
      last_streak_date: profile.lastStreakDate || null,
      currency_symbol: profile.currencySymbol,
      updated_at: new Date().toISOString(),
    };

    if (profile.firstAppOpenAt) {
      payload.first_app_open_at = profile.firstAppOpenAt;
    }
    if (profile.feedback) {
      payload.feedback = profile.feedback;
    }

    const res = await client.from('user_profiles').upsert(payload, { onConflict: 'id' });

    // Jika hanya kolom first_app_open_at yang belum ada, simpan ulang tanpa first_app_open_at,
    // namun JANGAN pernah menghapus payload.feedback secara diam-diam.
    if (
      res.error &&
      !res.error.message?.includes('feedback') &&
      !res.error.details?.includes('feedback') &&
      (res.error.message?.includes('first_app_open_at') ||
        res.error.details?.includes('first_app_open_at'))
    ) {
      delete payload.first_app_open_at;
      const retryRes = await client.from('user_profiles').upsert(payload, { onConflict: 'id' });
      return { ...retryRes, sessionUser: check.sessionUser };
    }

    return { ...res, sessionUser: check.sessionUser };
  },

  async submitUserFeedback(
    userId: string | undefined,
    profile: UserProfile,
    feedback: AppFeedback
  ): Promise<{ ok: boolean; error?: string; sessionUser?: User | null }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, error: 'Konfigurasi server cloud belum terhubung.' };
    }

    const check = await verifyActiveSupabaseSession(userId, true);
    if (check.ok === false) {
      return { ok: false, error: check.error.message };
    }

    const client = check.client;
    const activeUserId = check.userId;
    const resolvedEmail = profile.email || check.sessionUser?.email || null;
    const nowIso = new Date().toISOString();

    const [profileRes, dedicatedRes] = await Promise.all([
      client
        .from('user_profiles')
        .upsert(
          {
            id: activeUserId,
            email: resolvedEmail,
            full_name: profile.name || resolvedEmail?.split('@')[0] || 'Pengguna',
            avatar_url: profile.avatarUrl || null,
            greeting_title: profile.greetingTitle,
            greeting_subtitle: profile.greetingSubtitle,
            streak_days: profile.streakDays || 0,
            last_streak_date: profile.lastStreakDate || null,
            currency_symbol: profile.currencySymbol || 'Rp',
            feedback,
            updated_at: nowIso,
          },
          { onConflict: 'id' }
        ),
      client
        .from('user_feedbacks')
        .upsert(
          {
            user_id: activeUserId,
            email: resolvedEmail,
            full_name: profile.name || resolvedEmail?.split('@')[0] || 'Pengguna',
            avatar_url: profile.avatarUrl || null,
            rating: Math.min(5, Math.max(1, Math.round(Number(feedback.rating) || 5))),
            suggestions: feedback.suggestions || '',
            tags: Array.isArray(feedback.tags) ? feedback.tags : [],
            submitted_at: feedback.submittedAt || nowIso,
            updated_at: feedback.updatedAt || nowIso,
          },
          { onConflict: 'user_id' }
        ),
    ]);

    const profileSaved = !profileRes.error;
    const dedicatedSaved = !dedicatedRes.error;

    if (!profileSaved && !dedicatedSaved) {
      return {
        ok: false,
        error: profileRes.error?.message || dedicatedRes.error?.message || 'Gagal menyimpan penilaian ke Supabase.',
        sessionUser: check.sessionUser,
      };
    }

    return { ok: true, sessionUser: check.sessionUser };
  },

  async syncOnboardingPreferences(
    userId: string,
    profile: UserProfile
  ): Promise<void> {
    if (!isSupabaseConfigured() || !isValidSupabaseUserId(userId)) return;
    const client = getSupabase();

    try {
      await Promise.allSettled([
        this.syncProfile(userId, profile),
        client.auth.updateUser({
          data: {
            full_name: profile.name,
            name: profile.name,
            primary_focus: profile.primaryFocus || 'all',
            reminder_enabled: Boolean(profile.reminderEnabled),
            notification_permission: profile.notificationPermission || 'default',
            onboarding_completed: true,
            onboarding_completed_at: profile.onboardingCompletedAt || new Date().toISOString(),
          },
        }),
      ]);
    } catch (err) {
      console.warn('Notice syncing onboarding preferences:', err);
    }
  },

  // Mengambil seluruh ulasan & penilaian bintang beserta status diagnostik RLS yang jujur
  async fetchAllUserFeedbacksWithStatus(): Promise<{
    feedbacks: Array<{
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
    }>;
    errorMessage?: string;
    rlsRestrictedLikely: boolean;
    totalProfileRowsRead: number;
    userFeedbacksTableExists: boolean;
  }> {
    if (!isSupabaseConfigured()) {
      return {
        feedbacks: [],
        errorMessage: 'Konfigurasi Supabase belum aktif.',
        rlsRestrictedLikely: false,
        totalProfileRowsRead: 0,
        userFeedbacksTableExists: false,
      };
    }

    const client = getSupabase();
    try {
      const [profilesRes, dedicatedRes] = await Promise.all([
        client.from('user_profiles').select('*'),
        client.from('user_feedbacks').select('*'),
      ]);

      const errorParts: string[] = [];
      if (profilesRes.error) {
        errorParts.push(`user_profiles: ${profilesRes.error.message}`);
      }

      const dedicatedMissing =
        Boolean(dedicatedRes.error) &&
        (dedicatedRes.error?.code === 'PGRST205' ||
          dedicatedRes.error?.code === '42P01' ||
          dedicatedRes.error?.message?.includes('user_feedbacks'));

      if (dedicatedRes.error && !dedicatedMissing) {
        errorParts.push(`user_feedbacks: ${dedicatedRes.error.message}`);
      }

      const byUserId = new Map<
        string,
        {
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
      >();

      const upsertRow = (item: {
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
      }) => {
        const existing = byUserId.get(item.id);
        if (!existing) {
          byUserId.set(item.id, item);
          return;
        }
        const existingTs = new Date(existing.updatedAt || existing.submittedAt || 0).getTime();
        const nextTs = new Date(item.updatedAt || item.submittedAt || 0).getTime();
        if (nextTs >= existingTs) {
          byUserId.set(item.id, {
            ...existing,
            ...item,
            email: item.email || existing.email,
            avatarUrl: item.avatarUrl || existing.avatarUrl,
            firstAppOpenAt: item.firstAppOpenAt || existing.firstAppOpenAt,
          });
        }
      };

      const totalProfileRowsRead = Array.isArray(profilesRes.data) ? profilesRes.data.length : 0;

      if (Array.isArray(profilesRes.data)) {
        profilesRes.data.forEach((row: any) => {
          let parsedFb = row.feedback;
          if (typeof parsedFb === 'string') {
            try {
              parsedFb = JSON.parse(parsedFb);
            } catch {}
          }

          if (parsedFb && (parsedFb.rating || parsedFb.suggestions)) {
            const normalizedRating = Math.min(5, Math.max(1, Math.round(Number(parsedFb.rating) || 5)));
            upsertRow({
              id: row.id,
              email: row.email || undefined,
              fullName: row.full_name || 'Pengguna',
              avatarUrl: row.avatar_url || undefined,
              rating: normalizedRating,
              suggestions: parsedFb.suggestions || '',
              tags: Array.isArray(parsedFb.tags) ? parsedFb.tags : [],
              submittedAt: parsedFb.submittedAt || row.updated_at || row.created_at,
              updatedAt: parsedFb.updatedAt || row.updated_at,
              firstAppOpenAt: row.first_app_open_at,
            });
          }
        });
      }

      if (!dedicatedRes.error && Array.isArray(dedicatedRes.data)) {
        dedicatedRes.data.forEach((row: any) => {
          const normalizedRating = Math.min(5, Math.max(1, Math.round(Number(row.rating) || 5)));
          upsertRow({
            id: row.user_id,
            email: row.email || undefined,
            fullName: row.full_name || 'Pengguna',
            avatarUrl: row.avatar_url || undefined,
            rating: normalizedRating,
            suggestions: row.suggestions || '',
            tags: Array.isArray(row.tags) ? row.tags : [],
            submittedAt: row.submitted_at || row.updated_at,
            updatedAt: row.updated_at || row.submitted_at,
          });
        });
      }

      const feedbacks = Array.from(byUserId.values()).sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.submittedAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.submittedAt || 0).getTime();
        return timeB - timeA;
      });

      const userFeedbacksCount = Array.isArray(dedicatedRes.data) ? dedicatedRes.data.length : 0;
      const rlsRestrictedLikely =
        !profilesRes.error && totalProfileRowsRead <= 1 && userFeedbacksCount <= 1;

      return {
        feedbacks,
        errorMessage: errorParts.length > 0 ? errorParts.join(' | ') : undefined,
        rlsRestrictedLikely,
        totalProfileRowsRead,
        userFeedbacksTableExists: !dedicatedMissing && !dedicatedRes.error,
      };
    } catch (err: any) {
      console.error('Error fetching feedbacks for admin:', err);
      return {
        feedbacks: [],
        errorMessage: err?.message || 'Gagal menghubungi server Supabase.',
        rlsRestrictedLikely: false,
        totalProfileRowsRead: 0,
        userFeedbacksTableExists: false,
      };
    }
  },

  // Mengambil seluruh ulasan & penilaian bintang dari tabel user_profiles / user_feedbacks untuk akun Admin
  async fetchAllUserFeedbacks(): Promise<Array<{
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
  }>> {
    const res = await this.fetchAllUserFeedbacksWithStatus();
    return res.feedbacks;
  },

  // ============================================================================
  // KALENDER JADWAL ACARA (calendar_events) - RLS BERDASARKAN user_id
  // ============================================================================

  async fetchCalendarEvents(userId?: string): Promise<{
    events: CalendarEvent[];
    tableMissing: boolean;
    error?: string;
  }> {
    if (!isSupabaseConfigured()) {
      return { events: [], tableMissing: false };
    }
    const check = await verifyActiveSupabaseSession(userId, false);
    if (check.ok === false) {
      return { events: [], tableMissing: false, error: check.error.message };
    }
    const { data, error } = await check.client
      .from('calendar_events')
      .select('*')
      .eq('user_id', check.userId)
      .order('event_date', { ascending: true })
      .order('event_time', { ascending: true });

    if (error) {
      const tableMissing =
        error.code === 'PGRST205' ||
        error.code === '42P01' ||
        error.message?.includes('calendar_events');
      return { events: [], tableMissing: Boolean(tableMissing), error: error.message };
    }

    const events: CalendarEvent[] = (data || []).map((ev: any) => ({
      id: ev.id,
      userId: ev.user_id,
      title: ev.title,
      description: ev.description || '',
      date: ev.event_date,
      time: ev.event_time || undefined,
      category: (ev.category || 'pribadi') as CalendarEventCategory,
      completed: Boolean(ev.completed),
      createdAt: ev.created_at || new Date().toISOString(),
      updatedAt: ev.updated_at || undefined,
    }));

    return { events, tableMissing: false };
  },

  async upsertCalendarEvent(userId: string | undefined, event: CalendarEvent) {
    const check = await verifyActiveSupabaseSession(userId, true);
    if (check.ok === false) {
      return { data: null, error: check.error, tableMissing: false, sessionUser: null as User | null };
    }
    const res = await check.client
      .from('calendar_events')
      .upsert(
        {
          id: event.id,
          user_id: check.userId,
          title: event.title,
          description: event.description || '',
          event_date: event.date,
          event_time: event.time || null,
          category: event.category || 'pribadi',
          completed: Boolean(event.completed),
          created_at: event.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    const tableMissing = Boolean(
      res.error &&
        (res.error.code === 'PGRST205' ||
          res.error.code === '42P01' ||
          res.error.message?.includes('calendar_events'))
    );

    return {
      ...res,
      tableMissing,
      sessionUser: check.sessionUser,
    };
  },

  async deleteCalendarEvent(userId: string | undefined, eventId: string) {
    const check = await verifyActiveSupabaseSession(userId, true);
    if (check.ok === false) {
      return { data: null, error: check.error, tableMissing: false, sessionUser: null as User | null };
    }
    const res = await check.client
      .from('calendar_events')
      .delete()
      .eq('id', eventId)
      .eq('user_id', check.userId);

    const tableMissing = Boolean(
      res.error &&
        (res.error.code === 'PGRST205' ||
          res.error.code === '42P01' ||
          res.error.message?.includes('calendar_events'))
    );

    return {
      ...res,
      tableMissing,
      sessionUser: check.sessionUser,
    };
  },

  // ============================================================================
  // PEMBERITAHUAN APLIKASI (ANNOUNCEMENTS) - ADMIN WRITE, ALL USERS READ
  // ============================================================================

  // Ambil semua pemberitahuan aktif untuk pengguna (atau semua bagi admin)
  async fetchAnnouncements(onlyActive = true): Promise<AppAnnouncement[]> {
    const STORAGE_KEY = 'ascend_app_announcements_cache';
    const fallbackList = (): AppAnnouncement[] => {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached !== null) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            return onlyActive ? parsed.filter((a: AppAnnouncement) => a.isActive) : parsed;
          }
        }
      } catch {}
      return [];
    };

    if (!isSupabaseConfigured()) {
      return fallbackList();
    }

    try {
      const client = getSupabase();
      let query = client
        .from('announcements')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (onlyActive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) {
        // Tabel announcements mungkin belum dibuat atau schema cache belum direfresh
        console.warn('Gagal memuat pemberitahuan dari Supabase (fallback ke cache):', error.message);
        return fallbackList();
      }

      const formatted: AppAnnouncement[] = (data || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        type: row.type || 'info',
        isActive: row.is_active ?? true,
        isPinned: row.is_pinned ?? false,
        authorName: row.author_name || 'Tim Pembuat Aplikasi',
        authorEmail: row.author_email || undefined,
        actionUrl: row.action_url || undefined,
        actionLabel: row.action_label || undefined,
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at,
        expiresAt: row.expires_at,
      }));

      // Gabungkan dengan item lokal yang baru dibuat jika belum tersinkronisasi ke server
      const localList = fallbackList();
      let merged = formatted;
      if (formatted.length === 0) {
        merged = localList;
      } else if (localList.length > 0) {
        const remoteIds = new Set(formatted.map((f) => f.id));
        const pendingLocal = localList.filter((l) => !remoteIds.has(l.id));
        if (pendingLocal.length > 0) {
          merged = [...formatted, ...pendingLocal];
        }
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {}

      return merged;
    } catch (err) {
      console.warn('Error fetching announcements:', err);
      return fallbackList();
    }
  },

  // Simpan / Buat pemberitahuan baru oleh admin
  async upsertAnnouncement(announcement: AppAnnouncement): Promise<boolean> {
    const STORAGE_KEY = 'ascend_app_announcements_cache';

    // Update lokal cache terlebih dahulu
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      let list: AppAnnouncement[] = cached ? JSON.parse(cached) : [];
      const idx = list.findIndex((a) => a.id === announcement.id);
      if (idx >= 0) {
        list[idx] = announcement;
      } else {
        list.unshift(announcement);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new Event('ascend-announcements-read-updated'));
    } catch (e) {
      console.warn('Gagal menyimpan pengumuman ke cache lokal:', e);
    }

    if (!isSupabaseConfigured()) {
      return true;
    }

    try {
      const client = getSupabase();
      const payload = {
        id: announcement.id,
        title: announcement.title,
        message: announcement.message,
        type: announcement.type,
        is_active: announcement.isActive,
        is_pinned: announcement.isPinned ?? false,
        author_name: announcement.authorName || 'Tim Pembuat Aplikasi',
        author_email: announcement.authorEmail,
        action_url: announcement.actionUrl,
        action_label: announcement.actionLabel,
        updated_at: new Date().toISOString(),
      };

      const { error } = await client.from('announcements').upsert(payload, { onConflict: 'id' });
      if (error) {
        // Jika tabel announcements belum ada di schema cache Supabase (misal error PGRST205 atau 42P01)
        console.warn('Supabase announcements upsert warning (data tersimpan aman di lokal cache):', error.message || error);
        return true;
      }
      return true;
    } catch (err: any) {
      console.warn('Upsert announcement error (data aman di lokal cache):', err?.message || err);
      return true;
    }
  },

  // Hapus pemberitahuan oleh admin
  async deleteAnnouncement(announcementId: string): Promise<boolean> {
    const STORAGE_KEY = 'ascend_app_announcements_cache';
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const list: AppAnnouncement[] = JSON.parse(cached);
        const filtered = list.filter((a) => a.id !== announcementId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      }
      window.dispatchEvent(new Event('ascend-announcements-read-updated'));
    } catch (e) {
      console.warn('Gagal update cache lokal saat delete:', e);
    }

    if (!isSupabaseConfigured()) {
      return true;
    }

    try {
      const client = getSupabase();
      const { error } = await client.from('announcements').delete().eq('id', announcementId);
      if (error) {
        console.warn('Gagal menghapus pemberitahuan di Supabase (dihapus dari lokal):', error.message || error);
      }
    } catch (err: any) {
      console.warn('Delete announcement in Supabase error (handled locally):', err?.message || err);
    }
    return true;
  },

  // Unggah foto profil ke Supabase Storage (bucket 'profiles' private) dengan fallback DataURL
  async uploadAvatar(userId: string, file: File | Blob): Promise<string> {
    const res = await uploadUserAvatar(userId, file);
    return res.signedUrl;
  },

  // Perbarui atau hapus avatar_url langsung di tabel user_profiles
  async updateAvatarUrl(userId: string, avatarUrl: string | null) {
    if (!avatarUrl) {
      await removeUserAvatar(userId);
      return { data: null, error: null };
    }
    const client = getSupabase();
    return client.from('user_profiles').update({
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
  },

  // Periksa status ketersediaan tabel di database Supabase
  async checkTablesStatus(): Promise<{
    allExist: boolean;
    tables: Record<string, { exists: boolean; label: string; error?: string }>;
  }> {
    const client = getSupabase();
    const tableConfigs = [
      { key: 'journals', label: 'Catatan Jurnal Harian (journals)' },
      { key: 'user_profiles', label: 'Profil & Streak Pengguna (user_profiles)' },
      { key: 'agendas', label: 'Agenda & Tugas Kalender (agendas)' },
      { key: 'wallets', label: 'Dompet & Transaksi (wallets)' },
      { key: 'targets', label: 'Target & Sasaran (targets)' },
      { key: 'habits', label: 'Pelacak Kebiasaan (habits)' },
      { key: 'calendar_events', label: 'Kalender Jadwal Acara (calendar_events)' },
      { key: 'user_feedbacks', label: 'Penilaian & Saran Pengguna (user_feedbacks)' },
      { key: 'announcements', label: 'Pemberitahuan Aplikasi (announcements)' },
      { key: 'pdf_reports', label: 'Arsip Laporan PDF Bulanan (pdf_reports)' },
    ];

    const tables: Record<string, { exists: boolean; label: string; error?: string }> = {};

    await Promise.all(
      tableConfigs.map(async ({ key, label }) => {
        try {
          const { error } = await client.from(key).select('*').limit(1);
          if (error && error.code === 'PGRST205') {
            tables[key] = { exists: false, label, error: error.message };
          } else {
            tables[key] = { exists: true, label };
          }
        } catch (err: any) {
          tables[key] = { exists: false, label, error: err?.message || 'Gagal memeriksa' };
        }
      })
    );

    const allExist = Object.values(tables).every((t) => t.exists);
    return { allExist, tables };
  },

  // Jalankan migrasi via endpoint backend server
  async triggerServerMigration(param?: string): Promise<{ success: boolean; message: string; tablesStatus?: Record<string, boolean> }> {
    try {
      const resp = await fetch('/api/run-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(param?.startsWith('postgres') ? { connectionString: param } : { password: param }),
      });
      const data = await resp.json();
      return data;
    } catch (err: any) {
      return { success: false, message: err?.message || 'Gagal memanggil server migrasi' };
    }
  },
};

// ==============================================================================
// 3. REALTIME SYNCHRONIZATION CHANNEL (HP ↔ LAPTOP)
// ==============================================================================

export interface RealtimeSyncHandlers {
  onRefreshNeeded: (table: string, eventType: string) => void;
  onStatusChange?: (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => void;
}

export const subscribeToRealtimeSync = (
  userId: string,
  handlers: RealtimeSyncHandlers
): (() => void) => {
  if (!isSupabaseConfigured() || !isValidSupabaseUserId(userId)) {
    return () => {};
  }

  const client = getSupabase();
  const channelName = `realtime-user-${userId}-${Date.now().toString(36)}`;

  const channel: RealtimeChannel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'journals',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        handlers.onRefreshNeeded('journals', payload.eventType);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'agendas',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        handlers.onRefreshNeeded('agendas', payload.eventType);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'habits',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        handlers.onRefreshNeeded('habits', payload.eventType);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'targets',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        handlers.onRefreshNeeded('targets', payload.eventType);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'wallets',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        handlers.onRefreshNeeded('wallets', payload.eventType);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_profiles',
        filter: `id=eq.${userId}`,
      },
      (payload) => {
        handlers.onRefreshNeeded('user_profiles', payload.eventType);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'calendar_events',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        handlers.onRefreshNeeded('calendar_events', payload.eventType);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'announcements',
      },
      (payload) => {
        handlers.onRefreshNeeded('announcements', payload.eventType);
      }
    )
    .subscribe((status) => {
      if (handlers.onStatusChange) {
        handlers.onStatusChange(status as any);
      }
    });

  return () => {
    client.removeChannel(channel);
  };
};

// Realtime channel khusus Admin untuk menerima setiap saran & penilaian baru dari seluruh pengguna
export const subscribeToAllFeedbacks = (
  onFeedbackChanged: () => void,
  onStatusChange?: (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => void
): (() => void) => {
  if (!isSupabaseConfigured()) {
    return () => {};
  }

  const client = getSupabase();
  const channelName = `realtime-admin-feedbacks-${Date.now().toString(36)}`;

  const channel: RealtimeChannel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_profiles',
      },
      () => {
        onFeedbackChanged();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_feedbacks',
      },
      () => {
        onFeedbackChanged();
      }
    )
    .subscribe((status) => {
      if (
        onStatusChange &&
        (status === 'SUBSCRIBED' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED' ||
          status === 'CHANNEL_ERROR')
      ) {
        onStatusChange(status);
      }
    });

  return () => {
    try {
      client.removeChannel(channel);
    } catch {}
  };
};
