type LinePushMessage = {
  type: string;
  [key: string]: unknown;
};

export async function pushLinePayload(lineUserId: string, messages: LinePushMessage[]) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('ไม่ได้ตั้งค่า LINE token');
  if (!messages.length) throw new Error('ไม่มีข้อความสำหรับส่ง LINE');
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: lineUserId, messages }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const data = await res.json();
      detail = data?.message ? ` - ${data.message}` : '';
      if (Array.isArray(data?.details) && data.details.length) {
        detail += ` (${data.details.map((d: any) => d.message || d.property || '').filter(Boolean).join('; ')})`;
      }
    } catch {
      const text = await res.text().catch(() => '');
      if (text) detail = ` - ${text}`;
    }
    throw new Error(`LINE push ผิดพลาด: ${res.status}${detail}`);
  }
}

export async function pushLineMessage(lineUserId: string, text: string) {
  await pushLinePayload(lineUserId, [{ type: 'text', text }]);
}

export async function getLineProfile(lineUserId: string): Promise<{ displayName?: string; pictureUrl?: string } | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;

  const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as { displayName?: string; pictureUrl?: string };
}
