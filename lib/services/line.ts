import { supabaseAdmin } from '@/lib/supabase/server';

type LinePushMessage = {
  type: string;
  [key: string]: unknown;
};

export type LinePushContext = {
  companyId?: string | null;
  lineCustomerId?: string | null;
  recipientType?: 'USER' | 'GROUP' | 'ROOM' | 'UNKNOWN';
  source?: string | null;
};

type LinePushErrorKind = 'CONFIG' | 'VALIDATION' | 'NETWORK' | 'LINE_API';

const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';

async function persistLinePushError({
  lineRecipientId,
  messages,
  context,
  errorKind,
  errorMessage,
  httpStatus = null,
  responseBody = null,
  lineRequestId = null,
}: {
  lineRecipientId: string;
  messages: LinePushMessage[];
  context: LinePushContext;
  errorKind: LinePushErrorKind;
  errorMessage: string;
  httpStatus?: number | null;
  responseBody?: unknown;
  lineRequestId?: string | null;
}) {
  try {
    const { error } = await supabaseAdmin.from('line_api_error_logs').insert({
      company_id: context.companyId || null,
      line_customer_id: context.lineCustomerId || null,
      line_recipient_id: lineRecipientId,
      recipient_type: context.recipientType || 'UNKNOWN',
      source: context.source || null,
      endpoint: LINE_PUSH_ENDPOINT,
      message_types: messages.map((message) => String(message?.type || 'unknown')),
      http_status: httpStatus,
      error_kind: errorKind,
      error_message: errorMessage,
      response_body: responseBody,
      request_payload: { to: lineRecipientId, messages },
      line_request_id: lineRequestId,
    });

    if (error) console.error('บันทึก LINE API error log ไม่สำเร็จ:', error.message);
  } catch (error) {
    console.error('บันทึก LINE API error log ไม่สำเร็จ:', error);
  }
}

export async function pushLinePayload(lineUserId: string, messages: LinePushMessage[], context: LinePushContext = {}) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const safeMessages = Array.isArray(messages) ? messages : [];

  if (!token) {
    const errorMessage = 'ไม่ได้ตั้งค่า LINE token';
    await persistLinePushError({ lineRecipientId: lineUserId, messages: safeMessages, context, errorKind: 'CONFIG', errorMessage });
    throw new Error(errorMessage);
  }
  if (!lineUserId?.trim()) {
    const errorMessage = 'ไม่มี LINE recipient id';
    await persistLinePushError({ lineRecipientId: lineUserId || '', messages: safeMessages, context, errorKind: 'VALIDATION', errorMessage });
    throw new Error(errorMessage);
  }
  if (!safeMessages.length) {
    const errorMessage = 'ไม่มีข้อความสำหรับส่ง LINE';
    await persistLinePushError({ lineRecipientId: lineUserId, messages: safeMessages, context, errorKind: 'VALIDATION', errorMessage });
    throw new Error(errorMessage);
  }

  let res: Response;
  try {
    res = await fetch(LINE_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: lineUserId, messages: safeMessages }),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await persistLinePushError({
      lineRecipientId: lineUserId,
      messages: safeMessages,
      context,
      errorKind: 'NETWORK',
      errorMessage,
    });
    throw error;
  }

  if (!res.ok) {
    const rawResponseBody = await res.text().catch(() => '');
    let responseBody: unknown = rawResponseBody || null;
    try {
      if (rawResponseBody) responseBody = JSON.parse(rawResponseBody);
    } catch {
      // Keep the raw response text when LINE doesn't return JSON.
    }

    const data = responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)
      ? responseBody as Record<string, unknown>
      : null;
    const lineErrorMessage = typeof data?.message === 'string' ? data.message : '';
    const details = Array.isArray(data?.details) ? data.details : [];
    const detailText = details
      .map((detail) => {
        if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return '';
        const value = detail as Record<string, unknown>;
        return String(value.message || value.property || '');
      })
      .filter(Boolean)
      .join('; ');
    const detail = `${lineErrorMessage ? ` - ${lineErrorMessage}` : ''}${detailText ? ` (${detailText})` : ''}`;
    const errorMessage = `LINE push ผิดพลาด: ${res.status}${detail}`;

    await persistLinePushError({
      lineRecipientId: lineUserId,
      messages: safeMessages,
      context,
      errorKind: 'LINE_API',
      errorMessage,
      httpStatus: res.status,
      responseBody,
      lineRequestId: res.headers.get('x-line-request-id'),
    });

    throw new Error(errorMessage);
  }
}

export async function pushLineMessage(lineUserId: string, text: string, context: LinePushContext = {}) {
  await pushLinePayload(lineUserId, [{ type: 'text', text }], context);
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

export async function getLineGroupSummary(groupId: string): Promise<{ groupName?: string; pictureUrl?: string } | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !groupId) return null;

  const res = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as { groupName?: string; pictureUrl?: string };
}
