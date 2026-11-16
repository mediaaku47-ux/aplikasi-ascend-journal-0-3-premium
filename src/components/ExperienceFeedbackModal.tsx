import React, { useState, useEffect } from 'react';
import { 
  Star, 
  MessageSquareHeart, 
  Check, 
  X 
} from 'lucide-react';
import { AppFeedback } from '../types';
import { triggerConfetti } from '../utils/confetti';

interface ExperienceFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFeedback?: AppFeedback;
  onSaveFeedback: (feedback: AppFeedback) => void;
  is24HourTrigger?: boolean;
  firstAppOpenAt?: string;
  accountCreatedAt?: string;
  onShowToast?: (msg: string) => void;
  theme?: 'dark' | 'light';
}

const RATING_DESCRIPTIONS: Record<number, { title: string; desc: string; emoji: string; color: string }> = {
  1: {
    title: 'Perlu Banyak Perbaikan',
    desc: 'Bantu kami mengetahui apa yang masih kurang agar kami dapat memperbaikinya.',
    emoji: '😞',
    color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
  },
  2: {
    title: 'Cukup',
    desc: 'Ada beberapa hal yang perlu ditingkatkan untuk pengalaman yang lebih baik.',
    emoji: '😐',
    color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  },
  3: {
    title: 'Bagus & Bermanfaat',
    desc: 'Aplikasi sudah berguna dan membantu kegiatan harian.',
    emoji: '🙂',
    color: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  },
  4: {
    title: 'Sangat Bagus',
    desc: 'Fitur-fiturnya sangat membantu produktivitas dan mudah digunakan.',
    emoji: '😊',
    color: 'text-teal-400 border-teal-500/30 bg-teal-500/10',
  },
  5: {
    title: 'Luar Biasa & Sangat Suka!',
    desc: 'Pengalaman penggunaan istimewa dan sangat direkomendasikan!',
    emoji: '🤩',
    color: 'text-amber-300 border-amber-400/40 bg-amber-400/15',
  },
};

export const ExperienceFeedbackModal: React.FC<ExperienceFeedbackModalProps> = ({
  isOpen,
  onClose,
  initialFeedback,
  onSaveFeedback,
  onShowToast,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const [rating, setRating] = useState<number>(initialFeedback?.rating || 5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<string>(initialFeedback?.suggestions || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialFeedback) {
        setRating(initialFeedback.rating || 5);
        setSuggestions(initialFeedback.suggestions || '');
      } else {
        setRating(5);
        setSuggestions('');
      }
      setIsSubmitting(false);
    }
  }, [isOpen, initialFeedback]);

  if (!isOpen) return null;

  const activeStar = hoverRating || rating;
  const currentDesc = RATING_DESCRIPTIONS[activeStar] || RATING_DESCRIPTIONS[5];

  const handleSelectStar = (num: number) => {
    setRating(num);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) return;

    setIsSubmitting(true);

    const newFeedback: AppFeedback = {
      rating,
      suggestions: suggestions.trim(),
      tags: initialFeedback?.tags || [],
      submittedAt: initialFeedback?.submittedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    triggerConfetti({
      particleCount: 45,
      spread: 70,
      colors: ['#f59e0b', '#38bdf8', '#10b981', '#ec4899'],
    });

    setTimeout(() => {
      onSaveFeedback(newFeedback);
      if (onShowToast) {
        onShowToast('Terima kasih banyak atas bintang dan saran Anda! 🙏');
      }
      setIsSubmitting(false);
      onClose();
    }, 300);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className={`w-full max-w-lg border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-900/15'
            : 'bg-[#0d1527]/95 border-white/15 text-white shadow-black/80'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`relative px-6 pt-6 pb-4 border-b ${
          isLight
            ? 'border-slate-200 bg-gradient-to-b from-amber-50 via-teal-50/40 to-white'
            : 'border-white/10 bg-gradient-to-b from-amber-500/10 via-sky-500/5 to-transparent'
        }`}>
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className={`absolute top-4 right-4 p-2 rounded-xl transition-colors cursor-pointer ${
              isLight ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-100' : 'text-white/50 hover:text-white hover:bg-white/10'
            }`}
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${
              isLight
                ? 'bg-amber-100 border-amber-300 text-amber-700 shadow-xs'
                : 'bg-gradient-to-tr from-amber-500/30 via-orange-500/20 to-sky-500/30 border-amber-400/40 text-amber-300 shadow-md shadow-amber-500/20'
            }`}>
              <Star className={`w-6 h-6 fill-amber-400 ${isLight ? 'text-amber-500' : 'text-amber-300'} animate-pulse`} />
            </div>
            <div>
              <h2 className={`text-lg sm:text-xl font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>
                Bintang & Saran Pengalaman
              </h2>
            </div>
          </div>
        </div>

        {/* Modal Body — Bintang & Saran digabung dalam satu tampilan */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
          {/* Big Interactive Star Rating */}
          <div className={`flex flex-col items-center justify-center py-4 rounded-2xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/10'
          }`}>
            <div className="flex items-center gap-2 sm:gap-3">
              {[1, 2, 3, 4, 5].map((starVal) => {
                const isFilled = starVal <= activeStar;
                return (
                  <button
                    key={starVal}
                    type="button"
                    onClick={() => handleSelectStar(starVal)}
                    onMouseEnter={() => setHoverRating(starVal)}
                    onMouseLeave={() => setHoverRating(null)}
                    className="p-1 sm:p-2 rounded-2xl transition-all duration-150 transform hover:scale-125 active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                    title={`Beri ${starVal} Bintang`}
                    aria-label={`${starVal} Bintang`}
                  >
                    <Star
                      className={`w-9 h-9 sm:w-10 sm:h-10 transition-all duration-200 ${
                        isFilled
                          ? 'fill-amber-400 text-amber-400 filter drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]'
                          : isLight
                          ? 'text-slate-300 hover:text-amber-400/60'
                          : 'text-white/20 hover:text-amber-400/50'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Star Feedback Label */}
            <div className="mt-3 text-center">
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs sm:text-sm font-semibold transition-all ${
                isLight ? 'bg-amber-50 border-amber-300 text-amber-900' : currentDesc.color
              }`}>
                <span className="text-base">{currentDesc.emoji}</span>
                <span>{activeStar} / 5 Bintang — {currentDesc.title}</span>
              </div>
              <p className={`text-xs max-w-sm mt-1.5 px-2 ${isLight ? 'text-slate-600' : 'text-white/50'}`}>
                {currentDesc.desc}
              </p>
            </div>
          </div>

          {/* Textarea for detailed suggestions */}
          <div className="space-y-2">
            <label className={`text-xs font-semibold flex items-center justify-between ${
              isLight ? 'text-slate-700' : 'text-white/80'
            }`}>
              <span className="flex items-center gap-1.5">
                <MessageSquareHeart className="w-3.5 h-3.5 text-amber-500" />
                <span>Tuliskan Saran & Masukan Anda:</span>
              </span>
              <span className={`text-[11px] font-normal ${isLight ? 'text-slate-500' : 'text-white/40'}`}>
                {suggestions.length} karakter
              </span>
            </label>
            <textarea
              value={suggestions}
              onChange={(e) => setSuggestions(e.target.value)}
              placeholder="Ceritakan pengalaman Anda, fitur yang paling disukai, atau masukan hal apa yang ingin ditambahkan ke aplikasi ini..."
              rows={3}
              className={`w-full px-3.5 py-3 rounded-2xl border text-xs sm:text-sm focus:outline-none focus:ring-1 transition-all custom-scrollbar resize-none leading-relaxed ${
                isLight
                  ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:ring-teal-500 focus:bg-white'
                  : 'bg-white/[0.04] border-white/15 text-white placeholder-white/30 focus:border-sky-400 focus:ring-sky-400'
              }`}
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-1 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                isLight
                  ? 'border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'border-white/10 text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              Nanti Saja
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-50"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Kirim Bintang & Saran'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
