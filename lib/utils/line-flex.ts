/**
 * Pure helpers for showing stored LINE Flex messages in the dashboard.
 * Keyword sizes follow the LINE Flex Message spec. Payloads come from stored
 * JSON, so colors and URLs are validated before they reach the DOM.
 */

export type FlexNode = Record<string, unknown>;

const TEXT_SIZES: Record<string, number> = {
  xxs: 11, xs: 13, sm: 14, md: 16, lg: 19, xl: 22, xxl: 29, '3xl': 35, '4xl': 48, '5xl': 74,
};
const SPACING_SIZES: Record<string, number> = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };
const IMAGE_SIZES: Record<string, number> = {
  xxs: 40, xs: 60, sm: 80, md: 100, lg: 120, xl: 140, xxl: 160, '3xl': 180, '4xl': 200, '5xl': 240,
};
const BUBBLE_WIDTHS: Record<string, number> = {
  nano: 120, micro: 160, deca: 220, hecto: 241, kilo: 260, mega: 300, giga: 386,
};

const CSS_LENGTH = /^\d+(\.\d+)?(px|%)$/;
const HEX_COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const ASPECT_RATIO = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;

function resolveSize(value: unknown, keywords: Record<string, number>): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (CSS_LENGTH.test(value)) return value;
  return value in keywords ? `${keywords[value]}px` : undefined;
}

/** Font size in CSS for a text `size` keyword or length. */
export function flexTextSize(value: unknown): string | undefined {
  return resolveSize(value, TEXT_SIZES);
}

/** Margin, spacing or padding in CSS for a keyword or length. */
export function flexSpacing(value: unknown): string | undefined {
  return resolveSize(value, SPACING_SIZES);
}

/** Image width in CSS; `full` fills the parent. */
export function flexImageWidth(value: unknown): string {
  if (value === 'full') return '100%';
  return resolveSize(value, IMAGE_SIZES) ?? '100px';
}

/** Bubble width in px, defaulting to LINE's `mega`. */
export function flexBubbleWidth(value: unknown): number {
  return typeof value === 'string' && value in BUBBLE_WIDTHS ? BUBBLE_WIDTHS[value] : BUBBLE_WIDTHS.mega;
}

/** CSS `aspect-ratio` for a LINE `W:H` value. */
export function flexAspectRatio(value: unknown): string | undefined {
  const match = typeof value === 'string' ? ASPECT_RATIO.exec(value) : null;
  return match ? `${match[1]} / ${match[2]}` : undefined;
}

/** Returns the color only when it is a LINE hex color. */
export function flexColor(value: unknown): string | undefined {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : undefined;
}

/**
 * Accepts only http(s) URLs, which keeps `javascript:` and similar schemes out
 * of links and image sources.
 *
 * @param value - URL from a stored payload
 * @returns the URL, or null when it is not safe to use
 */
export function flexSafeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Finds the first Flex message in a push payload.
 *
 * @param messages - messages sent to LINE
 * @returns the Flex message, or null to store none
 */
export function pickFlexMessage(messages: unknown): FlexNode | null {
  if (!Array.isArray(messages)) return null;
  return messages.find((message) => message?.type === 'flex' && message?.contents) ?? null;
}

/**
 * Reads the bubble or carousel out of a stored message.
 *
 * @param payload - value of `line_messages.message_payload`
 * @returns the container, or null when the row must fall back to text
 */
export function extractFlexContainer(payload: unknown): FlexNode | null {
  if (!payload || typeof payload !== 'object') return null;
  const { type, contents } = payload as FlexNode;
  if (type !== 'flex' || !contents || typeof contents !== 'object') return null;
  const container = contents as FlexNode;
  return container.type === 'bubble' || container.type === 'carousel' ? container : null;
}

/** True when an insert failed only because the `message_payload` migration is not applied yet. */
export function isMissingPayloadColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (error.code === 'PGRST204' || error.code === '42703') && String(error.message ?? '').includes('message_payload');
}
