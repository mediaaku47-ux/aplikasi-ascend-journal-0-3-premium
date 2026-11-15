import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Check, 
  X, 
  AlertCircle, 
  Sparkles, 
  RefreshCw,
  FileText,
  ExternalLink,
  Loader2,
  Keyboard
} from 'lucide-react';
import { 
  VoiceRecorderController, 
  VoiceRecorderState, 
  formatAudioDuration,
  isMobileDevice,
  transcribeAudioWithAI,
  clearPrimedMicrophoneStream
} from '../utils/voiceRecorder';

interface VoiceNoteRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFinishSaveDirectly: (result: { text: string; audioUrl?: string; duration: number }) => void;
  onApplyToForm?: (transcript: string) => void;
  theme?: 'dark' | 'light';
  title?: string;
}

export const VoiceNoteRecorderModal: React.FC<VoiceNoteRecorderModalProps> = ({
  isOpen,
  onClose,
  onFinishSaveDirectly,
  onApplyToForm,
  theme = 'dark',
  title = 'Catatan Suara Instan',
}) => {
  const isLight = theme === 'light';

  const [recorderState, setRecorderState] = useState<VoiceRecorderState>({
    isRecording: false,
    duration: 0,
    transcript: '',
    permissionStatus: 'idle',
    errorMessage: null,
  });
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [pendingRecording, setPendingRecording] = useState<{
    audioUrl?: string;
    duration: number;
    fallbackTranscript: string;
    applyToFormOnly: boolean;
  } | null>(null);
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);
  const [keyboardText, setKeyboardText] = useState('');
  const keyboardTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isMobile = isMobileDevice();

  const controllerRef = useRef<VoiceRecorderController | null>(null);

  // Inisialisasi controller
  useEffect(() => {
    controllerRef.current = new VoiceRecorderController((updated) => {
      setRecorderState((prev) => ({ ...prev, ...updated }));
    });

    return () => {
      clearPrimedMicrophoneStream();
      controllerRef.current?.cancelRecording();
    };
  }, []);

  // Mulai merekam & minta izin mikrofon secara langsung saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      setIsTranscribing(false);
      setTranscribeError(null);
      setPendingRecording(null);
      setIsKeyboardMode(false);
      setKeyboardText('');
      setRecorderState({
        isRecording: false,
        duration: 0,
        transcript: '',
        permissionStatus: 'idle',
        errorMessage: null,
      });

      void handleStart();
    } else {
      setIsTranscribing(false);
      setTranscribeError(null);
      setPendingRecording(null);
      setIsKeyboardMode(false);
      setKeyboardText('');
      clearPrimedMicrophoneStream();
      controllerRef.current?.cancelRecording();
    }
  }, [isOpen]);

  const handleStart = async () => {
    if (!controllerRef.current) return;
    setIsKeyboardMode(false);
    setTranscribeError(null);
    setPendingRecording(null);
    await controllerRef.current.startRecording();
  };

  const handleSwitchToKeyboard = () => {
    clearPrimedMicrophoneStream();
    controllerRef.current?.cancelRecording();
    setIsKeyboardMode(true);
    window.setTimeout(() => {
      keyboardTextareaRef.current?.focus();
    }, 30);
  };

  const resolveFinalTranscript = async (
    rawTranscript: string,
    fallbackTranscript: string,
    audioUrl?: string
  ): Promise<{ text: string; error?: string }> => {
    if (rawTranscript) return { text: rawTranscript };
    if (!audioUrl) return { text: fallbackTranscript };

    setIsTranscribing(true);
    setTranscribeError(null);
    try {
      const res = await transcribeAudioWithAI(audioUrl);
      if (res.transcript) {
        setRecorderState((prev) => ({ ...prev, transcript: res.transcript }));
        return { text: res.transcript };
      }
      if (res.error) {
        return { text: fallbackTranscript, error: res.error };
      }
      return { text: fallbackTranscript };
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleFinishSave = async () => {
    if (isTranscribing) return;

    if (isKeyboardMode) {
      const clean = keyboardText.trim();
      if (!clean) return;
      onFinishSaveDirectly({
        text: clean,
        duration: 0,
      });
      onClose();
      return;
    }

    if (!controllerRef.current) return;

    if (pendingRecording) {
      onFinishSaveDirectly({
        text: pendingRecording.fallbackTranscript,
        audioUrl: pendingRecording.audioUrl,
        duration: pendingRecording.duration,
      });
      onClose();
      return;
    }

    const result = await controllerRef.current.stopRecording();
    const resolved = await resolveFinalTranscript(result.rawTranscript, result.transcript, result.audioUrl);

    if (resolved.error && result.audioUrl) {
      setTranscribeError(resolved.error);
      setPendingRecording({
        audioUrl: result.audioUrl,
        duration: result.duration,
        fallbackTranscript: resolved.text,
        applyToFormOnly: false,
      });
      return;
    }

    onFinishSaveDirectly({
      text: resolved.text,
      audioUrl: result.audioUrl,
      duration: result.duration,
    });
    onClose();
  };

  const handleApplyToFormOnly = async () => {
    if (isTranscribing) return;

    if (isKeyboardMode) {
      const clean = keyboardText.trim();
      if (clean && onApplyToForm) {
        onApplyToForm(clean);
      }
      onClose();
      return;
    }

    if (!controllerRef.current) return;

    if (pendingRecording) {
      if (onApplyToForm) {
        onApplyToForm(pendingRecording.fallbackTranscript);
      }
      onClose();
      return;
    }

    const result = await controllerRef.current.stopRecording();
    const resolved = await resolveFinalTranscript(result.rawTranscript, result.transcript, result.audioUrl);

    if (resolved.error && result.audioUrl) {
      setTranscribeError(resolved.error);
      setPendingRecording({
        audioUrl: result.audioUrl,
        duration: result.duration,
        fallbackTranscript: resolved.text,
        applyToFormOnly: true,
      });
      return;
    }

    if (onApplyToForm) {
      onApplyToForm(resolved.text);
    }
    onClose();
  };

  const handleRetryTranscription = async () => {
    if (!pendingRecording?.audioUrl || isTranscribing) return;
    const resolved = await resolveFinalTranscript('', pendingRecording.fallbackTranscript, pendingRecording.audioUrl);
    if (resolved.error) {
      setTranscribeError(resolved.error);
      return;
    }
    if (pendingRecording.applyToFormOnly && onApplyToForm) {
      onApplyToForm(resolved.text);
    } else {
      onFinishSaveDirectly({
        text: resolved.text,
        audioUrl: pendingRecording.audioUrl,
        duration: pendingRecording.duration,
      });
    }
    onClose();
  };

  const handleCancel = () => {
    if (isTranscribing) return;
    clearPrimedMicrophoneStream();
    controllerRef.current?.cancelRecording();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-lg rounded-[28px] border shadow-2xl overflow-hidden relative transition-all duration-300 ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-teal-900/10'
            : 'bg-[#0f172a] border-[#22334d] text-white shadow-cyan-950/40'
        }`}
      >
        {/* Glow Aksen Atas */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-teal-400 via-sky-500 to-indigo-500" />

        {/* Header Modal */}
        <div className={`p-5 sm:p-6 pb-4 border-b flex items-center justify-between ${
          isLight ? 'border-slate-100 bg-slate-50/60' : 'border-white/10 bg-white/[0.02]'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border shadow-xs ${
              recorderState.isRecording
                ? 'bg-rose-500/20 text-rose-500 border-rose-500/30 animate-pulse'
                : isLight
                ? 'bg-teal-50 border-teal-200 text-teal-700'
                : 'bg-teal-500/15 border-teal-500/30 text-teal-400'
            }`}>
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>{title}</span>
                {recorderState.isRecording && (
                  <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/30">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
                    Merekam
                  </span>
                )}
              </h3>
              <p className={`text-xs font-semibold ${isLight ? 'text-slate-500' : 'text-white/60'}`}>
                Bicara bebas tanpa mengetik, kata-kata Anda akan otomatis menjadi teks catatan.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            aria-label="Tutup perekam"
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              isLight ? 'hover:bg-slate-200/70 text-slate-500' : 'hover:bg-white/10 text-white/60'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Konten Utama */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* MODE FALLBACK: KETIK / DIKTE LEWAT KEYBOARD HP */}
          {isKeyboardMode && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5 text-teal-500">
                  <Keyboard className="w-4 h-4" />
                  <span>Ketik / Dikte lewat Keyboard HP</span>
                </span>
                <button
                  type="button"
                  onClick={handleStart}
                  className="text-[11px] font-semibold text-sky-500 hover:underline cursor-pointer"
                >
                  Coba Mikrofon Lagi
                </button>
              </div>
              <textarea
                ref={keyboardTextareaRef}
                autoFocus
                rows={4}
                value={keyboardText}
                onChange={(e) => setKeyboardText(e.target.value)}
                placeholder="Ketik catatan di sini atau ketuk ikon mikrofon pada keyboard HP Anda..."
                className={`w-full rounded-2xl p-3.5 text-xs leading-relaxed font-semibold border resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/40 ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                    : 'bg-black/30 border-white/15 text-white placeholder-white/40'
                }`}
              />
            </div>
          )}

          {/* KASUS 1: MIKROFON TERBLOKIR (PESAN RINGKAS 1 BARIS + OPSI KEYBOARD HP) */}
          {!isKeyboardMode && recorderState.permissionStatus === 'denied' && (
            <div className={`p-3.5 rounded-2xl border text-xs space-y-2.5 ${
              isLight ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            }`}>
              <p className="font-semibold leading-snug">
                {recorderState.errorMessage ||
                  'Izin mikrofon terblokir. Ketuk ikon gembok/setelan di sebelah alamat web (URL) atas, lalu pilih Izinkan Mikrofon.'}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSwitchToKeyboard}
                  className={`py-1.5 px-3 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                    isLight
                      ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
                      : 'bg-white/10 hover:bg-white/15 text-white border-white/20'
                  }`}
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>Ketik / Dikte lewat Keyboard HP</span>
                </button>
                <button
                  type="button"
                  onClick={handleStart}
                  className={`py-1.5 px-3 rounded-xl text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                    isLight
                      ? 'text-rose-700 hover:bg-rose-100'
                      : 'text-rose-300 hover:bg-rose-500/20'
                  }`}
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Coba Lagi</span>
                </button>
                {typeof window !== 'undefined' && window.self !== window.top && (
                  <a
                    href={window.location.origin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`py-1.5 px-3 rounded-xl text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                      isLight ? 'text-slate-600 hover:underline' : 'text-white/70 hover:underline'
                    }`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Tab Penuh</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* KASUS 2: PERANGKAT TIDAK MENDUKUNG */}
          {!isKeyboardMode && recorderState.permissionStatus === 'unsupported' && (
            <div className={`p-3.5 rounded-2xl border text-xs space-y-2.5 ${
              isLight ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            }`}>
              <p className="font-semibold leading-snug">
                Peramban ini tidak mendukung rekaman mikrofon langsung. Gunakan keyboard HP untuk mengetik atau mendikte catatan.
              </p>
              <button
                type="button"
                onClick={handleSwitchToKeyboard}
                className={`py-1.5 px-3 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                  isLight
                    ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
                    : 'bg-white/10 hover:bg-white/15 text-white border-white/20'
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>Ketik / Dikte lewat Keyboard HP</span>
              </button>
            </div>
          )}

          {/* KASUS 3: SEDANG MEREKAM ATAU MENUNGGU IZIN */}
          {!isKeyboardMode && recorderState.permissionStatus !== 'denied' && recorderState.permissionStatus !== 'unsupported' && (
            <div className="space-y-4">
              {/* Visualizer Gelombang & Timer */}
              <div className={`p-6 rounded-3xl border flex flex-col items-center justify-center gap-3 relative overflow-hidden transition-all ${
                isLight
                  ? 'bg-gradient-to-b from-teal-50/50 to-slate-50 border-teal-200/80'
                  : 'bg-gradient-to-b from-[#132035] to-[#0c1322] border-teal-500/25'
              }`}>
                {/* Efek Lingkaran Gelombang Suara Berdenyut */}
                <div className="relative flex items-center justify-center my-2">
                  {recorderState.isRecording && (
                    <>
                      <div className="absolute w-24 h-24 rounded-full bg-teal-500/20 animate-ping" />
                      <div className="absolute w-20 h-20 rounded-full bg-teal-500/30 animate-pulse" />
                    </>
                  )}
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-transform ${
                    recorderState.isRecording
                      ? 'bg-gradient-to-tr from-teal-500 to-sky-500 text-white scale-110'
                      : 'bg-slate-300 text-slate-600'
                  }`}>
                    <Mic className="w-7 h-7" />
                  </div>
                </div>

                {/* Durasi Waktu Rekaman */}
                <div className="text-center">
                  <span className="font-mono text-3xl font-black tracking-wider text-teal-600 dark:text-teal-400">
                    {formatAudioDuration(recorderState.duration)}
                  </span>
                  <p className={`text-xs font-semibold mt-1 ${isLight ? 'text-slate-500' : 'text-white/60'}`}>
                    {recorderState.isRecording
                      ? 'Bicaralah dengan jelas, sistem sedang merekam...'
                      : 'Menghubungkan ke mikrofon perangkat...'}
                  </p>
                </div>

                {/* Gelombang Visual Grafis Sederhana */}
                {recorderState.isRecording && (
                  <div className="flex items-center gap-1.5 h-6 mt-1">
                    {[40, 75, 90, 50, 100, 60, 85, 45, 95, 70, 55, 80].map((h, idx) => (
                      <span
                        key={idx}
                        className="w-1 bg-teal-500 rounded-full transition-all duration-150 animate-pulse"
                        style={{
                          height: `${Math.max(20, (h * (recorderState.duration % 2 === 0 ? 1 : 0.7)))}%`,
                          animationDelay: `${idx * 80}ms`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Teks Hasil Transkripsi Suara (Real-time Preview) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-teal-600 dark:text-teal-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Hasil Transkripsi Suara Anda:</span>
                  </span>
                  <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-white/50'}`}>
                    Bahasa Indonesia
                  </span>
                </div>

                <div className={`p-4 rounded-2xl border min-h-[90px] max-h-44 overflow-y-auto custom-scrollbar text-xs leading-relaxed font-semibold transition-all ${
                  isTranscribing
                    ? isLight
                      ? 'bg-teal-50/70 border-teal-200 text-teal-900'
                      : 'bg-teal-500/10 border-teal-500/30 text-teal-200'
                    : transcribeError
                    ? isLight
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    : recorderState.transcript
                    ? isLight
                      ? 'bg-white border-slate-300 text-slate-900 shadow-inner'
                      : 'bg-black/30 border-teal-500/30 text-white shadow-inner'
                    : isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-400 italic'
                    : 'bg-white/[0.02] border-white/10 text-white/40 italic'
                }`}>
                  {isTranscribing ? (
                    <div className="flex items-center gap-2 font-bold not-italic">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-500 shrink-0" />
                      <span>Mengubah rekaman suara menjadi teks...</span>
                    </div>
                  ) : transcribeError ? (
                    <div className="space-y-2 not-italic">
                      <div className="flex items-start gap-2 font-bold">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <span>{transcribeError}</span>
                      </div>
                      {pendingRecording?.audioUrl && (
                        <button
                          type="button"
                          onClick={handleRetryTranscription}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Coba Ubah ke Teks Lagi</span>
                        </button>
                      )}
                    </div>
                  ) : recorderState.transcript ? (
                    recorderState.transcript
                  ) : isMobile ? (
                    'Suara Anda sedang direkam jernih. Teks transkripsi akan muncul otomatis setelah menekan Selesai.'
                  ) : (
                    'Suara Anda akan otomatis muncul di sini saat Anda berbicara...'
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tombol Aksi */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isTranscribing}
              className={`px-4 py-3 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center disabled:opacity-40 ${
                isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-white/60 hover:bg-white/10'
              }`}
            >
              Batal
            </button>

            {onApplyToForm && (recorderState.transcript || (isKeyboardMode && keyboardText.trim())) && (
              <button
                type="button"
                onClick={handleApplyToFormOnly}
                disabled={isTranscribing}
                className={`px-4 py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                    : 'bg-white/10 hover:bg-white/15 text-white border-white/15'
                }`}
              >
                <FileText className="w-4 h-4 text-sky-400" />
                <span>Salin ke Form</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleFinishSave}
              disabled={
                isTranscribing ||
                (isKeyboardMode
                  ? !keyboardText.trim()
                  : recorderState.permissionStatus === 'denied' ||
                    recorderState.permissionStatus === 'unsupported')
              }
              className={`px-6 py-3 rounded-xl text-xs font-black transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2 text-white ${
                isLight
                  ? 'bg-[#003B2F] hover:bg-[#002e24] shadow-teal-900/20'
                  : 'bg-gradient-to-r from-teal-500 via-sky-500 to-indigo-600 hover:from-teal-400 hover:via-sky-400 hover:to-indigo-500 shadow-teal-500/20'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memproses Teks...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{pendingRecording ? 'Simpan Audio Saja' : 'Selesai & Buat Catatan'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
