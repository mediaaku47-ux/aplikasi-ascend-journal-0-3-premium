import React, { useState, useRef, useEffect, useId } from 'react';
import { Play, Pause, Volume2, Mic } from 'lucide-react';
import { formatAudioDuration } from '../utils/voiceRecorder';

interface VoiceNotePlayerProps {
  audioUrl: string;
  duration?: number;
  isLight?: boolean;
}

function dataUrlToBlobUrl(dataUrl: string): { url: string; isObjectUrl: boolean } {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return { url: dataUrl, isObjectUrl: false };
  }
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return { url: dataUrl, isObjectUrl: false };
    const header = dataUrl.slice(5, commaIdx); // e.g. audio/webm;codecs=opus;base64
    const base64Data = dataUrl.slice(commaIdx + 1);
    const mimeRaw = header.split(';')[0] || 'audio/webm';
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeRaw });
    return { url: URL.createObjectURL(blob), isObjectUrl: true };
  } catch {
    return { url: dataUrl, isObjectUrl: false };
  }
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  audioUrl,
  duration = 0,
  isLight = false,
}) => {
  const playerId = useId();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [playbackSrc, setPlaybackSrc] = useState<string>('');
  const [playError, setPlayError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Konversi data URL ke Blob Object URL agar browser HP (Android & iOS) bisa memutar & seek dengan lancar
  useEffect(() => {
    const { url, isObjectUrl } = dataUrlToBlobUrl(audioUrl);
    setPlaybackSrc(url);
    setCurrentTime(0);
    setIsPlaying(false);
    setPlayError(null);
    setTotalDuration(duration);

    return () => {
      if (isObjectUrl) {
        URL.revokeObjectURL(url);
      }
    };
  }, [audioUrl, duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playbackSrc) return;

    audio.load();

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handleDurationUpdate = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setTotalDuration(audio.duration);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setPlayError(null);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      setIsPlaying(false);
      setPlayError('Format audio tidak didukung di perangkat ini.');
    };

    const handleOtherPlayerStart = (ev: Event) => {
      const customEv = ev as CustomEvent<string>;
      if (customEv.detail !== playerId && !audio.paused) {
        audio.pause();
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleDurationUpdate);
    audio.addEventListener('durationchange', handleDurationUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    window.addEventListener('ascend-voice-play', handleOtherPlayerStart);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleDurationUpdate);
      audio.removeEventListener('durationchange', handleDurationUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      window.removeEventListener('ascend-voice-play', handleOtherPlayerStart);
    };
  }, [playbackSrc, playerId]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !playbackSrc) return;

    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    setPlayError(null);
    window.dispatchEvent(new CustomEvent('ascend-voice-play', { detail: playerId }));

    if (audio.ended) {
      audio.currentTime = 0;
    }

    // Panggil audio.play() langsung secara sinkron dalam event tap pengguna (wajib untuk browser HP/iOS)
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.warn('Percobaan putar pertama gagal, memuat ulang audio:', err);
          try {
            audio.load();
            audio.play().then(() => setIsPlaying(true)).catch(() => {
              setIsPlaying(false);
              setPlayError('Audio gagal diputar di perangkat ini.');
            });
          } catch {
            setIsPlaying(false);
            setPlayError('Audio gagal diputar di perangkat ini.');
          }
        });
    } else {
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const effectiveDuration = totalDuration || duration || 1;
  const progressPercent = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`mt-2.5 p-2 sm:p-2.5 rounded-2xl border transition-all ${
        isLight
          ? 'bg-emerald-50/70 border-emerald-200/90 text-emerald-950'
          : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-100'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <audio ref={audioRef} src={playbackSrc || undefined} preload="auto" playsInline />

        {/* Tombol Play/Pause */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Jeda rekaman suara' : 'Putar rekaman suara'}
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer shadow-xs transition-transform active:scale-95 touch-manipulation ${
            isPlaying
              ? 'bg-rose-500 text-white hover:bg-rose-600'
              : isLight
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400'
          }`}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>

        {/* Baris Gelombang / Scrubber */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[10px] font-bold mb-1">
            <span className="flex items-center gap-1 font-mono">
              <Mic className="w-3 h-3 text-emerald-500" />
              <span>Catatan Suara</span>
            </span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">
              {formatAudioDuration(currentTime)} / {formatAudioDuration(totalDuration || duration)}
            </span>
          </div>

          <div className="relative w-full h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-emerald-500 rounded-full transition-all duration-100"
              style={{ width: `${progressPercent}%` }}
            />
            <input
              type="range"
              min="0"
              max={effectiveDuration}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              aria-label="Geser posisi audio"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
        </div>

        <Volume2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 hidden sm:block" />
      </div>

      {playError && (
        <p className="mt-1.5 text-[10px] font-semibold text-rose-500 pl-1">
          {playError}
        </p>
      )}
    </div>
  );
};
