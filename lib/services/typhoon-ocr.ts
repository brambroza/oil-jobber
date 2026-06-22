import { TyphoonOCRResponse } from '@/types/dto';

export async function callTyphoonOCR(base64Image: string): Promise<TyphoonOCRResponse> {
  const url = process.env.TYPHOON_OCR_API_URL;
  const key = process.env.TYPHOON_OCR_API_KEY;

  if (!url || !key) throw new Error('ไม่ได้ตั้งค่า Typhoon OCR API');

  const imageDataUrl = base64Image.startsWith('data:image/') ? base64Image : `data:image/jpeg;base64,${base64Image}`;
  const endpoint = url.endsWith('/chat/completions')
    ? url
    : `${url.replace(/\/ocr$/, '').replace(/\/$/, '')}/chat/completions`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'typhoon-ocr',
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                'ถอดข้อความจากภาพนี้แบบ OCR ตรงตามที่เห็น',
                'คืนเฉพาะข้อความ plain text เท่านั้น ห้ามคืน JSON, markdown, bullet, ตาราง, คำอธิบาย หรือคำแปล',
                'รักษาอักขระสำคัญ เช่น -, =, /, _, จุดทศนิยม และการขึ้นบรรทัดใหม่ให้ใกล้เคียงภาพที่สุด',
                'ถ้าเป็นข้อความราคา SFL/Cartex ให้รักษา token รหัสคลังพร้อมเครื่องหมาย เช่น -SPRC=, -SRC=, -SRB=, -BPI=, -LLK=, -PICHIT=, -LAMP=, -KKAEN= อย่าตัดทิ้ง',
                'ถ้าเป็น IRPC-PRICE หรือ BC-esso ให้รักษารหัสคลังและชุดราคาที่คั่นด้วย / ให้ครบ',
                'ถ้าเป็น Bangchak ให้รักษาข้อความในวงเล็บให้ถูกต้อง เช่น (PSP), (SRC), (Phichit), (SRB), (SUSR), (SK)',
                'อย่าแก้ไขหรือจัดรูปแบบข้อความให้เป็น schema ใหม่ เพราะระบบจะนำ raw text ไป parse ต่อ',
              ].join('\n'),
            },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  const text = await res.text();
  console.log("text" ,text);
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { message: text };
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('OCR ล้มเหลว: 401 API key ไม่ถูกต้อง/หมดอายุ/ไม่มีสิทธิ์ใช้ Typhoon OCR');
    }
    throw new Error(`OCR ล้มเหลว: ${res.status} ${parsed?.error?.message || parsed?.error || parsed?.message || ''}`.trim());
  }

  const rawText = String(parsed?.choices?.[0]?.message?.content ?? '')
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const lines = rawText.split('\n').map((v) => v.trim()).filter(Boolean);
  const items = lines.map((line: string) => {
    const [productCode, productName, price] = line.split(',').map((v) => v.trim());
    return { productCode: productCode || '', productName: productName || productCode || 'ไม่ระบุ', baseCostPrice: Number(price || 0) };
  }).filter((i) => i.productCode);

  return { rawText, items: items.length ? items : [] };
}
