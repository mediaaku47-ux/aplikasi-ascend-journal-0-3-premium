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

  // API Route: Scan Struk Belanja / Receipt OCR dengan Gemini 4 Hydrogen
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
      const cleanBase64 = image.includes('base64,') ? image.split('base64,')[1] : image;
      const cleanMimeType = mimeType || 'image/jpeg';

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(503).json({
          success: false,
          error: 'Kunci API Gemini (GEMINI_API_KEY) belum dikonfigurasi di server.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          timeout: 25000,
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const promptText = `Anda adalah pakar pembaca struk kasir, nota belanja, dan tanda terima pembayaran otomatis (Receipt Scanner OCR).
Teliti foto struk belanja atau nota pembayaran ini dengan cermat dan ekstrak datanya:
- "amount": Total akhir / grand total pembayaran (angka numerik murni tanpa pemisah ribuan, contoh 72000). Abaikan uang tunai bayar / kembalian; ambil total tagihan/belanja yang dibayar.
- "description": Keterangan singkat nama toko dan barang utama, contoh "Karis Jaya Shop - Indomie & Fruit Tea".
- "category": Pilih tepat satu dari: "Makanan & Minuman", "Kebutuhan Sehari-hari", "Belanja", "Transportasi", "Tagihan & Utilitas", "Kesehatan", "Pendidikan", "Hiburan", "Lainnya".
- "date": Tanggal transaksi format YYYY-MM-DD jika terbaca jelas pada struk, atau string kosong "" jika tidak terbaca.
- "merchant": Nama toko/kasir/gerai.
- "items": Daftar maksimal 6 item barang yang dibeli beserta harganya jika terbaca.
- "rawTotalText": Teks nominal total asli yang tercetak pada struk (misal "Rp 72.000").
- "confidence": "high", "medium", atau "low".`;

      let lastError: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
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
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
          if (!parsedData.date) {
            parsedData.date = null;
          }

          return res.json({
            success: true,
            data: parsedData,
          });
        } catch (geminiError: any) {
          lastError = geminiError;
          const status = geminiError?.status || geminiError?.code;
          const isRetryable = status === 429 || (typeof status === 'number' && status >= 500) || !status;
          if (attempt < 2 && isRetryable) {
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
            continue;
          }
          break;
        }
      }

      const statusCode = Number(lastError?.status) || 502;
      let userError = 'Gagal menganalisis foto struk dengan AI.';
      if (statusCode === 403 || statusCode === 400) {
        userError = 'Konfigurasi kunci API Gemini belum valid. Periksa GEMINI_API_KEY pada pengaturan Secrets.';
      } else if (statusCode === 429) {
        userError = 'Permintaan AI sedang padat (batas kuota tercapai). Silakan coba sesaat lagi.';
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
