import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Mendukung ukuran unggahan foto struk beresolusi tinggi (maks 25MB base64)
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // API Route: Migrasi Supabase
  app.post('/api/run-migration', async (req, res) => {
    try {
      const { connectionString, password } = req.body || {};
      const param = connectionString || password;
      const { runSupabaseMigration } = await import('./scripts/migrate.ts');
      const result = await runSupabaseMigration(param);
      res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Gagal menjalankan migrasi' });
    }
  });

  const VALID_CATEGORIES = [
    'Makanan & Minuman',
    'Kebutuhan Sehari-hari',
    'Belanja',
    'Transportasi',
    'Tagihan & Utilitas',
    'Kesehatan',
    'Pendidikan',
    'Hiburan',
    'Lainnya',
  ];

  const normalizeReceiptCategory = (rawCat: any): string => {
    const val = String(rawCat || '').trim();
    if (VALID_CATEGORIES.includes(val)) return val;
    const lower = val.toLowerCase();
    if (lower.includes('makan') || lower.includes('minum') || lower.includes('food') || lower.includes('drink') || lower.includes('cafe') || lower.includes('restoran')) return 'Makanan & Minuman';
    if (lower.includes('hari') || lower.includes('grocer') || lower.includes('mart') || lower.includes('supermarket') || lower.includes('kebutuhan')) return 'Kebutuhan Sehari-hari';
    if (lower.includes('belanja') || lower.includes('shop') || lower.includes('retail') || lower.includes('pakaian') || lower.includes('elektronik')) return 'Belanja';
    if (lower.includes('transport') || lower.includes('bensin') || lower.includes('ojek') || lower.includes('parkir') || lower.includes('tol') || lower.includes('travel')) return 'Transportasi';
    if (lower.includes('tagih') || lower.includes('listrik') || lower.includes('air') || lower.includes('internet') || lower.includes('pulsa') || lower.includes('utilit')) return 'Tagihan & Utilitas';
    if (lower.includes('sehat') || lower.includes('apotek') || lower.includes('obat') || lower.includes('klinik') || lower.includes('health') || lower.includes('medical')) return 'Kesehatan';
    if (lower.includes('didik') || lower.includes('buku') || lower.includes('kursus') || lower.includes('edu')) return 'Pendidikan';
    if (lower.includes('hibur') || lower.includes('bioskop') || lower.includes('game') || lower.includes('entertain')) return 'Hiburan';
    return 'Belanja';
  };

  // API Route: Scan Struk Belanja / Receipt OCR dengan Gemini AI
  app.post('/api/scan-receipt', async (req, res) => {
    try {
      const { image, mimeType } = req.body || {};

      if (!image || typeof image !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Foto struk tidak ditemukan. Silakan ambil atau unggah foto struk belanja Anda.',
        });
      }

      // Bersihkan format base64 jika membawa header data:image/*;base64,
      const headerMatch = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
      const cleanBase64 = image.includes('base64,') ? image.split('base64,')[1] : image;
      const cleanMimeType = mimeType || headerMatch?.[1] || 'image/jpeg';

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(503).json({
          success: false,
          error: 'Kunci API Gemini (GEMINI_API_KEY) belum dikonfigurasi di server.',
        });
      }

      const promptText = `Anda adalah pakar pembaca struk kasir, nota belanja, dan tanda terima pembayaran otomatis (Receipt Scanner OCR).
Teliti foto struk belanja atau nota pembayaran ini dengan cermat dan ekstrak datanya:
- "amount": Total akhir / grand total pembayaran dalam angka numerik murni tanpa pemisah ribuan (contoh: 72000). Abaikan uang tunai bayar / kembalian; ambil total tagihan/belanja yang dibayar.
- "description": Keterangan singkat nama toko dan barang utama dalam bahasa Indonesia, contoh "Alfamart - Air Mineral & Roti".
- "category": Pilih TEPAT SATU dari daftar berikut (harus sama persis): "Makanan & Minuman", "Kebutuhan Sehari-hari", "Belanja", "Transportasi", "Tagihan & Utilitas", "Kesehatan", "Pendidikan", "Hiburan", "Lainnya".
- "date": Tanggal transaksi format YYYY-MM-DD jika terbaca jelas pada struk, atau string kosong "" jika tidak terbaca.
- "merchant": Nama toko/kasir/gerai jika terbaca.
- "items": Daftar maksimal 6 item barang yang dibeli beserta harganya jika terbaca.
- "rawTotalText": Teks nominal total asli yang tercetak pada struk (misal "Rp 72.000").
- "confidence": "high", "medium", atau "low".`;

      const modelCandidates: Array<{ model: string; timeoutMs: number; thinkingLevel: ThinkingLevel }> = [
        { model: 'gemini-3.1-flash-lite', timeoutMs: 12000, thinkingLevel: ThinkingLevel.MINIMAL },
        { model: 'gemini-4-hydrogen', timeoutMs: 12000, thinkingLevel: ThinkingLevel.LOW },
      ];

      let lastError: any = null;
      for (const candidate of modelCandidates) {
        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              timeout: candidate.timeoutMs,
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const response = await ai.models.generateContent({
            model: candidate.model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
            config: {
              thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  amount: { type: Type.NUMBER, description: 'Total akhir pembayaran dalam angka murni.' },
                  description: { type: Type.STRING, description: 'Ringkasan nama toko dan barang utama.' },
                  category: { type: Type.STRING, description: 'Kategori pengeluaran paling sesuai.' },
                  date: { type: Type.STRING, description: 'Tanggal format YYYY-MM-DD atau kosong jika tidak terbaca.' },
                  merchant: { type: Type.STRING, description: 'Nama toko atau merchant.' },
                  items: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Daftar item barang yang terbaca.',
                  },
                  rawTotalText: { type: Type.STRING, description: 'Teks total asli seperti di struk.' },
                  confidence: { type: Type.STRING, description: 'Tingkat keyakinan: high, medium, atau low.' },
                },
              },
            },
          });

          const textOutput = (response.text ?? '').trim();
          if (!textOutput) {
            throw new Error('AI tidak mengembalikan hasil pembacaan struk.');
          }

          let parsedData: any;
          try {
            parsedData = JSON.parse(textOutput);
          } catch {
            const cleaned = textOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
            parsedData = JSON.parse(cleaned);
          }

          if (typeof parsedData.amount === 'string') {
            const num = parseFloat(parsedData.amount.replace(/[^0-9.]/g, ''));
            parsedData.amount = isNaN(num) ? 0 : num;
          }
          parsedData.category = normalizeReceiptCategory(parsedData.category);
          if (!parsedData.date) {
            parsedData.date = null;
          }

          return res.json({
            success: true,
            data: parsedData,
          });
        } catch (geminiError: any) {
          lastError = geminiError;
          const status = Number(geminiError?.status || geminiError?.code || 0);
          const msgLower = String(geminiError?.message || '').toLowerCase();
          const isKeyError =
            status === 401 ||
            status === 403 ||
            msgLower.includes('api_key') ||
            msgLower.includes('api key');
          if (isKeyError) {
            break;
          }
        }
      }

      const statusCode = Number(lastError?.status) || 502;
      const errMsgLower = String(lastError?.message || '').toLowerCase();
      const isApiKeyIssue =
        statusCode === 403 ||
        statusCode === 401 ||
        errMsgLower.includes('api_key') ||
        errMsgLower.includes('api key');

      let userError = 'Gagal menganalisis foto struk dengan AI.';
      if (isApiKeyIssue) {
        userError = 'Konfigurasi kunci API Gemini belum valid. Periksa GEMINI_API_KEY pada pengaturan Secrets.';
      } else if (statusCode === 429) {
        userError = 'Permintaan AI sedang padat (batas kuota tercapai). Silakan coba sesaat lagi.';
      } else if (statusCode === 503 || statusCode === 504) {
        userError = 'Server AI sedang sibuk atau lambat merespons. Silakan klik Pindai Ulang beberapa saat lagi.';
      } else if (lastError?.message) {
        userError = `Gagal menganalisis struk: ${lastError.message}`;
      }

      console.error('[scan-receipt] Gemini API error:', lastError?.message || lastError);
      return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 502).json({
        success: false,
        error: userError,
      });
    } catch (error: any) {
      console.error('Error scanning receipt:', error);
      return res.status(500).json({
        success: false,
        error: error?.message || 'Gagal memproses dan menganalisis foto struk.',
      });
    }
  });

  // API Route: Transkripsi Catatan Suara (Speech-to-Text fallback untuk HP / browser seluler)
  app.post('/api/transcribe-audio', async (req, res) => {
    try {
      const { audio, mimeType } = req.body || {};
      if (!audio || typeof audio !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Data audio tidak ditemukan.',
        });
      }

      const headerMatch = audio.match(/^data:((?:audio|video|application)\/[a-zA-Z0-9.+-]+)(?:;[^,]*)?;base64,/i);
      const cleanBase64 = audio.includes('base64,') ? audio.split('base64,')[1] : audio;
      const rawMime = String(mimeType || headerMatch?.[1] || 'audio/webm');
      // Gemini inlineData expects clean audio/* base MIME type without ';codecs=...'
      let cleanMimeType = rawMime.split(';')[0].trim().toLowerCase() || 'audio/webm';
      if (cleanMimeType.startsWith('video/')) {
        cleanMimeType = cleanMimeType.replace(/^video\//, 'audio/');
      } else if (!cleanMimeType.startsWith('audio/')) {
        cleanMimeType = 'audio/webm';
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(503).json({
          success: false,
          error: 'Kunci API Gemini (GEMINI_API_KEY) belum dikonfigurasi di server.',
        });
      }

      const promptText =
        'Dengarkan rekaman suara ini dengan saksama dan transkripsikan seluruh ucapan menjadi teks bahasa Indonesia (atau sesuai bahasa yang diucapkan) secara akurat dan rapi dengan tanda baca yang baik. Kembalikan HANYA teks hasil transkripsinya saja tanpa tanda kutip, label, atau penjelasan tambahan. Jika benar-benar hening tanpa ucapan, kembalikan string kosong.';

      const modelCandidates = ['gemini-3.5-transcribe', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
      let lastError: any = null;
      let anySuccessEmpty = false;

      for (const model of modelCandidates) {
        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              timeout: 12000,
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const response = await ai.models.generateContent({
            model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMimeType,
                    data: cleanBase64,
                  },
                },
                { text: promptText },
              ],
            },
          });

          const transcript = (response.text ?? '').trim();
          if (transcript) {
            return res.json({
              success: true,
              transcript,
            });
          }
          anySuccessEmpty = true;
        } catch (err: any) {
          lastError = err;
          const status = Number(err?.status || err?.code || 0);
          const msgLower = String(err?.message || '').toLowerCase();
          if (status === 401 || status === 403 || msgLower.includes('api_key') || msgLower.includes('api key')) {
            break;
          }
        }
      }

      if (anySuccessEmpty) {
        return res.json({
          success: true,
          transcript: '',
        });
      }

      console.error('[transcribe-audio] Gemini API error:', lastError?.message || lastError);
      return res.status(Number(lastError?.status) || 502).json({
        success: false,
        error: lastError?.message || 'Gagal mentranskripsikan rekaman suara.',
      });
    } catch (error: any) {
      console.error('Error transcribing audio:', error);
      return res.status(500).json({
        success: false,
        error: error?.message || 'Gagal memproses rekaman audio.',
      });
    }
  });

  // Route: Plain text robots.txt untuk search engine & crawler
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain; charset=utf-8').send(`User-agent: *
Allow: /

# Proteksi endpoint internal API
Disallow: /api/
`);
  });

  // Route: Plain text llms.txt untuk AI agents & crawlers
  app.get('/llms.txt', (_req, res) => {
    res.type('text/plain; charset=utf-8').send(`# Ascend Journal

> Ascend Journal adalah aplikasi web produktivitas harian komprehensif, pelacak kebiasaan (habit tracker), manajemen jadwal & agenda, pencatatan keuangan & tabungan, serta refleksi pertumbuhan diri.

## Modul & Fitur Utama

- [Dasbor Produktivitas](/): Ringkasan metrik harian, agenda aktif, dan tingkat konsistensi.
- [Agenda Harian](/): Manajemen tugas, prioritas jadwal, dan integrasi kalender interaktif.
- [Pelacak Kebiasaan](/): Pencatatan konsistensi kebiasaan dan penghitungan streak harian.
- [Manajemen Keuangan & Kas](/): Pencatatan kas masuk, keluar, tabungan, dan pembuatan kwitansi PDF serta OCR struk otomatis.
- [Target & Gol Hidup](/): Pelacakan sasaran jangka pendek dan jangka panjang dengan milestone terukur.
- [Catatan & Memo Cepat](/): Pencatatan ide instan dengan format refleksi terstruktur.
- [Arsip & Laporan Bulanan](/): Rekapitulasi perkembangan dan pengunduhan arsip laporan dokumen PDF.

## Spesifikasi & Infrastruktur

- Antarmuka: React 19, TypeScript, Tailwind CSS, Lucide Icons
- Sinkronisasi Cloud: Supabase (PostgreSQL, Realtime Channel, Auth)
- AI Scanner: Gemini API untuk ekstraksi data struk belanja kasir otomatis
`);
  });

  // Pastikan endpoint /api/* yang tidak ditemukan selalu mengembalikan JSON 404, bukan HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint API tidak ditemukan.' });
  });

  // Pastikan semua error middleware /api/* (seperti payload terlalu besar) selalu mengembalikan JSON, bukan HTML
  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    const message =
      status === 413
        ? 'Ukuran foto terlalu besar. Silakan kompres atau gunakan foto yang lebih ringan.'
        : err?.message || 'Terjadi kesalahan pada server API.';
    res.status(status).json({ success: false, error: message });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server aktif berjalan di http://0.0.0.0:${PORT}`);
  });
}

startServer();
