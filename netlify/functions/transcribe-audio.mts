import { GoogleGenAI } from '@google/genai';

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
    const body = (await req.json().catch(() => ({}))) as { audio?: string; mimeType?: string };
    const { audio, mimeType } = body || {};

    if (!audio || typeof audio !== 'string') {
      return jsonResponse({ success: false, error: 'Data audio tidak ditemukan.' }, 400);
    }

    const headerMatch = audio.match(/^data:(audio\/[a-zA-Z0-9.+-]+)(?:;[^,]*)?;base64,/i);
    const cleanBase64 = audio.includes('base64,') ? audio.split('base64,')[1] : audio;
    const rawMime = String(mimeType || headerMatch?.[1] || 'audio/webm');
    const cleanMimeType = rawMime.split(';')[0].trim() || 'audio/webm';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return jsonResponse(
        { success: false, error: 'Kunci API Gemini (GEMINI_API_KEY) belum dikonfigurasi di server.' },
        503
      );
    }

    const promptText =
      'Transkripsikan seluruh ucapan dalam rekaman audio ini ke teks bahasa Indonesia (atau sesuai bahasa yang diucapkan) secara akurat dan rapi dengan tanda baca yang baik. Kembalikan HANYA teks hasil transkripsinya saja tanpa tanda kutip, label, atau penjelasan tambahan. Jika tidak terdengar ucapan sama sekali, kembalikan string kosong.';

    const modelCandidates = ['gemini-3.5-transcribe', 'gemini-3.1-flash-lite'];
    let lastError: any = null;

    for (const model of modelCandidates) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            timeout: 15000,
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
        return jsonResponse({ success: true, transcript }, 200);
      } catch (err: any) {
        lastError = err;
        const status = Number(err?.status || err?.code || 0);
        const msgLower = String(err?.message || '').toLowerCase();
        if (status === 401 || status === 403 || msgLower.includes('api_key') || msgLower.includes('api key')) {
          break;
        }
      }
    }

    return jsonResponse(
      {
        success: false,
        error: lastError?.message || 'Gagal mentranskripsikan rekaman suara.',
      },
      Number(lastError?.status) || 502
    );
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        error: err?.message || 'Gagal memproses rekaman audio.',
      },
      500
    );
  }
};
