import { User } from '@supabase/supabase-js';
import { UserProfile, UserRole } from '../types';

const SUPABASE_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalisasi role pengguna agar nilai tidak dikenal selalu jatuh ke 'user'.
 */
export const normalizeUserRole = (rawRole: unknown): UserRole =>
  rawRole === 'admin' ? 'admin' : 'user';

/**
 * Memastikan role berasal dari sesi Supabase terverifikasi (`app_metadata.role` yang
 * hanya dapat diubah server/Supabase Admin API) atau kolom `role` pada `public.user_profiles`
 * di database Supabase (tidak pernah dari nama, email, atau `user_metadata`).
 */
export const getVerifiedUserRole = (
  currentUser?: User | null,
  userProfile?: UserProfile | null
): UserRole => {
  if (!currentUser?.id || !SUPABASE_UUID_REGEX.test(currentUser.id)) {
    return 'user';
  }

  const appMetaRole = (currentUser.app_metadata as Record<string, unknown> | undefined)?.role;
  if (appMetaRole === 'admin') {
    return 'admin';
  }

  if (userProfile?.role === 'admin') {
    return 'admin';
  }

  return 'user';
};

/**
 * Memeriksa apakah pengguna saat ini berhak mengakses fitur Admin
 * berdasarkan role resmi dari database/autentikasi Supabase.
 */
export const checkIsAdminUser = (
  currentUser?: User | null,
  userProfile?: UserProfile | null
): boolean => getVerifiedUserRole(currentUser, userProfile) === 'admin';

/**
 * Membersihkan role dari objek cache `localStorage` agar client tidak pernah
 * memercayai klaim admin yang dimanipulasi di penyimpanan browser.
 */
export const sanitizeCachedProfile = (
  profile: UserProfile | null | undefined
): UserProfile | null => {
  if (!profile) return null;
  return {
    ...profile,
    role: 'user',
  };
};

export const sanitizeCachedUser = (
  user: User | null | undefined
): User | null => {
  if (!user) return null;
  const appMeta = (user.app_metadata || {}) as Record<string, unknown>;
  if (!('role' in appMeta)) return user;
  const { role: _strippedRole, ...safeAppMeta } = appMeta;
  return {
    ...user,
    app_metadata: safeAppMeta,
  };
};
