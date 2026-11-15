/**
 * voiceRecorder.ts
 * Utilitas perekaman suara dan Speech-to-Text (Transkripsi Suara)
 * Mendukung izin perangkat, perekaman audio (MediaRecorder), dan pengenalan suara instan bahasa Indonesia (Web Speech API).
 */

export interface VoiceRecordingResult {
  transcript: string;
  rawTranscript: string;
  audioUrl?: string;
  duration: number; // Dalam detik
}

export interface VoiceRecorderState {
  isRecording: boolean;
  duration: number;
  transcript: string;
  permissionStatus: 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';
  errorMessage: string | null;
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Deteksi dukungan browser
export function isAudioRecordingSupported(): boolean {
  return typeof window !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

let pendingPrimedMicPromise: Promise<{ stream: MediaStream | null; error: any }> | null = null;

/**
 * Panggil langsung di dalam event onClick tombol sebelum modal terbuka
 * agar dialog izin mikrofon resmi Google/Chrome langsung muncul tepat pada klik pengguna.
 */
export function primeMicrophoneStream(): void {
  if (!isAudioRecordingSupported()) return;
  if (pendingPrimedMicPromise) return;

  try {
    pendingPrimedMicPromise = navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => ({ stream, error: null }))
      .catch((error) => ({ stream: null, error }));
  } catch (error) {
    pendingPrimedMicPromise = Promise.resolve({ stream: null, error });
  }
}

export function clearPrimedMicrophoneStream(): void {
  const p = pendingPrimedMicPromise;
  pendingPrimedMicPromise = null;
  if (p) {
    p.then(({ stream }) => {
      if (stream) {
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
      }
    }).catch(() => {});
  }
}

/**
 * Controller Perekam Suara & Suara-ke-Teks
 */
export class VoiceRecorderController {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private speechRecognition: any = null;
  private timerInterval: any = null;
  private startTime: number = 0;

  private onStateChange: (state: Partial<VoiceRecorderState>) => void;
  private currentTranscript: string = '';
  private durationSeconds: number = 0;

  constructor(onStateChange: (state: Partial<VoiceRecorderState>) => void) {
    this.onStateChange = onStateChange;
  }

  /**
   * Cek status izin mikrofon saat ini (jika didukung Permissions API)
   */
  async checkPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
    if (!isAudioRecordingSupported()) return 'unsupported';

    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        return status.state; // 'granted' | 'denied' | 'prompt'
      }
    } catch {
      // Beberapa browser tidak mendukung query 'microphone'
    }
    return 'prompt';
  }

  /**
   * Mulai merekam suara dan mendengarkan kata-kata pengguna
   */
  async startRecording(initialTranscript: string = ''): Promise<boolean> {
    if (!isAudioRecordingSupported()) {
      clearPrimedMicrophoneStream();
      this.onStateChange({
        permissionStatus: 'unsupported',
        errorMessage: 'Peramban atau perangkat Anda belum mendukung perekaman audio mikrofon.',
      });
      return false;
    }

    this.onStateChange({
      permissionStatus: 'requesting',
      errorMessage: null,
    });

    this.currentTranscript = initialTranscript;
    this.durationSeconds = 0;
    this.audioChunks = [];

    // 1. Gunakan stream yang dipicu sinkron saat klik tombol, atau minta langsung ke browser
    try {
      if (pendingPrimedMicPromise) {
        const primedPromise = pendingPrimedMicPromise;
        pendingPrimedMicPromise = null;
        const primed = await primedPromise;
        if (primed.stream) {
          this.mediaStream = primed.stream;
        } else if (primed.error) {
          throw primed.error;
        }
      }

      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      this.onStateChange({
        permissionStatus: 'granted',
        errorMessage: null,
      });
    } catch (err: any) {
      console.warn('[VoiceRecorder] Gagal memperoleh izin mikrofon:', err);
      const rawMsg = String(err?.message || '').toLowerCase();
      let errorMsg = 'Izin mikrofon diblokir oleh pengaturan browser.';
      if (rawMsg.includes('permissions policy') || rawMsg.includes('feature policy')) {
        errorMsg = 'Akses mikrofon dibatasi oleh bingkai pratinjau. Buka langsung di tab Chrome penuh.';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Mikrofon sedang berstatus Diblokir di pengaturan browser Anda. Ubah izin Mikrofon menjadi Izinkan di ikon setelan/gembok sebelah alamat situs.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'Perangkat keras mikrofon tidak terdeteksi pada perangkat Anda.';
      } else if (err.name === 'NotReadableError') {
        errorMsg = 'Mikrofon sedang digunakan oleh aplikasi lain.';
      }

      this.onStateChange({
        permissionStatus: 'denied',
        errorMessage: errorMsg,
        isRecording: false,
      });
      return false;
    }

    // 2. Inisialisasi MediaRecorder untuk merekam suara asli
    try {
      let mimeType = '';
      const isIOS =
        typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const candidateTypes = isIOS
        ? ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm']
        : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];

      for (const type of candidateTypes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(250); // Simpan chunk tiap 250ms
    } catch (recorderErr) {
      console.warn('[VoiceRecorder] MediaRecorder tidak dapat diinisialisasi:', recorderErr);
      // Lanjutkan jika speech recognition masih bisa
    }

    // 3. Inisialisasi Speech Recognition untuk transkripsi real-time (Desktop/Laptop).
    // Pada HP (Android/iOS), menghindari akses ganda ke mikrofon menjaga hasil rekaman MediaRecorder tetap jernih
    // dan transkripsi otomatis diproses melalui endpoint AI saat selesai merekam.
    if (!isMobileDevice() && isSpeechRecognitionSupported()) {
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.lang = 'id-ID'; // Bahasa Indonesia
        this.speechRecognition.continuous = true;
        this.speechRecognition.interimResults = true;

        let accumulatedFinal = initialTranscript ? initialTranscript + ' ' : '';

        this.speechRecognition.onresult = (event: any) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcriptPiece = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              accumulatedFinal += transcriptPiece + ' ';
            } else {
              interimTranscript += transcriptPiece;
            }
          }

          const combined = (accumulatedFinal + interimTranscript).trim();
          this.currentTranscript = combined;
          this.onStateChange({ transcript: combined });
        };

        this.speechRecognition.onerror = (event: any) => {
          // Error non-fatal seperti 'no-speech' dibiarkan
          if (event.error !== 'no-speech') {
            console.warn('[VoiceRecorder] Speech recognition notice:', event.error);
          }
        };

        // Jika koneksi terputus saat masih merekam, sambungkan kembali
        this.speechRecognition.onend = () => {
          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            try {
              this.speechRecognition?.start();
            } catch {
              // Ignore restart error
            }
          }
        };

        this.speechRecognition.start();
      } catch (speechErr) {
        console.warn('[VoiceRecorder] SpeechRecognition error:', speechErr);
      }
    }

    // 4. Timer perekaman
    this.startTime = Date.now();
    this.timerInterval = setInterval(() => {
      this.durationSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      this.onStateChange({ duration: this.durationSeconds });
    }, 500);

    this.onStateChange({
      isRecording: true,
      duration: 0,
      transcript: this.currentTranscript,
      errorMessage: null,
    });

    return true;
  }

  /**
   * Hentikan perekaman dan kembalikan hasil audio & teks transkripsi
   */
  async stopRecording(): Promise<VoiceRecordingResult> {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Stop Speech Recognition
    if (this.speechRecognition) {
      try {
        this.speechRecognition.onend = null;
        this.speechRecognition.stop();
      } catch {
        // Ignore
      }
      this.speechRecognition = null;
    }

    const finalDuration = this.durationSeconds || Math.max(1, Math.floor((Date.now() - this.startTime) / 1000));

    // Stop MediaRecorder dan dapatkan audio Data URL
    let audioUrl: string | undefined = undefined;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        if (!this.mediaRecorder) return resolve();
        this.mediaRecorder.onstop = () => resolve();
        try {
          if (typeof this.mediaRecorder.requestData === 'function') {
            this.mediaRecorder.requestData();
          }
        } catch {
          // Ignore requestData error
        }
        try {
          this.mediaRecorder.stop();
        } catch {
          resolve();
        }
      });
    }

    // Konversi audio chunks menjadi data URL dengan MIME type akurat
    if (this.audioChunks.length > 0) {
      try {
        const chunkMime = this.audioChunks.find((c) => c.type)?.type;
        const mimeType = chunkMime || this.mediaRecorder?.mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        if (audioBlob.size > 0) {
          audioUrl = await blobToDataUrl(audioBlob);
        }
      } catch (e) {
        console.warn('[VoiceRecorder] Gagal mengonversi blob audio:', e);
      }
    }

    // Lepaskan stream perangkat agar indikator mikrofon mati
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.onStateChange({
      isRecording: false,
      duration: finalDuration,
    });

    const rawTranscript = this.currentTranscript.trim();
    const finalText = rawTranscript || `[Catatan Suara] Rekaman suara instan (${formatAudioDuration(finalDuration)})`;

    return {
      transcript: finalText,
      rawTranscript,
      audioUrl,
      duration: finalDuration,
    };
  }

  /**
   * Batalkan perekaman dan bersihkan seluruh stream
   */
  cancelRecording(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.speechRecognition) {
      try {
        this.speechRecognition.onend = null;
        this.speechRecognition.stop();
      } catch {
        // Ignore
      }
      this.speechRecognition = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Ignore
      }
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.audioChunks = [];
    this.currentTranscript = '';
    this.durationSeconds = 0;

    this.onStateChange({
      isRecording: false,
      duration: 0,
      transcript: '',
      errorMessage: null,
    });
  }
}

/**
 * Konversi audio blob ke data URL (base64) agar bisa disimpan permanen di localStorage / Supabase
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Format durasi audio (detik -> mm:ss)
 */
export function formatAudioDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface AITranscriptionResult {
  transcript: string;
  error?: string;
}

function encodeMonoWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

/**
 * Konversi data URL audio/webm atau audio/mp4 ke WAV mono 16kHz yang ringan dan didukung penuh seluruh model AI.
 */
async function convertDataUrlToWav16k(audioDataUrl: string): Promise<string> {
  if (typeof window === 'undefined') return audioDataUrl;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return audioDataUrl;

  let ctx: AudioContext | null = null;
  try {
    const resp = await fetch(audioDataUrl);
    const arrayBuffer = await resp.arrayBuffer();
    ctx = new AudioCtx();
    const decoded = await ctx.decodeAudioData(arrayBuffer);

    const targetRate = 16000;
    const duration = decoded.duration;
    // Batasi konversi WAV untuk durasi wajar (<= 90 detik) agar memori HP tetap ringan
    if (!duration || duration > 90) {
      return audioDataUrl;
    }

    const length = Math.max(1, Math.ceil(duration * targetRate));
    const offline = new OfflineAudioContext(1, length, targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    const channelData = rendered.getChannelData(0);
    const wavBlob = encodeMonoWav(channelData, targetRate);
    return await blobToDataUrl(wavBlob);
  } catch {
    return audioDataUrl;
  } finally {
    if (ctx && typeof ctx.close === 'function') {
      ctx.close().catch(() => {});
    }
  }
}

/**
 * Transkripsikan rekaman audio via endpoint AI server (/api/transcribe-audio)
 */
export async function transcribeAudioWithAI(audioDataUrl: string): Promise<AITranscriptionResult> {
  if (!audioDataUrl || !audioDataUrl.startsWith('data:')) {
    return { transcript: '', error: 'Data rekaman audio tidak valid.' };
  }

  const preparedAudio = await convertDataUrlToWav16k(audioDataUrl);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 40000);

  try {
    const response = await fetch('/api/transcribe-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ audio: preparedAudio }),
    });

    const rawText = await response.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch {
      return {
        transcript: '',
        error: `Server transkripsi suara belum merespons JSON valid (HTTP ${response.status}).`,
      };
    }

    if (!response.ok || !json?.success) {
      return {
        transcript: '',
        error: json?.error || `Gagal mentranskripsikan suara (HTTP ${response.status}).`,
      };
    }

    return {
      transcript: typeof json.transcript === 'string' ? json.transcript.trim() : '',
    };
  } catch (err: any) {
    console.warn('[VoiceRecorder] AI transcription failed:', err);
    if (err?.name === 'AbortError') {
      return { transcript: '', error: 'Waktu transkripsi AI habis (timeout). Coba ulangi.' };
    }
    return { transcript: '', error: 'Gagal menghubungi server transkripsi AI.' };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

