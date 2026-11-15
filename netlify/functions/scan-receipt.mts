import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

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

function normalizeReceiptCategory(rawCat: unknown): string {
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
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method tidak diizinkan.' }, 405);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { image?: string; mimeType?: string };
    const { image, mimeType } = body || {};

    if (!image || typeof image !== 'string') {
      return jsonResponse(
        {
          success: false,
          error: 'Foto struk tidak ditemukan. Silakan ambil atau unggah foto struk belanja Anda.',
        },
        400
      );
    }

    const headerMatch = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const cleanBase64 = image.includes('base64,') ? image.split('base64,')[1] : image;
    const cleanMimeType = mimeType || headerMatch?.[1] || 'image/jpeg';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return jsonResponse(
        {
          success: false,
          error: 'Kunci API Gemini (GEMINI_API_KEY) belum dikonfigurasi di server.',
        },
        503
      );
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

    const candidates: Array<{ model: string; timeoutMs: number; thinkingLevel: ThinkingLevel }> = [
      { model: 'gemini-3.1-flash-lite', timeoutMs: 15000, thinkingLevel: ThinkingLevel.MINIMAL },
      { model: 'gemini-4-hydrogen', timeoutMs: 15000, thinkingLevel: ThinkingLevel.LOW },
    ];

    let lastError: any = null;
    for (const candidate of candidates) {
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
                amount: { type: Type.NUMBER },
                description: { type: Type.STRING },
                category: { type: Type.STRING },
                date: { type: Type.STRING },
                merchant: { type: Type.STRING },
                items: { type: Type.ARRAY, items: { type: Type.STRING } },
                rawTotalText: { type: Type.STRING },
                confidence: { type: Type.STRING },
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

        return jsonResponse({ success: true, data: parsedData }, 200);
      } catch (err: any) {
        lastError = err;
        const status = Number(err?.status || err?.code || 0);
        const msgLower = String(err?.message || '').toLowerCase();
        if (status === 401 || status === 403 || msgLower.includes('api_key') || msgLower.includes('api key')) {
          break;
        }
      }
    }

    const statusCode = Number(lastError?.status) || 502;
    return jsonResponse(
      {
        success: false,
        error: lastError?.message || 'Gagal menganalisis foto struk dengan AI.',
      },
      statusCode >= 400 && statusCode < 600 ? statusCode : 502
    );
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        error: err?.message || 'Gagal memproses dan menganalisis foto struk.',
      },
      500
    );
  }
};
