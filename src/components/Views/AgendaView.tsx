import React, { useState, useMemo, useEffect } from 'react';
import { Task, UserProfile } from '../../types';
import { AgendaTable } from '../AgendaTable';
import { CheckSquare, Plus, CalendarClock, Archive, BellRing } from 'lucide-react';
import {
  getMonthClosingStatus,
  checkAndTriggerMonthClosingDeviceNotification,
  getNotificationPermissionStatus,
  requestNotificationPermission,
} from '../../utils/notifications';

interface AgendaViewProps {
  tasks: Task[];
  onUpdateTasks: (tasks: Task[]) => void | Promise<void>;
  onAddTask?: (task: Task) => void | Promise<void>;
  userProfile: UserProfile;
  onOpenNewEntry: () => void;
  onOpenCloseMonthModal?: () => void;
  onShowToast?: (msg: string) => void;
  theme?: 'dark' | 'light';
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  tasks,
  onUpdateTasks,
  onAddTask,
  userProfile,
  onOpenNewEntry,
  onOpenCloseMonthModal,
  onShowToast,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'flagged'>('all');
  const [notifPerm, setNotifPerm] = useState(() => getNotificationPermissionStatus());

  const monthClosing = useMemo(
    () => getMonthClosingStatus(userProfile.monthName, userProfile.monthIndex, userProfile.year, tasks),
    [userProfile.monthName, userProfile.monthIndex, userProfile.year, tasks]
  );

  // Picu notifikasi langsung ke HP/perangkat pengguna saat akhir bulan jika izin sudah aktif
  useEffect(() => {
    if (monthClosing.isEndOfMonth) {
      void checkAndTriggerMonthClosingDeviceNotification(
        userProfile.monthName,
        userProfile.monthIndex,
        userProfile.year,
        tasks
      );
    }
  }, [monthClosing.isEndOfMonth, userProfile.monthName, userProfile.monthIndex, userProfile.year, tasks]);

  const handleEnableDeviceNotif = async () => {
    const res = await requestNotificationPermission();
    setNotifPerm(getNotificationPermissionStatus());
    if (res === 'granted') {
      await checkAndTriggerMonthClosingDeviceNotification(
        userProfile.monthName,
        userProfile.monthIndex,
        userProfile.year,
        tasks,
        true
      );
      onShowToast?.('Notifikasi HP diaktifkan! Pengingat akhir bulan telah dikirim ke perangkat Anda.');
    } else {
      onShowToast?.('Izin notifikasi HP ditolak atau belum diaktifkan di pengaturan browser.');
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'all' || (filterType === 'flagged' && t.flagged);
    return matchesSearch && matchesFilter;
  });

  const handleUpdateTasks = async (newFilteredTasks: Task[]): Promise<void> => {
    if (filterType === 'all' && !searchQuery.trim()) {
      await onUpdateTasks(newFilteredTasks);
    } else {
      const updatedMap = new Map(newFilteredTasks.map((t) => [t.id, t]));
      const filteredIds = new Set(filteredTasks.map((t) => t.id));
      const existingIds = new Set(tasks.map((t) => t.id));
      const merged = tasks
        .filter((t) => !filteredIds.has(t.id) || updatedMap.has(t.id))
        .map((t) => updatedMap.get(t.id) || t);
      const newlyAdded = newFilteredTasks.filter((t) => !existingIds.has(t.id));
      await onUpdateTasks([...merged, ...newlyAdded]);
    }
  };

  return (
    <div className="space-y-6 pb-32 md:pb-14 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
        <div>
          <h2 className={`text-2xl font-black tracking-tight flex items-center gap-2 ${isLight ? 'text-slate-950' : 'text-white'}`}>
            <CheckSquare className="w-6 h-6 text-teal-500" />
            Agenda & Matriks Harian
          </h2>
          <p className={`text-sm mt-0.5 font-semibold ${isLight ? 'text-slate-700' : 'text-white/60'}`}>
            Kelola dan pantau seluruh agenda, rapat, dan tugas prioritas bulan {userProfile.monthName}.
          </p>
        </div>

        <button
          onClick={onOpenNewEntry}
          className={`w-full sm:w-auto justify-center ${
            isLight 
              ? 'bg-[#003B2F] hover:bg-[#002e24]' 
              : 'bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-500 hover:from-teal-700 hover:to-emerald-700'
          } text-white text-xs font-bold px-5 py-3 sm:py-2.5 rounded-2xl flex items-center gap-1.5 shadow-md shadow-teal-500/20 hover:shadow-lg transition-all cursor-pointer active:scale-95`}
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Agenda Baru</span>
        </button>
      </div>

      {/* Pemberitahuan Khusus Halaman Agenda: Peringatan Akhir Bulan / Bulan Akan Tutup */}
      {monthClosing.isEndOfMonth && (
        <div
          id="agenda-month-closing-notice"
          className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3.5 shadow-sm ${
            isLight
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-amber-500/10 border-amber-400/35 text-amber-100'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isLight ? 'bg-amber-500 text-white' : 'bg-amber-500/20 border border-amber-400/40 text-amber-300'
            }`}>
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-sm font-black ${isLight ? 'text-amber-950' : 'text-amber-200'}`}>
                {monthClosing.title}
              </h3>
              <p className={`text-xs font-medium mt-0.5 leading-relaxed ${isLight ? 'text-amber-900/90' : 'text-amber-100/80'}`}>
                {monthClosing.body}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {notifPerm !== 'granted' && notifPerm !== 'unsupported' && (
              <button
                type="button"
                onClick={handleEnableDeviceNotif}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                  isLight
                    ? 'bg-white border-amber-300 text-amber-900 hover:bg-amber-100'
                    : 'bg-white/5 border-amber-400/30 text-amber-200 hover:bg-white/10'
                }`}
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>Aktifkan Notif HP</span>
              </button>
            )}
            {onOpenCloseMonthModal && (
              <button
                type="button"
                onClick={onOpenCloseMonthModal}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm ${
                  isLight
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Tutup Bulan & Arsip PDF</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* The Core Table (with integrated Search & Filter inside Day Navigator Card) */}
      <AgendaTable
        tasks={filteredTasks}
        onUpdateTasks={handleUpdateTasks}
        onAddTask={onAddTask}
        monthName={userProfile.monthName}
        monthIndex={userProfile.monthIndex}
        year={userProfile.year}
        totalDaysInMonth={userProfile.totalDaysInMonth}
        onShowToast={onShowToast}
        theme={theme}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        totalTasksCount={tasks.length}
        flaggedTasksCount={tasks.filter((t) => t.flagged).length}
      />
    </div>
  );
};
