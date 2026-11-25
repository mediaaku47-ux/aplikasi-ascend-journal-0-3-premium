import React, { useState } from 'react';
import { UserProfile } from '../../types';
import { 
  User as UserIcon, 
  Smartphone, 
  CheckCircle2,
  Save,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Star,
  ShieldAlert
} from 'lucide-react';
import { MONTH_NAMES_ID, getDaysInMonth, getYearOptions } from '../../utils/dateUtils';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { AppLogo } from '../AppLogo';
import { AccordionSection } from '../AccordionSection';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { SecurityAuditModal } from '../SecurityAuditModal';
import { checkIsAdminUser } from '../../utils/admin';
import { 
  getNotificationPermissionStatus, 
  requestNotificationPermission, 
  getNotificationSettings, 
  saveNotificationSettings, 
  sendTestNotification,
  isWebNotificationSupported,
  isIOSNotStandalone,
  DeviceNotificationSettings 
} from '../../utils/notifications';

interface SettingsViewProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onOpenResetModal: () => void;
  onExportData: () => void;
  onExportPDF: () => void;
  onImportData: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenSync?: () => void;
  onReplaySplash?: () => void;
  onSimulateReminder?: () => void;
  currentUser?: SupabaseUser | null;
  onOpenSupabaseModal?: () => void;
  isSupabaseConfigured?: boolean;
  onLogout?: () => void;
  onOpenProfile?: () => void;
  onOpenHelp?: () => void;
  onOpenFeedback?: () => void;
  onNavigateToDashboard?: () => void;
  onShowToast?: (msg: string) => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  userProfile,
  onUpdateProfile,
  onExportData,
  onExportPDF,
  onImportData,
  onOpenSync,
  onReplaySplash,
  onSimulateReminder,
  currentUser,
  onOpenSupabaseModal,
  isSupabaseConfigured = false,
  onLogout,
  onOpenProfile,
  onOpenHelp,
  onOpenFeedback,
  onNavigateToDashboard,
  onShowToast,
  theme = 'light',
  onToggleTheme,
}) => {
  const isLight = theme === 'light';
  // Sistem Accordion: Semua bagian dalam keadaan TERLIPAT saat halaman dibuka (null)
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggleSection = (id: string) => setOpenSection((prev) => (prev === id ? null : id));

  const [name, setName] = useState(userProfile.name);
  const [greetingSubtitle] = useState(userProfile.greetingSubtitle);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(userProfile.monthIndex ?? 2);
  const [selectedYear, setSelectedYear] = useState(userProfile.year || 2026);
  const [currencySymbol, setCurrencySymbol] = useState(userProfile.currencySymbol);
  const [streakDays] = useState(userProfile.streakDays);
  const [showShortcutInfo, setShowShortcutInfo] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [isSavedRecently, setIsSavedRecently] = useState(false);
  const { isInstallable, install } = usePWAInstall();

  // Preferensi Notifikasi & Izin Resmi Perangkat
  const [notifSettings, setNotifSettings] = useState<DeviceNotificationSettings>(getNotificationSettings());
  const [permissionStatus, setPermissionStatus] = useState(getNotificationPermissionStatus());
  const [isTestingNotif, setIsTestingNotif] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);

  React.useEffect(() => {
    const syncState = () => {
      setPermissionStatus(getNotificationPermissionStatus());
      setNotifSettings(getNotificationSettings());
    };
    window.addEventListener('focus', syncState);
    window.addEventListener('ascend-notification-settings-updated', syncState);
    return () => {
      window.removeEventListener('focus', syncState);
      window.removeEventListener('ascend-notification-settings-updated', syncState);
    };
  }, []);

  const isAgendaNotifActive = notifSettings.enabled && (notifSettings.agendaReminders || notifSettings.agendaPreCutoffReminder);
  const isHabitNotifActive = notifSettings.enabled && notifSettings.habitReminders === true;
  const isTargetNotifActive = notifSettings.enabled && notifSettings.targetReminders === true;

  const ensureBrowserPermissionOnToggle = async (enabling: boolean) => {
    if (!enabling) return;
    if (getNotificationPermissionStatus() === 'default') {
      const res = await requestNotificationPermission();
      setPermissionStatus(getNotificationPermissionStatus());
      if (res === 'denied') {
        setNotifFeedback('Izin notifikasi ditolak browser. Buka setelan situs peramban untuk mengizinkan.');
        setTimeout(() => setNotifFeedback(null), 4000);
      }
    }
  };

  const handleToggleAgendaNotification = () => {
    const nextVal = !isAgendaNotifActive;
    const saved = saveNotificationSettings({
      ...notifSettings,
      enabled: nextVal ? true : notifSettings.enabled,
      agendaReminders: nextVal,
      agendaPreCutoffReminder: nextVal,
    });
    setNotifSettings(saved);
  };

  const handleToggleHabitNotification = async () => {
    const nextVal = !isHabitNotifActive;
    const saved = saveNotificationSettings({
      ...notifSettings,
      enabled: nextVal ? true : notifSettings.enabled,
      habitReminders: nextVal,
    });
    setNotifSettings(saved);
    await ensureBrowserPermissionOnToggle(nextVal);
  };

  const handleToggleTargetNotification = async () => {
    const nextVal = !isTargetNotifActive;
    const saved = saveNotificationSettings({
      ...notifSettings,
      enabled: nextVal ? true : notifSettings.enabled,
      targetReminders: nextVal,
    });
    setNotifSettings(saved);
    await ensureBrowserPermissionOnToggle(nextVal);
  };

  const handleRequestPermission = async () => {
    if (!isWebNotificationSupported()) {
      setNotifFeedback(
        isIOSNotStandalone()
          ? 'Di iPhone/iPad, ketuk Bagikan lalu "Tambahkan ke Layar Utama" terlebih dahulu agar notifikasi aktif.'
          : 'Browser atau lingkungan ini belum mendukung Web Notification.'
      );
      setTimeout(() => setNotifFeedback(null), 5000);
      return;
    }
    const res = await requestNotificationPermission();
    setPermissionStatus(getNotificationPermissionStatus());
    setNotifSettings(getNotificationSettings());
    if (res === 'granted') {
      setNotifFeedback('Izin notifikasi perangkat aktif!');
      setTimeout(() => setNotifFeedback(null), 3500);
    } else if (res === 'denied') {
      setNotifFeedback('Izin notifikasi diblokir peramban. Aktifkan lewat ikon gembok/setelan situs browser Anda.');
      setTimeout(() => setNotifFeedback(null), 4500);
    }
  };

  const handleTestDeviceNotification = async () => {
    if (!isWebNotificationSupported()) {
      setNotifFeedback(
        isIOSNotStandalone()
          ? 'Tambahkan aplikasi ke Layar Utama iPhone/iPad agar notifikasi bisa dikirim.'
          : 'Browser ini belum mendukung Web Notification.'
      );
      setTimeout(() => setNotifFeedback(null), 5000);
      return;
    }

    setIsTestingNotif(true);
    setNotifFeedback(null);
    try {
      const ok = await sendTestNotification();
      const latestPerm = getNotificationPermissionStatus();
      setPermissionStatus(latestPerm);
      setNotifSettings(getNotificationSettings());
      if (ok) {
        setNotifFeedback('Notifikasi uji coba berhasil dikirim ke HP / Laptop Anda!');
      } else if (latestPerm === 'denied') {
        setNotifFeedback('Izin notifikasi diblokir browser. Buka Setelan Situs di browser Anda untuk mengizinkan.');
      } else {
        setNotifFeedback('Gagal mengirim notifikasi. Pastikan izin notifikasi perangkat telah disetujui.');
      }
    } catch (err: any) {
      setNotifFeedback(err?.message || 'Gagal mengirim notifikasi.');
    } finally {
      setIsTestingNotif(false);
      setTimeout(() => setNotifFeedback(null), 4500);
    }
  };

  const isAdmin = checkIsAdminUser(currentUser, userProfile);

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const daysInM = getDaysInMonth(selectedYear, selectedMonthIdx);
    const mName = `${MONTH_NAMES_ID[selectedMonthIdx]} ${selectedYear}`;

    onUpdateProfile({
      ...userProfile,
      name,
      greetingTitle: `Selamat Datang, ${name}`,
      greetingSubtitle,
      monthIndex: selectedMonthIdx,
      year: selectedYear,
      monthName: mName,
      totalDaysInMonth: daysInM,
      currencySymbol,
      streakDays: Number(streakDays) || 0,
    });

    setIsSavedRecently(true);
    setTimeout(() => setIsSavedRecently(false), 3000);
    onShowToast?.('Pengaturan berhasil diperbarui!');
  };

  return (
    <div className={`w-full min-h-[calc(100vh-80px)] pb-24 md:pb-16 animate-in fade-in duration-200 ${
      isLight ? 'bg-slate-50/60 text-slate-800' : 'bg-[#080E21] text-slate-100'
    }`}>
      {/* 1. HEADER ATAS (STREAMLINED & RINGKAS TANPA PANAH & SUBTITLE) */}
      <div className={`w-full relative overflow-hidden py-3.5 sm:py-4 px-4 sm:px-6 transition-colors duration-300 ${
        isLight
          ? 'bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-900 shadow-xs'
          : 'bg-gradient-to-r from-sky-500 via-indigo-600 to-cyan-500'
      }`}>
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
            {isAdmin ? 'Pengaturan Admin' : 'Pengaturan Pengguna'}
          </h1>
        </div>
      </div>

      {/* 2. DAFTAR KARTU PENGATURAN (MODEL KARTU RINGKAS, MAX-W-2XL) */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-3.5 pb-6">
        <form onSubmit={handleSave} className="space-y-2.5 sm:space-y-3">
          {/* 1. TEMA TAMPILAN APLIKASI */}
          <AccordionSection
            id="theme"
            isOpen={openSection === 'theme'}
            onToggle={() => toggleSection('theme')}
            title="Tema Tampilan Aplikasi"
            badge={
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                isLight
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-400/30'
              }`}>
                {isLight ? 'Mode Terang' : 'Mode Gelap'}
              </span>
            }
            isLight={isLight}
          >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                if (isLight && onToggleTheme) onToggleTheme();
              }}
              className={`p-4 rounded-2xl border flex items-center gap-3 transition-all cursor-pointer ${
                !isLight
                  ? 'bg-indigo-500/25 border-indigo-400 text-white shadow-md'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                <Moon className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">Mode Gelap</div>
                <div className="text-[10px] opacity-70">Standar malam hari & hemat baterai</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!isLight && onToggleTheme) onToggleTheme();
              }}
              className={`p-4 rounded-2xl border flex items-center gap-3 transition-all cursor-pointer ${
                isLight
                  ? 'bg-amber-500/20 border-amber-400 text-slate-900 shadow-md font-bold'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <Sun className="w-5 h-5 text-amber-500" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">Mode Terang</div>
                <div className="text-[10px] opacity-70">Kenyamanan siang hari</div>
              </div>
            </button>
          </div>
        </AccordionSection>

        {/* 2. PREFERENSI PERSONAL & JURNAL */}
        <AccordionSection
          id="preferences"
          isOpen={openSection === 'preferences'}
          onToggle={() => toggleSection('preferences')}
          title="Preferensi Personal & Jurnal"
          isLight={isLight}
        >
          <div className="space-y-4">
            {/* Nama Pengguna */}
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${isLight ? 'text-slate-700' : 'text-white/70'}`}>
                Nama Panggilan / Display Name
              </label>
              <div className="relative">
                <UserIcon className={`w-4 h-4 absolute left-3.5 top-3.5 ${isLight ? 'text-slate-400' : 'text-white/40'}`} />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama Anda"
                  className={`w-full text-sm pl-10 pr-3.5 py-2.5 rounded-xl outline-hidden transition-all border ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white'
                      : 'bg-black/30 border-white/15 text-white placeholder-white/30 focus:border-indigo-400 focus:bg-white/5'
                  }`}
                />
              </div>
            </div>

            {/* Mata Uang Jurnal */}
            <div className="pt-1">
              <label className={`block text-xs font-semibold mb-1.5 ${isLight ? 'text-slate-700' : 'text-white/70'}`}>
                Mata Uang Jurnal
              </label>
              <select
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                className={`w-full text-sm px-3.5 py-2.5 rounded-xl outline-hidden cursor-pointer border ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                    : 'bg-[#141829] border-white/15 text-white focus:border-indigo-400'
                }`}
              >
                <option value="Rp">Rp (IDR - Rupiah)</option>
                <option value="$">$ (USD - Dolar)</option>
                <option value="€">€ (EUR - Euro)</option>
                <option value="£">£ (GBP - Pound)</option>
                <option value="¥">¥ (JPY - Yen)</option>
              </select>
            </div>
          </div>
        </AccordionSection>

        {/* 3. NAVIGASI PERIODE JURNAL */}
        <AccordionSection
          id="period"
          isOpen={openSection === 'period'}
          onToggle={() => toggleSection('period')}
          title="Navigasi Periode Jurnal"
          badge={
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
              isLight ? 'bg-teal-100 text-teal-800 border-teal-300' : 'bg-teal-500/20 text-teal-300 border-teal-500/30'
            }`}>
              {MONTH_NAMES_ID[selectedMonthIdx]} {selectedYear}
            </span>
          }
          isLight={isLight}
        >
          <div className="space-y-4">
            <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.025] border-white/10'
            }`}>
              <div>
                <h4 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Pilih Bulan & Tahun Jurnal</h4>
                <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-white/50'}`}>Pindah periode jurnal untuk melihat data bulan lainnya</p>
              </div>

              {/* Pemilih Tanggal & Bulan */}
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 rounded-xl p-1 shadow-inner ${
                  isLight ? 'bg-white border border-slate-200 shadow-xs' : 'bg-[#0B1522] border border-slate-700/60'
                }`}>
                  <button 
                    type="button"
                    onClick={() => {
                      setSelectedMonthIdx((prev) => {
                        if (prev === 0) {
                          setSelectedYear((y) => y - 1);
                          return 11;
                        }
                        return prev - 1;
                      });
                    }}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isLight 
                        ? 'hover:bg-slate-100 text-slate-700' 
                        : 'hover:bg-white/10 text-slate-200'
                    }`}
                    title="Bulan Sebelumnya"
                    aria-label="Bulan Sebelumnya"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className={`text-xs font-bold px-2 min-w-[90px] text-center ${
                    isLight ? 'text-slate-800' : 'text-white'
                  }`}>
                    {MONTH_NAMES_ID[selectedMonthIdx]}
                  </span>

                  <button 
                    type="button"
                    onClick={() => {
                      setSelectedMonthIdx((prev) => {
                        if (prev === 11) {
                          setSelectedYear((y) => y + 1);
                          return 0;
                        }
                        return prev + 1;
                      });
                    }}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isLight 
                        ? 'hover:bg-slate-100 text-slate-700' 
                        : 'hover:bg-white/10 text-slate-200'
                    }`}
                    title="Bulan Berikutnya"
                    aria-label="Bulan Berikutnya"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Tombol Hari Ini */}
                <button 
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setSelectedMonthIdx(now.getMonth());
                    setSelectedYear(now.getFullYear());
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 border ${
                    isLight
                      ? 'text-teal-800 bg-teal-50 hover:bg-teal-100 border-teal-300'
                      : 'text-sky-200 bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/30 hover:text-white'
                  }`}
                  title="Setel ke Hari & Bulan Ini"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isLight ? 'text-teal-600' : 'text-sky-400'}`} />
                  <span>Hari Ini</span>
                </button>
              </div>
            </div>

            {/* Grid 12 Bulan Cepat */}
            <div>
              <label className={`block text-xs font-semibold mb-2 ${isLight ? 'text-slate-700' : 'text-white/70'}`}>
                Pilih Bulan Cepat
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {MONTH_NAMES_ID.map((monthName, idx) => (
                  <button
                    key={monthName}
                    type="button"
                    onClick={() => setSelectedMonthIdx(idx)}
                    className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-center ${
                      selectedMonthIdx === idx
                        ? 'bg-teal-500 text-slate-950 font-bold border-teal-400 shadow-sm'
                        : isLight
                          ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80'
                    }`}
                  >
                    {monthName.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {/* Pemilih Tahun */}
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${isLight ? 'text-slate-700' : 'text-white/70'}`}>
                Tahun Jurnal
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className={`w-full text-sm px-3.5 py-2.5 rounded-xl outline-hidden cursor-pointer border ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                    : 'bg-[#141829] border-white/15 text-white focus:border-indigo-400'
                }`}
              >
                {getYearOptions(userProfile.year || 2026).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </AccordionSection>

        {/* 4. LOGO & PINTASAN LAYAR (PWA) */}
        <AccordionSection
          id="pwa"
          isOpen={openSection === 'pwa'}
          onToggle={() => toggleSection('pwa')}
          title="Logo & Pintasan Layar (PWA)"
          badge={
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
              isLight
                ? 'text-sky-700 bg-sky-100 border-sky-300'
                : 'text-sky-300 bg-sky-500/15 border-sky-500/30'
            }`}>
              HD
            </span>
          }
          isLight={isLight}
        >
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AppLogo size="lg" theme={theme} />
                <div>
                  <h4 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Ascend Journal PWA
                  </h4>
                  <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-white/50'}`}>
                    Akses instan dari layar utama.
                  </p>
                </div>
              </div>
              
              {isInstallable ? (
                <button
                  type="button"
                  onClick={install}
                  className="w-full sm:w-auto text-xs font-bold px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-700/30 transition-all cursor-pointer"
                >
                  Pasang Sekarang
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowShortcutInfo(!showShortcutInfo)}
                  className={`w-full sm:w-auto text-xs font-semibold px-4 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-emerald-800 border-slate-300'
                      : 'bg-white/10 hover:bg-white/15 text-emerald-300 border-white/10'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>{showShortcutInfo ? 'Sembunyikan' : 'Petunjuk Pemasangan'}</span>
                </button>
              )}
            </div>

            {showShortcutInfo && (
              <div className={`p-3 rounded-xl border text-xs ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-black/40 border-white/10 text-white/80'
              }`}>
                <p className={`font-medium leading-relaxed ${isLight ? 'text-sky-800' : 'text-sky-300'}`}>
                  Buka menu browser (titik tiga ⋮ atau Bagikan), lalu pilih <strong>Tambahkan ke Layar Utama</strong>.
                </p>
              </div>
            )}
          </div>
        </AccordionSection>

        {/* 5. NOTIFIKASI & PENGINGAT PERANGKAT */}
        <AccordionSection
          id="reminder"
          isOpen={openSection === 'reminder'}
          onToggle={() => toggleSection('reminder')}
          title="Notifikasi & Pengingat Perangkat"
          badge={
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold ${
              permissionStatus === 'granted'
                ? (isLight ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300')
                : permissionStatus === 'denied'
                ? (isLight ? 'bg-rose-100 border-rose-300 text-rose-800' : 'bg-rose-500/20 border-rose-500/30 text-rose-300')
                : (isLight ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-amber-500/20 border-amber-500/30 text-amber-300')
            }`}>
              {permissionStatus === 'granted' ? 'Izin Aktif' : permissionStatus === 'denied' ? 'Izin Diblokir' : 'Izin Belum Diberikan'}
            </span>
          }
          isLight={isLight}
        >
          <div className="space-y-4">
            {/* Status Izin & Banner Bantuan */}
            {permissionStatus !== 'granted' && (
              <div className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/25 text-amber-200'
              }`}>
                <div>
                  <h4 className="font-bold text-sm">Izin Notifikasi Resmi Browser / HP</h4>
                  <p className="mt-0.5 opacity-90">
                    {permissionStatus === 'denied'
                      ? 'Buka izin notifikasi peramban Anda.'
                      : 'Aktifkan izin notifikasi perangkat Anda.'}
                  </p>
                </div>
                {permissionStatus !== 'denied' && (
                  <button
                    type="button"
                    onClick={handleRequestPermission}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shrink-0 transition-colors cursor-pointer shadow-xs"
                  >
                    Izinkan Notifikasi Sekarang
                  </button>
                )}
              </div>
            )}

            {/* SAKELAR PENGINGAT AGENDA HARIAN */}
            <div className={`flex items-center justify-between gap-3 py-3 border-b ${
              isLight ? 'border-slate-100' : 'border-white/5'
            }`}>
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Pengingat Agenda &amp; Sebelum 22.00 (Dalam Aplikasi)
                  </h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    isAgendaNotifActive
                      ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                      : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                  }`}>
                    {isAgendaNotifActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleAgendaNotification}
                aria-label="Aktifkan pengingat agenda harian"
                className={`w-12 h-6 min-w-[48px] max-w-[48px] shrink-0 rounded-full transition-colors relative cursor-pointer focus:outline-none ${
                  isAgendaNotifActive ? 'bg-teal-500' : (isLight ? 'bg-slate-300' : 'bg-white/20')
                }`}
              >
                <span className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 left-0.5 transition-transform duration-200 ${
                  isAgendaNotifActive ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* SAKELAR PENGINGAT KEBIASAAN */}
            <div className={`flex items-center justify-between gap-3 py-3 border-b ${
              isLight ? 'border-slate-100' : 'border-white/5'
            }`}>
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Pengingat Kebiasaan &amp; Streak
                  </h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    isHabitNotifActive
                      ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                      : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                  }`}>
                    {isHabitNotifActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleHabitNotification}
                aria-label="Aktifkan pengingat kebiasaan"
                className={`w-12 h-6 min-w-[48px] max-w-[48px] shrink-0 rounded-full transition-colors relative cursor-pointer focus:outline-none ${
                  isHabitNotifActive ? 'bg-teal-500' : (isLight ? 'bg-slate-300' : 'bg-white/20')
                }`}
              >
                <span className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 left-0.5 transition-transform duration-200 ${
                  isHabitNotifActive ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* SAKELAR PENGINGAT TARGET */}
            <div className={`flex items-center justify-between gap-3 py-3 border-b ${
              isLight ? 'border-slate-100' : 'border-white/5'
            }`}>
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Pengingat Target &amp; Batas Hari
                  </h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    isTargetNotifActive
                      ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                      : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                  }`}>
                    {isTargetNotifActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleTargetNotification}
                aria-label="Aktifkan pengingat target"
                className={`w-12 h-6 min-w-[48px] max-w-[48px] shrink-0 rounded-full transition-colors relative cursor-pointer focus:outline-none ${
                  isTargetNotifActive ? 'bg-teal-500' : (isLight ? 'bg-slate-300' : 'bg-white/20')
                }`}
              >
                <span className={`w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 left-0.5 transition-transform duration-200 ${
                  isTargetNotifActive ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* Tombol Uji Notifikasi & Status Feedback */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs">
                {notifFeedback && (
                  <p className={`font-semibold ${isLight ? 'text-teal-700' : 'text-teal-300'}`}>
                    {notifFeedback}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleTestDeviceNotification}
                disabled={isTestingNotif}
                className={`w-full sm:w-auto text-xs font-semibold px-4 py-2.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                    : 'bg-white/10 hover:bg-white/15 text-white border-white/15'
                }`}
              >
                {isTestingNotif ? 'Mengirim Uji Coba...' : 'Uji Notifikasi Perangkat'}
              </button>
            </div>
          </div>
        </AccordionSection>

        {/* BINTANG & SARAN PENGALAMAN */}
        {onOpenFeedback && (
          <AccordionSection
            id="feedback"
            isOpen={openSection === 'feedback'}
            onToggle={() => toggleSection('feedback')}
            title="Bintang & Saran Pengalaman"
            badge={
              userProfile.feedback?.rating ? (
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold ${
                  isLight ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                }`}>
                  {userProfile.feedback.rating} / 5 Bintang
                </span>
              ) : undefined
            }
            isLight={isLight}
          >
            <div className="space-y-3 pt-1">
              <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-white/70'}`}>
                {userProfile.feedback?.submittedAt
                  ? 'Terima kasih telah memberikan penilaian. Anda dapat memperbarui bintang atau saran pengalaman kapan saja di sini.'
                  : 'Bagikan penilaian bintang dan saran Anda untuk membantu meningkatkan kualitas Ascend Journal.'}
              </p>
              <button
                type="button"
                onClick={onOpenFeedback}
                className={`w-full text-xs p-3.5 rounded-2xl flex items-center justify-center gap-2 font-semibold cursor-pointer border transition-all ${
                  isLight
                    ? 'text-amber-900 bg-amber-50 hover:bg-amber-100 border-amber-200'
                    : 'text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30'
                }`}
              >
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span>
                  {userProfile.feedback?.submittedAt ? 'Ubah Bintang & Saran Pengalaman' : 'Beri Bintang & Saran Pengalaman'}
                </span>
              </button>
            </div>
          </AccordionSection>
        )}

        {/* PEMBERITAHUAN KEAMANAN KHUSUS */}
        <AccordionSection
          id="security-notice"
          isOpen={openSection === 'security-notice'}
          onToggle={() => toggleSection('security-notice')}
          icon={<ShieldAlert className="w-4 h-4" />}
          iconColorClass={isLight ? 'bg-red-100 text-red-600' : 'bg-red-500/20 text-red-400'}
          title="Pemberitahuan Keamanan"
          badge={
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold ${
              isLight ? 'bg-red-100 border-red-300 text-red-700' : 'bg-red-500/20 border-red-500/35 text-red-300'
            }`}>
              Penting
            </span>
          }
          isLight={isLight}
        >
          <div className={`p-4 rounded-2xl border space-y-2 ${
            isLight
              ? 'bg-red-50/90 border-red-200 text-red-900'
              : 'bg-red-500/10 border-red-500/30 text-red-100'
          }`}>
            <div className={`flex items-center gap-2 text-xs sm:text-sm font-bold ${
              isLight ? 'text-red-700' : 'text-red-300'
            }`}>
              <span>⚠️ Pemberitahuan Keamanan</span>
            </div>
            <p className={`text-xs leading-relaxed ${
              isLight ? 'text-red-900/90' : 'text-red-100/90'
            }`}>
              Aplikasi ini terikat secara eksklusif dengan akun pribadi Anda. Tautan atau link app dan masuk tidak untuk disebarluaskan akseskan. Jaga akun pribadi Anda demi kenyamanan akun Anda. akun anda akan diblokir apabila Anda menyebarluaskan link.
            </p>
          </div>
        </AccordionSection>

        {/* Tombol Simpan Utama Panjang di Bawah Halaman */}
        <div className="pt-2 pb-6">
          <button
            type="submit"
            onClick={handleSave}
            className={`w-full py-3.5 px-6 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base shadow-lg transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2.5 ${
              isSavedRecently
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : isLight
                  ? 'bg-gradient-to-r from-emerald-600 via-teal-700 to-emerald-800 hover:from-emerald-700 hover:to-teal-900 text-white shadow-emerald-900/20'
                  : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-600 text-white shadow-emerald-900/30'
            }`}
          >
            {isSavedRecently ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-white" />
                <span>Pengaturan Berhasil Disimpan</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Simpan Pengaturan</span>
              </>
            )}
          </button>
        </div>

      </form>
    </div>

      {/* SECURITY AUDIT MODAL */}
      <SecurityAuditModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        isSupabaseConfigured={isSupabaseConfigured}
        userEmail={currentUser?.email}
        userName={userProfile.name}
      />
    </div>
  );
};
