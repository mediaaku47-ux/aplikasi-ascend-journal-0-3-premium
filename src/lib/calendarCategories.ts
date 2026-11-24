export type EventColorId =
  | 'sky'
  | 'rose'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'pink'
  | 'teal'
  | 'slate';

export interface EventColorConfig {
  id: EventColorId;
  name: string;
  dotClass: string;
  swatchClass: string;
  lightBadge: string;
  darkBadge: string;
  lightCard: string;
  darkCard: string;
  checkActiveClass: string;
  checkIdleLight: string;
  checkIdleDark: string;
}

export const EVENT_COLOR_PALETTE: EventColorConfig[] = [
  {
    id: 'sky',
    name: 'Biru',
    dotClass: 'bg-sky-500',
    swatchClass: 'bg-sky-500',
    lightBadge: 'bg-sky-50 text-sky-800 border-sky-200',
    darkBadge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    lightCard: 'bg-sky-50/90 border-sky-300/90 hover:bg-sky-100/75',
    darkCard: 'bg-sky-500/15 border-sky-400/35 hover:bg-sky-500/20',
    checkActiveClass: 'bg-sky-600 border-sky-600 text-white',
    checkIdleLight: 'border-sky-300 bg-white group-hover:border-sky-600',
    checkIdleDark: 'border-sky-400/50 bg-transparent group-hover:border-sky-400',
  },
  {
    id: 'rose',
    name: 'Merah',
    dotClass: 'bg-rose-500',
    swatchClass: 'bg-rose-500',
    lightBadge: 'bg-rose-50 text-rose-800 border-rose-200',
    darkBadge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    lightCard: 'bg-rose-50/90 border-rose-300/90 hover:bg-rose-100/75',
    darkCard: 'bg-rose-500/15 border-rose-400/35 hover:bg-rose-500/20',
    checkActiveClass: 'bg-rose-600 border-rose-600 text-white',
    checkIdleLight: 'border-rose-300 bg-white group-hover:border-rose-600',
    checkIdleDark: 'border-rose-400/50 bg-transparent group-hover:border-rose-400',
  },
  {
    id: 'emerald',
    name: 'Hijau',
    dotClass: 'bg-emerald-500',
    swatchClass: 'bg-emerald-500',
    lightBadge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    darkBadge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    lightCard: 'bg-emerald-50/90 border-emerald-300/90 hover:bg-emerald-100/75',
    darkCard: 'bg-emerald-500/15 border-emerald-400/35 hover:bg-emerald-500/20',
    checkActiveClass: 'bg-emerald-600 border-emerald-600 text-white',
    checkIdleLight: 'border-emerald-300 bg-white group-hover:border-emerald-600',
    checkIdleDark: 'border-emerald-400/50 bg-transparent group-hover:border-emerald-400',
  },
  {
    id: 'amber',
    name: 'Kuning',
    dotClass: 'bg-amber-500',
    swatchClass: 'bg-amber-500',
    lightBadge: 'bg-amber-50 text-amber-800 border-amber-200',
    darkBadge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    lightCard: 'bg-amber-50/90 border-amber-300/90 hover:bg-amber-100/75',
    darkCard: 'bg-amber-500/15 border-amber-400/35 hover:bg-amber-500/20',
    checkActiveClass: 'bg-amber-600 border-amber-600 text-white',
    checkIdleLight: 'border-amber-300 bg-white group-hover:border-amber-600',
    checkIdleDark: 'border-amber-400/50 bg-transparent group-hover:border-amber-400',
  },
  {
    id: 'violet',
    name: 'Ungu',
    dotClass: 'bg-violet-500',
    swatchClass: 'bg-violet-500',
    lightBadge: 'bg-violet-50 text-violet-800 border-violet-200',
    darkBadge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    lightCard: 'bg-violet-50/90 border-violet-300/90 hover:bg-violet-100/75',
    darkCard: 'bg-violet-500/15 border-violet-400/35 hover:bg-violet-500/20',
    checkActiveClass: 'bg-violet-600 border-violet-600 text-white',
    checkIdleLight: 'border-violet-300 bg-white group-hover:border-violet-600',
    checkIdleDark: 'border-violet-400/50 bg-transparent group-hover:border-violet-400',
  },
  {
    id: 'pink',
    name: 'Pink',
    dotClass: 'bg-pink-500',
    swatchClass: 'bg-pink-500',
    lightBadge: 'bg-pink-50 text-pink-800 border-pink-200',
    darkBadge: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
    lightCard: 'bg-pink-50/90 border-pink-300/90 hover:bg-pink-100/75',
    darkCard: 'bg-pink-500/15 border-pink-400/35 hover:bg-pink-500/20',
    checkActiveClass: 'bg-pink-600 border-pink-600 text-white',
    checkIdleLight: 'border-pink-300 bg-white group-hover:border-pink-600',
    checkIdleDark: 'border-pink-400/50 bg-transparent group-hover:border-pink-400',
  },
  {
    id: 'teal',
    name: 'Toska',
    dotClass: 'bg-teal-500',
    swatchClass: 'bg-teal-500',
    lightBadge: 'bg-teal-50 text-teal-800 border-teal-200',
    darkBadge: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    lightCard: 'bg-teal-50/90 border-teal-300/90 hover:bg-teal-100/75',
    darkCard: 'bg-teal-500/15 border-teal-400/35 hover:bg-teal-500/20',
    checkActiveClass: 'bg-teal-600 border-teal-600 text-white',
    checkIdleLight: 'border-teal-300 bg-white group-hover:border-teal-600',
    checkIdleDark: 'border-teal-400/50 bg-transparent group-hover:border-teal-400',
  },
  {
    id: 'slate',
    name: 'Netral',
    dotClass: 'bg-slate-500',
    swatchClass: 'bg-slate-500',
    lightBadge: 'bg-slate-100 text-slate-800 border-slate-300',
    darkBadge: 'bg-slate-500/20 text-slate-200 border-slate-400/30',
    lightCard: 'bg-slate-100/90 border-slate-300/90 hover:bg-slate-200/70',
    darkCard: 'bg-slate-500/15 border-slate-400/35 hover:bg-slate-500/20',
    checkActiveClass: 'bg-slate-600 border-slate-600 text-white',
    checkIdleLight: 'border-slate-300 bg-white group-hover:border-slate-600',
    checkIdleDark: 'border-slate-400/50 bg-transparent group-hover:border-slate-400',
  },
];

export const EVENT_COLOR_MAP: Record<EventColorId, EventColorConfig> = EVENT_COLOR_PALETTE.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<EventColorId, EventColorConfig>
);

const LEGACY_CATEGORY_MAP: Record<string, { colorId: EventColorId; label: string }> = {
  webinar: { colorId: 'sky', label: 'Webinar' },
  deadline: { colorId: 'rose', label: 'Deadline' },
  pribadi: { colorId: 'emerald', label: 'Pribadi' },
  kerja: { colorId: 'amber', label: 'Kerja' },
  lainnya: { colorId: 'violet', label: 'Lainnya' },
};

export const CATEGORY_LABEL_SUGGESTIONS = [
  'Pribadi',
  'Kerja',
  'Meeting',
  'Deadline',
  'Webinar',
  'Belajar',
];

export interface ParsedCalendarCategory {
  colorId: EventColorId;
  label: string;
  color: EventColorConfig;
}

export function parseCalendarCategory(raw?: string | null): ParsedCalendarCategory {
  const value = (raw || '').trim();
  if (!value) {
    return {
      colorId: 'sky',
      label: '',
      color: EVENT_COLOR_MAP.sky,
    };
  }

  const sepIdx = value.indexOf('::');
  if (sepIdx !== -1) {
    const maybeColor = value.slice(0, sepIdx).trim() as EventColorId;
    const customLabel = value.slice(sepIdx + 2).trim();
    const color = EVENT_COLOR_MAP[maybeColor] || EVENT_COLOR_MAP.sky;
    return {
      colorId: color.id,
      label: customLabel,
      color,
    };
  }

  const legacy = LEGACY_CATEGORY_MAP[value.toLowerCase()];
  if (legacy) {
    return {
      colorId: legacy.colorId,
      label: legacy.label,
      color: EVENT_COLOR_MAP[legacy.colorId],
    };
  }

  return {
    colorId: 'sky',
    label: value,
    color: EVENT_COLOR_MAP.sky,
  };
}

export function serializeCalendarCategory(colorId: EventColorId, label: string): string {
  const cleanLabel = label.replace(/::/g, ' ').trim();
  const safeColor = EVENT_COLOR_MAP[colorId] ? colorId : 'sky';
  return `${safeColor}::${cleanLabel}`;
}
