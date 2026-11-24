import React, { useMemo, useState } from 'react';
import { CalendarEvent } from '../../types';
import {
  CATEGORY_LABEL_SUGGESTIONS,
  EVENT_COLOR_PALETTE,
  EventColorConfig,
  EventColorId,
  parseCalendarCategory,
  serializeCalendarCategory,
} from '../../lib/calendarCategories';

interface EventCalendarViewProps {
  events: CalendarEvent[];
  isLoading?: boolean;
  tableMissing?: boolean;
  onSaveEvent: (event: CalendarEvent) => Promise<{ ok: boolean; error?: string; tableMissing?: boolean }>;
  onDeleteEvent: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onToggleComplete: (id: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onShowToast?: (msg: string) => void;
  theme?: 'dark' | 'light';
}

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const WEEKDAY_NAMES_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const formatLocalIsoDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatReadableDateId = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt);
};

const CALENDAR_EVENTS_RLS_SQL = `-- Jalankan di Supabase SQL Editor untuk fitur Kalender Jadwal Acara (dengan RLS per user_id)
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  event_date DATE NOT NULL,
  event_time TEXT,
  category TEXT NOT NULL DEFAULT 'pribadi',
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date
  ON public.calendar_events(user_id, event_date);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own calendar events" ON public.calendar_events;
CREATE POLICY "Users can view own calendar events" ON public.calendar_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own calendar events" ON public.calendar_events;
CREATE POLICY "Users can insert own calendar events" ON public.calendar_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own calendar events" ON public.calendar_events;
CREATE POLICY "Users can update own calendar events" ON public.calendar_events
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own calendar events" ON public.calendar_events;
CREATE POLICY "Users can delete own calendar events" ON public.calendar_events
  FOR DELETE USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'calendar_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
  END IF;
END $$;`;

export const EventCalendarView: React.FC<EventCalendarViewProps> = ({
  events,
  isLoading = false,
  tableMissing = false,
  onSaveEvent,
  onDeleteEvent,
  onToggleComplete,
  onShowToast,
  theme = 'light',
}) => {
  const isLight = theme === 'light';
  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => formatLocalIsoDate(today), [today]);

  const [viewYear, setViewYear] = useState<number>(today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [agendaViewMode, setAgendaViewMode] = useState<'timeline' | 'selected'>('timeline');
  const [sqlCopied, setSqlCopied] = useState(false);

  // Modal Tambah / Edit Acara
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(todayIso);
  const [formTime, setFormTime] = useState('');
  const [formColor, setFormColor] = useState<EventColorId>('sky');
  const [formCategoryLabel, setFormCategoryLabel] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Konfirmasi hapus inline (tanpa window.confirm)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Kelompokkan acara per tanggal YYYY-MM-DD
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((ev) => {
      const key = (ev.date || '').slice(0, 10);
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (a.time || '99:99').localeCompare(b.time || '99:99');
      });
    });
    return map;
  }, [events]);

  // Susun 42 sel (6 minggu x 7 hari) atau 35 sel bila cukup untuk grid kalender bulanan
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstDayOfMonth.getDay(); // 0 (Min) - 6 (Sab)
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const totalCells = startWeekday + daysInMonth > 35 ? 42 : 35;

    const cells: Array<{
      isoDate: string;
      dayNumber: number;
      inCurrentMonth: boolean;
      isToday: boolean;
      isPast: boolean;
    }> = [];

    for (let i = 0; i < totalCells; i++) {
      const offset = i - startWeekday;
      const cellDate = new Date(viewYear, viewMonth, 1 + offset);
      const iso = formatLocalIsoDate(cellDate);
      cells.push({
        isoDate: iso,
        dayNumber: cellDate.getDate(),
        inCurrentMonth: cellDate.getMonth() === viewMonth && cellDate.getFullYear() === viewYear,
        isToday: iso === todayIso,
        isPast: iso < todayIso,
      });
    }
    return cells;
  }, [viewYear, viewMonth, todayIso]);

  const selectedDateEvents = useMemo(() => {
    return eventsByDate[selectedDate] || [];
  }, [eventsByDate, selectedDate]);

  const isSelectedDatePast = selectedDate < todayIso;

  // Grup tanggal kronologis (hanya tanggal yang memiliki agenda, urut dari paling awal/terdekat ke terbaru)
  const timelineDateGroups = useMemo(() => {
    const sortedDates = Object.keys(eventsByDate).sort((a, b) => a.localeCompare(b));
    return sortedDates.map((date) => {
      const items = eventsByDate[date] || [];
      const isPast = date < todayIso;
      const allCompleted = items.length > 0 && items.every((ev) => ev.completed);
      const isDone = isPast || allCompleted;
      return {
        date,
        events: items,
        isPast,
        isToday: date === todayIso,
        allCompleted,
        isDone,
      };
    });
  }, [eventsByDate, todayIso]);

  // Tanggal aktif terdekat yang belum lewat dan belum seluruhnya selesai
  const activeTimelineDate = useMemo(() => {
    const nextActive = timelineDateGroups.find((g) => !g.isDone);
    return nextActive ? nextActive.date : null;
  }, [timelineDateGroups]);

  // Daftar label & warna unik yang dipakai pengguna (untuk legenda dinamis & saran cepat)
  const usedLegendItems = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ key: string; dotClass: string; label: string }> = [];
    events.forEach((ev) => {
      const parsed = parseCalendarCategory(ev.category);
      const displayLabel = parsed.label || parsed.color.name;
      const key = `${parsed.colorId}::${displayLabel.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ key, dotClass: parsed.color.dotClass, label: displayLabel });
      }
    });
    return items.slice(0, 6);
  }, [events]);

  const labelSuggestions = useMemo(() => {
    const set = new Set<string>();
    events.forEach((ev) => {
      const parsed = parseCalendarCategory(ev.category);
      if (parsed.label) set.add(parsed.label);
    });
    CATEGORY_LABEL_SUGGESTIONS.forEach((item) => set.add(item));
    return Array.from(set);
  }, [events]);

  const matchingLabelSuggestions = useMemo(() => {
    const query = formCategoryLabel.trim().toLowerCase();
    if (!query) return [];
    return labelSuggestions
      .filter((item) => {
        const lower = item.toLowerCase();
        return lower.includes(query) && lower !== query;
      })
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(query) ? 0 : 1;
        return aStarts - bStarts;
      })
      .slice(0, 6);
  }, [formCategoryLabel, labelSuggestions]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const openAddModal = (targetDate?: string) => {
    setEditingEventId(null);
    setFormTitle('');
    setFormDate(targetDate || selectedDate || todayIso);
    setFormTime('');
    setFormColor('sky');
    setFormCategoryLabel('');
    setFormDescription('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (ev: CalendarEvent) => {
    const parsed = parseCalendarCategory(ev.category);
    setEditingEventId(ev.id);
    setFormTitle(ev.title);
    setFormDate((ev.date || todayIso).slice(0, 10));
    setFormTime(ev.time || '');
    setFormColor(parsed.colorId);
    setFormCategoryLabel(parsed.label);
    setFormDescription(ev.description || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = formTitle.trim();
    const cleanDate = formDate.trim();
    if (!cleanTitle) {
      setFormError('Judul acara wajib diisi.');
      return;
    }
    if (!cleanDate || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      setFormError('Tanggal acara wajib diisi.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const existing = editingEventId ? events.find((item) => item.id === editingEventId) : undefined;
    const payload: CalendarEvent = {
      id: editingEventId || `cal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: existing?.userId,
      title: cleanTitle,
      description: formDescription.trim(),
      date: cleanDate,
      time: formTime.trim() || undefined,
      category: serializeCalendarCategory(formColor, formCategoryLabel),
      completed: existing ? existing.completed : false,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await onSaveEvent(payload);
      if (!res.ok && !res.tableMissing) {
        setFormError(res.error || 'Gagal menyimpan acara.');
        setIsSaving(false);
        return;
      }

      // Sinkronkan bulan kalender & tanggal terpilih ke tanggal acara yang baru disimpan
      const [y, m] = formDate.split('-').map(Number);
      if (y && m) {
        setViewYear(y);
        setViewMonth(m - 1);
      }
      setSelectedDate(formDate);
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Terjadi kesalahan saat menyimpan acara.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteEvent(id);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(CALENDAR_EVENTS_RLS_SQL);
      setSqlCopied(true);
      onShowToast?.('SQL tabel calendar_events & RLS berhasil disalin.');
      setTimeout(() => setSqlCopied(false), 3000);
    } catch {
      onShowToast?.('Gagal menyalin SQL otomatis.');
    }
  };

  const cardClass = isLight
    ? 'bg-white border border-slate-300 shadow-[0_6px_24px_-4px_rgba(15,23,42,0.08)] text-slate-900'
    : 'bg-[#111827] border border-[#263449] shadow-lg text-white';

  const subtleSurface = isLight
    ? 'bg-slate-50 border-slate-300/80 text-slate-700'
    : 'bg-white/[0.03] border-white/10 text-slate-200';

  if (isLoading) {
    return (
      <div className="space-y-5 pb-28 md:pb-12 max-w-6xl mx-auto" aria-busy="true" aria-label="Memuat Kalender Jadwal Acara">
        {/* Header Skeleton */}
        <div className="space-y-2">
          <div className={`h-7 w-60 rounded-xl animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
          <div className={`h-4 w-72 rounded-lg animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/5'}`} />
        </div>

        {/* Filter Bar Skeleton */}
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`h-9 w-24 rounded-xl animate-pulse ${isLight ? 'bg-slate-200/80' : 'bg-white/10'}`} />
          ))}
        </div>

        {/* Grid + Panel Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-6 space-y-3">
            <div className={`h-12 w-full rounded-xl animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
            <div className={`rounded-xl p-5 space-y-4 ${cardClass}`}>
              <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-300/90' : 'border-white/10'}`}>
                <div className={`h-10 w-10 rounded-lg animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`h-5 w-28 rounded-lg animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
                  <div className={`h-3.5 w-14 rounded-md animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/5'}`} />
                </div>
                <div className={`h-10 w-10 rounded-lg animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
              </div>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-full h-[48px] sm:h-[58px] rounded-lg animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/[0.04]'}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className={`lg:col-span-6 rounded-xl p-5 space-y-3.5 ${cardClass}`}>
            <div className={`h-5 w-48 rounded-lg animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
            <div className={`h-4 w-32 rounded-lg animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/5'}`} />
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <div className={`h-4 w-14 mt-3 rounded-md animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/5'}`} />
                <div className={`flex-1 h-16 rounded-2xl animate-pulse ${isLight ? 'bg-slate-100' : 'bg-white/[0.05]'}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28 md:pb-12 max-w-6xl mx-auto">
      {/* 1. HEADER */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
              isLight
                ? 'bg-emerald-50 border-emerald-200 text-[#003B2F]'
                : 'bg-teal-500/15 border-teal-500/30 text-teal-300'
            }`}
          >
            {/* Inline SVG Calendar Icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="3" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <circle cx="8" cy="15" r="1" fill="currentColor" stroke="none" />
              <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
              <circle cx="16" cy="15" r="1" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Kalender Jadwal Acara
          </h1>
        </div>
        <p className={`text-xs sm:text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          Atur webinar, deadline penting, dan agenda pribadi Anda secara terstruktur.
        </p>
      </div>

      {/* Banner Non-blocking jika tabel Supabase belum dijalankan */}
      {tableMissing && (
        <div
          className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isLight
              ? 'bg-amber-50/90 border-amber-200 text-amber-950'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-100'
          }`}
        >
          <div className="flex items-start gap-3">
            {/* Inline SVG Alert Icon */}
            <svg className={`w-5 h-5 shrink-0 mt-0.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="space-y-0.5 text-xs leading-relaxed">
              <p className="font-bold">Tabel Cloud `calendar_events` Belum Dibuat di Supabase</p>
              <p className={isLight ? 'text-amber-800' : 'text-amber-200/85'}>
                Jadwal tetap tersimpan aman di perangkat ini, namun belum tersinkron ke cloud lintas perangkat sebelum tabel &amp; kebijakan RLS `user_id` dijalankan di Supabase SQL Editor.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopySql}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
              isLight
                ? 'bg-amber-900 hover:bg-amber-950 text-white'
                : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
            }`}
          >
            {/* Inline SVG Copy / Check */}
            {sqlCopied ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            <span>{sqlCopied ? 'SQL Tersalin' : 'Salin SQL Tabel & RLS'}</span>
          </button>
        </div>
      )}

      {/* 2. TATA LETAK UTAMA: KALENDER BULANAN COMPACT + AGENDA TIMELINE STEPPER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* KIRI: TOMBOL TAMBAH PANJANG DI ATAS KARTU KALENDER BULANAN */}
        <div className="lg:col-span-6 space-y-3">
          {/* Tombol Panjang Penuh di Atas Kalender */}
          <button
            type="button"
            onClick={() => openAddModal(selectedDate)}
            className={`w-full min-h-[48px] px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.99] shadow-sm ${
              isLight
                ? 'bg-[#003B2F] hover:bg-[#002e24] text-white'
                : 'bg-teal-400 hover:bg-teal-300 text-slate-950'
            }`}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="truncate">
              {isSelectedDatePast
                ? `Tambah Riwayat Acara (${formatReadableDateId(selectedDate)})`
                : `Tambah Acara (${formatReadableDateId(selectedDate)})`}
            </span>
          </button>

          <section className={`rounded-xl p-4 sm:p-6 ${cardClass}`}>
          {/* Navigasi Bulan Terpusat */}
          <div className={`flex items-center justify-between gap-2 pb-4 mb-4 border-b ${isLight ? 'border-slate-300/90' : 'border-white/10'}`}>
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Bulan sebelumnya"
              className={`min-h-[42px] min-w-[42px] rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                isLight
                  ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <div className="text-center flex flex-col items-center">
              <h2 className={`text-base sm:text-lg font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {MONTH_NAMES_ID[viewMonth]}
              </h2>
              <span className={`text-xs font-semibold tabular-nums ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {viewYear}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Bulan berikutnya"
              className={`min-h-[42px] min-w-[42px] rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                isLight
                  ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Header Hari (Min - Sab) */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2.5">
            {WEEKDAY_NAMES_ID.map((dayName, idx) => (
              <div
                key={dayName}
                className={`text-center text-[11px] font-bold tracking-wide py-1 ${
                  idx === 0
                    ? isLight
                      ? 'text-rose-600'
                      : 'text-rose-400'
                    : isLight
                      ? 'text-slate-500'
                      : 'text-slate-400'
                }`}
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Grid Tanggal Bulanan */}
          <div
            className="grid grid-cols-7 gap-1.5 sm:gap-2"
            onMouseLeave={() => setHoveredDate(null)}
          >
            {calendarCells.map((cell, index) => {
              const dayEvents = eventsByDate[cell.isoDate] || [];
              const isSelected = cell.isoDate === selectedDate;
              const hasEvents = dayEvents.length > 0;
              const colIndex = index % 7;

              // Tooltip pratinjau acara mengambang di atas kotak tanggal (saat hover atau tanggal terpilih punya acara)
              const activeTooltipDate = hoveredDate && (eventsByDate[hoveredDate]?.length ?? 0) > 0
                ? hoveredDate
                : selectedDate;
              const showFloatingTooltip = hasEvents && cell.isoDate === activeTooltipDate && !isModalOpen;

              // Warna garis bawah indikator unik pada tanggal ini (maks 3 garis)
              const uniqueColorConfigs: EventColorConfig[] = [];
              const seenColors = new Set<EventColorId>();
              dayEvents.forEach((ev) => {
                const parsed = parseCalendarCategory(ev.category);
                if (!seenColors.has(parsed.colorId) && uniqueColorConfigs.length < 3) {
                  seenColors.add(parsed.colorId);
                  uniqueColorConfigs.push(parsed.color);
                }
              });
              const allCompleted = hasEvents && dayEvents.every((ev) => ev.completed);

              // Posisi horizontal tooltip agar tidak terpotong di tepi kiri/kanan grid
              const tooltipHorizontalClass =
                colIndex <= 1
                  ? 'left-0'
                  : colIndex >= 5
                    ? 'right-0'
                    : 'left-1/2 -translate-x-1/2';

              const arrowHorizontalClass =
                colIndex <= 1
                  ? 'left-4'
                  : colIndex >= 5
                    ? 'right-4'
                    : 'left-1/2 -translate-x-1/2';

              return (
                <button
                  key={cell.isoDate}
                  type="button"
                  onClick={() => setSelectedDate(cell.isoDate)}
                  onMouseEnter={() => setHoveredDate(cell.isoDate)}
                  onFocus={() => setHoveredDate(cell.isoDate)}
                  onBlur={() => setHoveredDate(null)}
                  aria-label={`${cell.dayNumber} ${MONTH_NAMES_ID[viewMonth]} ${viewYear}${cell.isPast ? ', sudah lewat' : ''}${hasEvents ? `, ${dayEvents.length} acara` : ''}`}
                  aria-pressed={isSelected}
                  className={`w-full h-[48px] sm:h-[58px] rounded-lg flex flex-col items-center justify-center gap-1 transition-all cursor-pointer relative ${
                    isSelected
                      ? cell.isPast
                        ? isLight
                          ? 'bg-[#003B2F]/80 text-white shadow-sm'
                          : 'bg-teal-400/80 text-slate-950 shadow-sm'
                        : isLight
                          ? 'bg-[#003B2F] text-white shadow-md shadow-emerald-950/20'
                          : 'bg-teal-400 text-slate-950 shadow-md shadow-teal-500/20'
                      : !cell.inCurrentMonth
                        ? cell.isPast
                          ? isLight
                            ? 'bg-transparent text-slate-400/50 hover:bg-slate-100/50 hover:text-slate-600'
                            : 'bg-transparent text-slate-600/55 hover:bg-white/[0.03] hover:text-slate-400'
                          : isLight
                            ? 'bg-transparent text-slate-400/85 hover:bg-slate-100/70'
                            : 'bg-transparent text-slate-500 hover:bg-white/[0.04]'
                        : cell.isToday
                          ? isLight
                            ? 'bg-emerald-50/90 border border-emerald-600/60 text-[#003B2F] ring-1 ring-emerald-600/30 hover:bg-emerald-100/70'
                            : 'bg-teal-500/15 border border-teal-400/60 text-teal-300 ring-1 ring-teal-400/30 hover:bg-teal-500/20'
                          : cell.isPast
                            ? isLight
                              ? 'bg-slate-100/35 border border-slate-200/70 text-slate-400 hover:bg-slate-100/80 hover:text-slate-600'
                              : 'bg-white/[0.015] border border-white/5 text-slate-500 hover:bg-white/[0.05] hover:text-slate-300'
                            : isLight
                              ? 'bg-slate-100/75 border border-slate-300/90 text-slate-800 hover:bg-slate-200/70 hover:border-slate-400'
                              : 'bg-white/[0.04] border border-white/10 text-slate-200 hover:bg-white/[0.09] hover:border-white/20'
                  }`}
                >
                  {/* Tooltip Pratinjau Acara Mengambang */}
                  {showFloatingTooltip && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none hidden sm:flex items-center gap-1.5 absolute bottom-full mb-2 ${tooltipHorizontalClass} z-30 max-w-[210px] px-2.5 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap shadow-lg border ${
                        isLight
                          ? 'bg-white text-slate-800 border-slate-200/90 shadow-slate-900/10'
                          : 'bg-[#1a2438] text-slate-100 border-white/15 shadow-black/40'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          parseCalendarCategory(dayEvents[0].category).color.dotClass
                        }`}
                      />
                      <span className="truncate">{dayEvents[0].title}</span>
                      {dayEvents.length > 1 && (
                        <span className="text-[10px] font-bold shrink-0 text-slate-400">
                          +{dayEvents.length - 1}
                        </span>
                      )}
                      <span
                        className={`w-2 h-2 rotate-45 absolute -bottom-1 ${arrowHorizontalClass} border-r border-b ${
                          isLight
                            ? 'bg-white border-slate-200/90'
                            : 'bg-[#1a2438] border-white/15'
                        }`}
                      />
                    </span>
                  )}

                  {/* Angka Tanggal */}
                  <span
                    className={`text-[13px] sm:text-sm tabular-nums leading-none ${
                      isSelected || cell.isToday
                        ? 'font-extrabold'
                        : cell.inCurrentMonth && !cell.isPast
                          ? 'font-semibold'
                          : 'font-medium'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>

                  {/* Garis Warna Indikator Acara di Bawah Angka */}
                  {hasEvents && (
                    <span
                      className={`flex items-center justify-center gap-1 ${
                        allCompleted
                          ? 'opacity-50'
                          : cell.isPast && !isSelected
                            ? 'opacity-80'
                            : ''
                      }`}
                    >
                      {uniqueColorConfigs.map((colorCfg) => (
                        <span
                          key={colorCfg.id}
                          className={`h-[5px] sm:h-[6px] rounded-full transition-all ${
                            uniqueColorConfigs.length === 1
                              ? 'w-6 sm:w-8'
                              : uniqueColorConfigs.length === 2
                                ? 'w-3.5 sm:w-4'
                                : 'w-2.5 sm:w-3'
                          } ${
                            isSelected
                              ? isLight
                                ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]'
                                : 'bg-slate-950/85'
                              : colorCfg.dotClass
                          }`}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legenda Warna Fleksibel (Mengikuti Pilihan Pengguna) */}
          <div className={`mt-5 pt-3.5 border-t ${isLight ? 'border-slate-300/90' : 'border-white/10'} flex flex-wrap items-center justify-between gap-2 text-[11px]`}>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
              {usedLegendItems.length > 0 ? (
                usedLegendItems.map((item) => (
                  <div key={item.key} className="flex items-center gap-1.5">
                    <span className={`w-4 h-[5px] rounded-full ${item.dotClass}`} />
                    <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-300 font-medium'}>
                      {item.label}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1" aria-hidden="true">
                    {EVENT_COLOR_PALETTE.slice(0, 5).map((c) => (
                      <span key={c.id} className={`w-2.5 h-[5px] rounded-full ${c.dotClass}`} />
                    ))}
                  </span>
                  <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-300 font-medium'}>
                    Warna &amp; label bebas diatur per acara
                  </span>
                </div>
              )}
            </div>
            <span className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Tanggal redup = sudah lewat
            </span>
          </div>
          </section>
        </div>

        {/* KANAN: KARTU VERTICAL TIMELINE STEPPER & DETAIL TANGGAL */}
        <section className={`lg:col-span-6 rounded-xl p-4 sm:p-6 space-y-4 ${cardClass}`}>
          {/* Header Panel + Pengalih Tampilan */}
          <div className={`flex flex-col gap-3 pb-3.5 border-b ${isLight ? 'border-slate-300/90' : 'border-white/10'}`}>
            <div className="min-w-0">
              <h3 className={`text-base sm:text-lg font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {agendaViewMode === 'timeline' ? 'Timeline Agenda' : formatReadableDateId(selectedDate)}
              </h3>
              <div className="flex items-center gap-2 flex-wrap text-xs mt-0.5">
                {agendaViewMode === 'timeline' ? (
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>
                    {timelineDateGroups.length > 0
                      ? `${timelineDateGroups.length} tanggal terjadwal`
                      : 'Belum ada agenda terjadwal'}
                  </span>
                ) : (
                  <>
                    <span className={isLight ? 'text-emerald-800 font-semibold' : 'text-teal-300 font-semibold'}>
                      Tanggal Dipilih
                    </span>
                    {selectedDate === todayIso && (
                      <>
                        <span aria-hidden="true" className={isLight ? 'text-slate-400' : 'text-slate-500'}>·</span>
                        <span className={isLight ? 'text-emerald-700 font-semibold' : 'text-teal-300 font-semibold'}>Hari Ini</span>
                      </>
                    )}
                    {isSelectedDatePast && (
                      <>
                        <span aria-hidden="true" className={isLight ? 'text-slate-400' : 'text-slate-500'}>·</span>
                        <span className={`inline-flex items-center gap-1 font-semibold ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
                          <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span>Tanggal sudah lewat</span>
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Segmented Control Panjang Penuh: Timeline Stepper vs Agenda Hari Ini */}
            <div
              className={`w-full grid grid-cols-2 gap-1 p-1 rounded-lg border ${
                isLight ? 'bg-slate-100 border-slate-200' : 'bg-white/[0.04] border-white/10'
              }`}
            >
              <button
                type="button"
                onClick={() => setAgendaViewMode('timeline')}
                className={`w-full min-h-[36px] px-3 py-1.5 rounded-md text-xs font-bold flex items-center justify-center text-center transition-colors cursor-pointer whitespace-nowrap ${
                  agendaViewMode === 'timeline'
                    ? isLight
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'bg-sky-500/20 text-sky-300'
                    : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-white'
                }`}
              >
                Timeline
              </button>
              <button
                type="button"
                onClick={() => setAgendaViewMode('selected')}
                className={`w-full min-h-[36px] px-3 py-1.5 rounded-md text-xs font-bold flex items-center justify-center text-center transition-colors cursor-pointer whitespace-nowrap ${
                  agendaViewMode === 'selected'
                    ? isLight
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'bg-teal-400/20 text-teal-300'
                    : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-white'
                }`}
              >
                Agenda Hari Ini
              </button>
            </div>
          </div>

          {/* KONTEN MODE 1: VERTICAL TIMELINE STEPPER */}
          {agendaViewMode === 'timeline' ? (
            <div className="space-y-4">

              {timelineDateGroups.length === 0 ? (
                <div className={`p-6 rounded-xl border text-center space-y-3 ${subtleSurface}`}>
                  <div
                    className={`w-11 h-11 rounded-xl border mx-auto flex items-center justify-center ${
                      isLight
                        ? 'bg-white border-slate-200 text-slate-500'
                        : 'bg-white/5 border-white/10 text-slate-400'
                    }`}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="3" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <p className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>
                      Timeline Agenda Masih Kosong
                    </p>
                    <p className={`text-xs max-w-xs mx-auto ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Tambahkan jadwal acara pertama Anda untuk menampilkannya secara kronologis di timeline.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAddModal(selectedDate)}
                    className={`min-h-[40px] px-4 py-2 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                        : 'bg-white/10 border-white/15 text-white hover:bg-white/15'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Tambah Acara</span>
                  </button>
                </div>
              ) : (
                <div className="pt-1">
                  {timelineDateGroups.map((group, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === timelineDateGroups.length - 1;
                    const isActiveStep = group.date === activeTimelineDate;
                    const isCalendarSelected = group.date === selectedDate;

                    const railLineColor = isLight ? 'bg-sky-500/35' : 'bg-sky-400/30';

                    return (
                      <div key={group.date} className="flex items-stretch gap-3">
                        {/* Rel Kiri: Garis Vertikal Biru Tipis + Node Bulatan */}
                        <div className="w-6 shrink-0 relative flex justify-center">
                          {/* Garis biru atas (dari atas ke titik tengah node) */}
                          {!isFirst && (
                            <span
                              aria-hidden="true"
                              className={`absolute top-0 h-3.5 w-[2px] ${railLineColor}`}
                            />
                          )}
                          {/* Garis biru bawah (dari titik tengah node ke baris berikutnya) */}
                          {!isLast && (
                            <span
                              aria-hidden="true"
                              className={`absolute top-3.5 bottom-0 w-[2px] ${railLineColor}`}
                            />
                          )}

                          {/* Node Bulatan */}
                          <div className="h-7 flex items-center justify-center relative z-10">
                            {isActiveStep ? (
                              /* Bulatan ganda membesar: ring luar biru + titik solid biru di tengah */
                              <span
                                aria-label="Agenda aktif berikutnya"
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                                  isLight
                                    ? 'border-sky-600 bg-white ring-4 ring-sky-500/15'
                                    : 'border-sky-400 bg-[#111827] ring-4 ring-sky-400/20'
                                }`}
                              >
                                <span className={`w-2.5 h-2.5 rounded-full ${isLight ? 'bg-sky-600' : 'bg-sky-400'}`} />
                              </span>
                            ) : (
                              /* Bulatan kecil berongga */
                              <span
                                aria-hidden="true"
                                className={`w-3 h-3 rounded-full border-2 transition-all duration-200 ${
                                  group.isDone
                                    ? isLight
                                      ? 'border-sky-400/45 bg-white'
                                      : 'border-sky-400/35 bg-[#111827]'
                                    : isLight
                                      ? 'border-sky-500 bg-white'
                                      : 'border-sky-400 bg-[#111827]'
                                }`}
                              />
                            )}
                          </div>
                        </div>

                        {/* Konten Tanggal & Daftar Acara di Sisi Kanan */}
                        <div
                          className={`flex-1 min-w-0 ${isLast ? 'pb-1' : 'pb-6'} transition-opacity ${
                            group.isDone ? 'opacity-60' : ''
                          }`}
                        >
                          {/* Baris Header Tanggal */}
                          <div className="flex items-center justify-between gap-2 min-h-[28px] mb-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDate(group.date);
                                const [gy, gm] = group.date.split('-').map(Number);
                                if (gy && gm) {
                                  setViewYear(gy);
                                  setViewMonth(gm - 1);
                                }
                              }}
                              className="text-left group/date cursor-pointer flex items-center gap-2 flex-wrap min-w-0"
                            >
                              <span
                                className={`text-sm font-bold tracking-tight transition-colors tabular-nums ${
                                  isActiveStep
                                    ? isLight
                                      ? 'text-sky-700'
                                      : 'text-sky-300'
                                    : isCalendarSelected
                                      ? isLight
                                        ? 'text-[#003B2F]'
                                        : 'text-teal-300'
                                      : isLight
                                        ? 'text-slate-900 group-hover/date:text-sky-700'
                                        : 'text-white group-hover/date:text-sky-300'
                                }`}
                              >
                                {formatReadableDateId(group.date)}
                              </span>

                              {isActiveStep && (
                                <span className={`text-[11px] font-semibold ${isLight ? 'text-sky-600' : 'text-sky-400'}`}>
                                  · Berikutnya
                                </span>
                              )}
                              {!isActiveStep && group.isPast && (
                                <span className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                  · Sudah lewat
                                </span>
                              )}
                              {!isActiveStep && !group.isPast && group.allCompleted && (
                                <span className={`text-[11px] font-medium ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                                  · Selesai
                                </span>
                              )}
                            </button>
                          </div>

                          {/* Item Acara pada Tanggal Ini */}
                          <div className="space-y-2">
                            {group.events.map((ev) => {
                              const parsedCat = parseCalendarCategory(ev.category);
                              const cfg = parsedCat.color;
                              const isConfirmingDelete = confirmDeleteId === ev.id;
                              const itemDimmed = ev.completed || group.isPast;

                              return (
                                <div
                                  key={ev.id}
                                  className={`rounded-lg border p-3 transition-colors ${
                                    isLight ? cfg.lightCard : cfg.darkCard
                                  } ${ev.completed ? 'opacity-70' : group.isPast ? 'opacity-85' : ''}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                      {/* Tombol Centang Selesai */}
                                      <button
                                        type="button"
                                        onClick={() => onToggleComplete(ev.id)}
                                        aria-label={ev.completed ? `Tandai "${ev.title}" belum selesai` : `Tandai "${ev.title}" selesai`}
                                        className="min-w-[36px] min-h-[36px] -ml-1.5 -mt-1.5 flex items-center justify-center rounded-lg cursor-pointer shrink-0 group"
                                      >
                                        <span
                                          className={`w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center transition-colors ${
                                            ev.completed
                                              ? cfg.checkActiveClass
                                              : isLight
                                                ? cfg.checkIdleLight
                                                : cfg.checkIdleDark
                                          }`}
                                        >
                                          {ev.completed && (
                                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                              <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                          )}
                                        </span>
                                      </button>

                                      <div className="min-w-0 flex-1">
                                        <h4
                                          className={`text-sm font-bold leading-snug break-words ${
                                            ev.completed
                                              ? isLight
                                                ? 'line-through text-slate-500'
                                                : 'line-through text-slate-400'
                                              : itemDimmed
                                                ? isLight
                                                  ? 'text-slate-700'
                                                  : 'text-slate-200'
                                                : isLight
                                                  ? 'text-slate-900'
                                                  : 'text-white'
                                          }`}
                                        >
                                          {ev.title}
                                        </h4>

                                        <div className={`mt-1 flex items-center gap-1.5 flex-wrap text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                                          {parsedCat.label ? (
                                            <span className="inline-flex items-center gap-1.5 font-medium">
                                              <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
                                              <span>{parsedCat.label}</span>
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1.5 font-medium">
                                              <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
                                              <span>{cfg.name}</span>
                                            </span>
                                          )}

                                          {ev.time && (
                                            <>
                                              <span aria-hidden="true">·</span>
                                              <span className="inline-flex items-center gap-1 tabular-nums">
                                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                  <circle cx="12" cy="12" r="10" />
                                                  <polyline points="12 6 12 12 16 14" />
                                                </svg>
                                                <span>{ev.time}</span>
                                              </span>
                                            </>
                                          )}

                                          {ev.description && (
                                            <>
                                              <span aria-hidden="true">·</span>
                                              <span className="break-words">{ev.description}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {!isConfirmingDelete && (
                                      <div className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-1">
                                        <button
                                          type="button"
                                          onClick={() => openEditModal(ev)}
                                          aria-label={`Edit "${ev.title}"`}
                                          title="Edit acara"
                                          className={`min-w-[32px] min-h-[32px] rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                                            isLight
                                              ? 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                                              : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                          }`}
                                        >
                                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M12 20h9" />
                                            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
                                          </svg>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteId(ev.id)}
                                          aria-label={`Hapus "${ev.title}"`}
                                          title="Hapus acara"
                                          className={`min-w-[32px] min-h-[32px] rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                                            isLight
                                              ? 'text-slate-500 hover:bg-white/80 hover:text-rose-600'
                                              : 'text-slate-300 hover:bg-rose-500/20 hover:text-rose-200'
                                          }`}
                                        >
                                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                          </svg>
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {isConfirmingDelete && (
                                    <div className="mt-2.5 pt-2 border-t border-black/10 dark:border-white/15 flex items-center justify-end gap-2 flex-wrap">
                                      <span className={`text-xs font-semibold ${isLight ? 'text-rose-700' : 'text-rose-300'}`}>
                                        Hapus acara ini?
                                      </span>
                                      <button
                                        type="button"
                                        disabled={deletingId === ev.id}
                                        onClick={() => handleConfirmDelete(ev.id)}
                                        className="min-h-[32px] px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                                      >
                                        {deletingId === ev.id ? 'Menghapus...' : 'Ya, Hapus'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(null)}
                                        className={`min-h-[32px] px-2.5 py-1 rounded-md border text-xs font-semibold cursor-pointer ${
                                          isLight
                                            ? 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                                            : 'border-white/10 text-slate-300 hover:bg-white/10'
                                        }`}
                                      >
                                        Batal
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : selectedDateEvents.length === 0 ? (
            <div className={`p-6 rounded-xl border text-center space-y-3 ${subtleSurface}`}>
              <div
                className={`w-11 h-11 rounded-xl border mx-auto flex items-center justify-center ${
                  isLight
                    ? 'bg-white border-slate-200 text-slate-500'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="3" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div className="space-y-1">
                <p className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>
                  {isSelectedDatePast ? 'Tidak Ada Riwayat Acara' : 'Jadwal Masih Kosong'}
                </p>
                <p className={`text-xs max-w-xs mx-auto ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isSelectedDatePast
                    ? 'Tanggal ini sudah lewat dan belum memiliki catatan acara. Anda tetap bisa menambahkannya untuk riwayat.'
                    : 'Tambahkan webinar, deadline proyek, atau agenda pribadi untuk tanggal ini.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openAddModal(selectedDate)}
                className={`min-h-[42px] px-4 py-2 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                    : 'bg-white/10 border-white/15 text-white hover:bg-white/15'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Tambah Acara di Tanggal Ini</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {selectedDateEvents.map((ev) => {
                const parsedCat = parseCalendarCategory(ev.category);
                const cfg = parsedCat.color;
                const isConfirmingDelete = confirmDeleteId === ev.id;

                return (
                  <div
                    key={ev.id}
                    className={`rounded-xl border p-3 sm:p-3.5 transition-colors flex items-stretch gap-3 ${
                      isLight ? cfg.lightCard : cfg.darkCard
                    } ${ev.completed ? 'opacity-70' : ''}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`w-1 self-stretch rounded-full shrink-0 ${cfg.dotClass} ${ev.completed ? 'opacity-50' : ''}`}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => onToggleComplete(ev.id)}
                            aria-label={ev.completed ? `Tandai "${ev.title}" belum selesai` : `Tandai "${ev.title}" selesai`}
                            className="min-w-[40px] min-h-[40px] -ml-2 -mt-2 flex items-center justify-center rounded-xl cursor-pointer shrink-0 group"
                          >
                            <span
                              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                                ev.completed
                                  ? cfg.checkActiveClass
                                  : isLight
                                    ? cfg.checkIdleLight
                                    : cfg.checkIdleDark
                              }`}
                            >
                              {ev.completed && (
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </span>
                          </button>

                          <div className="min-w-0 flex-1">
                            <h4
                              className={`text-sm font-bold leading-snug break-words ${
                                ev.completed
                                  ? isLight
                                    ? 'line-through text-slate-500'
                                    : 'line-through text-slate-400'
                                  : isLight
                                    ? 'text-slate-900'
                                    : 'text-white'
                              }`}
                            >
                              {ev.title}
                            </h4>

                            <div className={`mt-1 flex items-center gap-1.5 flex-wrap text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                              {parsedCat.label && (
                                <>
                                  <span className="font-medium">{parsedCat.label}</span>
                                  <span aria-hidden="true">·</span>
                                </>
                              )}
                              <span className="inline-flex items-center gap-1 tabular-nums font-medium">
                                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                <span>{ev.time || 'Sepanjang hari'}</span>
                              </span>
                              {ev.description && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="break-words">{ev.description}</span>
                                </>
                              )}
                              {ev.completed && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">Selesai</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {!isConfirmingDelete && (
                          <div className="flex items-center gap-1 shrink-0 -mr-1 -mt-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(ev)}
                              aria-label={`Edit "${ev.title}"`}
                              title="Edit acara"
                              className={`min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                isLight
                                  ? 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                            </button>

                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(ev.id)}
                              aria-label={`Hapus "${ev.title}"`}
                              title="Hapus acara"
                              className={`min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                isLight
                                  ? 'text-slate-500 hover:bg-white/80 hover:text-rose-600'
                                  : 'text-slate-300 hover:bg-rose-500/20 hover:text-rose-200'
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>

                      {isConfirmingDelete && (
                        <div className="mt-2.5 pt-2 border-t border-black/10 dark:border-white/15 flex items-center justify-end gap-2 flex-wrap">
                          <span className={`text-xs font-semibold ${isLight ? 'text-rose-700' : 'text-rose-300'}`}>
                            Hapus acara ini?
                          </span>
                          <button
                            type="button"
                            disabled={deletingId === ev.id}
                            onClick={() => handleConfirmDelete(ev.id)}
                            className="min-h-[34px] px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                          >
                            {deletingId === ev.id ? 'Menghapus...' : 'Ya, Hapus'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                              isLight
                                ? 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                                : 'border-white/10 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            Batal
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* 4. MODAL TAMBAH / EDIT ACARA */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !isSaving && setIsModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-modal-title"
            onClick={(e) => e.stopPropagation()}
            className={`w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
              isLight
                ? 'bg-white border-slate-200 text-slate-900'
                : 'bg-[#111827] border-[#263449] text-white'
            }`}
          >
            {/* Header Modal */}
            <div
              className={`px-5 py-4 border-b flex items-center justify-between ${
                isLight ? 'border-slate-200 bg-slate-50/70' : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                    isLight
                      ? 'bg-emerald-50 border-emerald-200 text-[#003B2F]'
                      : 'bg-teal-500/15 border-teal-500/30 text-teal-300'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="3" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <h2 id="calendar-event-modal-title" className="text-base sm:text-lg font-extrabold">
                  {editingEventId ? 'Edit Jadwal Acara' : 'Tambah Jadwal Acara'}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => !isSaving && setIsModalOpen(false)}
                aria-label="Tutup"
                className={`min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                  isLight ? 'text-slate-500 hover:bg-slate-200/70' : 'text-slate-400 hover:bg-white/10'
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitForm} noValidate className="p-5 overflow-y-auto space-y-4">
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                  Judul Acara <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => {
                    setFormTitle(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="Contoh: Webinar Product Design / Deadline Laporan"
                  required
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border text-sm outline-hidden transition-colors ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#003B2F]'
                      : 'bg-white/5 border-white/15 text-white placeholder-slate-500 focus:border-teal-400'
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                    Tanggal <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => {
                      setFormDate(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    required
                    aria-invalid={Boolean(formError && !formDate.trim())}
                    className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border text-sm outline-hidden transition-colors ${
                      formError && !formDate.trim()
                        ? 'border-rose-500 bg-rose-50/40 dark:bg-rose-500/10'
                        : isLight
                          ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-[#003B2F]'
                          : 'bg-white/5 border-white/15 text-white focus:border-teal-400'
                    }`}
                  />
                  {formDate && formDate < todayIso && (
                    <p className={`mt-1.5 text-[11px] font-medium leading-snug ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
                      Tanggal ini sudah lewat — tetap dapat disimpan sebagai catatan riwayat.
                    </p>
                  )}
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                    Waktu (Opsional)
                  </label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border text-sm outline-hidden transition-colors ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-[#003B2F]'
                        : 'bg-white/5 border-white/15 text-white focus:border-teal-400'
                    }`}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className={`block text-xs font-bold mb-2 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                    Warna Kartu &amp; Penanda
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {EVENT_COLOR_PALETTE.map((colorOpt) => {
                      const isSelectedColor = formColor === colorOpt.id;
                      return (
                        <button
                          key={colorOpt.id}
                          type="button"
                          onClick={() => setFormColor(colorOpt.id)}
                          aria-label={`Pilih warna ${colorOpt.name}`}
                          aria-pressed={isSelectedColor}
                          title={colorOpt.name}
                          className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                            isSelectedColor
                              ? isLight
                                ? `${colorOpt.lightBadge} ring-2 ring-[#003B2F]/30 font-bold`
                                : `${colorOpt.darkBadge} ring-2 ring-teal-400/40 font-bold`
                              : isLight
                                ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.08]'
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center ${colorOpt.swatchClass}`}>
                            {isSelectedColor && (
                              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </span>
                          <span>{colorOpt.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                    Label Kategori <span className="font-normal opacity-70">(Opsional — bebas tulis sendiri)</span>
                  </label>
                  <input
                    type="text"
                    value={formCategoryLabel}
                    onChange={(e) => setFormCategoryLabel(e.target.value)}
                    placeholder="Contoh: Kuliah, Meeting, Keluarga, atau kosongkan..."
                    maxLength={32}
                    className={`w-full min-h-[42px] px-3.5 py-2 rounded-xl border text-sm outline-hidden transition-colors ${
                      isLight
                        ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#003B2F]'
                        : 'bg-white/5 border-white/15 text-white placeholder-slate-500 focus:border-teal-400'
                    }`}
                  />
                  {matchingLabelSuggestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {matchingLabelSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setFormCategoryLabel(suggestion)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                            isLight
                              ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                              : 'bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.08] hover:text-white'
                          }`}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                  Catatan / Tautan (Opsional)
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  placeholder="Tulis detail lokasi, link meeting, atau catatan penting..."
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-hidden resize-none transition-colors ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#003B2F]'
                      : 'bg-white/5 border-white/15 text-white placeholder-slate-500 focus:border-teal-400'
                  }`}
                />
              </div>

              {formError && (
                <div
                  role="alert"
                  className={`p-3 rounded-xl border text-xs font-semibold ${
                    isLight
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {formError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsModalOpen(false)}
                  className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                    isLight
                      ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'border-white/15 text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className={`min-h-[44px] px-5 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer disabled:opacity-60 transition-colors ${
                    isLight
                      ? 'bg-[#003B2F] hover:bg-[#002e24] text-white'
                      : 'bg-teal-400 hover:bg-teal-300 text-slate-950'
                  }`}
                >
                  {isSaving ? 'Menyimpan...' : editingEventId ? 'Simpan Perubahan' : 'Simpan Acara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
