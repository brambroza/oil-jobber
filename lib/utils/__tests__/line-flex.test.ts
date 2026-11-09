import { describe, expect, it } from 'vitest';
import {
  extractFlexContainer,
  flexAspectRatio,
  flexBubbleWidth,
  flexColor,
  flexImageWidth,
  flexSafeUrl,
  flexSpacing,
  flexTextSize,
  isMissingPayloadColumnError,
  pickFlexMessage,
} from '@/lib/utils/line-flex';

describe('size helpers', () => {
  it('maps keywords and passes CSS lengths', () => {
    expect(flexTextSize('sm')).toBe('14px');
    expect(flexTextSize('18px')).toBe('18px');
    expect(flexSpacing('md')).toBe('8px');
    expect(flexSpacing('none')).toBe('0px');
    expect(flexImageWidth('full')).toBe('100%');
  });

  it('rejects anything else', () => {
    expect(flexTextSize('url(x)')).toBeUndefined();
    expect(flexSpacing(12)).toBeUndefined();
    expect(flexImageWidth(undefined)).toBe('100px');
  });

  it('resolves the bubble width with a mega default', () => {
    expect(flexBubbleWidth('giga')).toBe(386);
    expect(flexBubbleWidth(undefined)).toBe(300);
  });

  it('converts the aspect ratio', () => {
    expect(flexAspectRatio('20:13')).toBe('20 / 13');
    expect(flexAspectRatio('bad')).toBeUndefined();
  });
});

describe('flexColor', () => {
  it('accepts LINE hex colors only', () => {
    expect(flexColor('#716ab0')).toBe('#716ab0');
    expect(flexColor('#716ab080')).toBe('#716ab080');
    expect(flexColor('red')).toBeUndefined();
    expect(flexColor('#000;background:url(x)')).toBeUndefined();
  });
});

describe('flexSafeUrl', () => {
  it('allows http and https', () => {
    expect(flexSafeUrl('https://example.com/a.pdf')).toBe('https://example.com/a.pdf');
    expect(flexSafeUrl('http://example.com')).toBe('http://example.com');
  });

  it('blocks script and non-URL values', () => {
    expect(flexSafeUrl('javascript:alert(1)')).toBeNull();
    expect(flexSafeUrl('data:text/html,x')).toBeNull();
    expect(flexSafeUrl('not a url')).toBeNull();
    expect(flexSafeUrl(undefined)).toBeNull();
  });
});

describe('pickFlexMessage', () => {
  const flex = { type: 'flex', altText: 'x', contents: { type: 'bubble' } };

  it('returns the first flex message', () => {
    expect(pickFlexMessage([{ type: 'text', text: 'a' }, flex])).toBe(flex);
  });

  it('returns null when there is none', () => {
    expect(pickFlexMessage([{ type: 'text', text: 'a' }])).toBeNull();
    expect(pickFlexMessage('nope')).toBeNull();
  });
});

describe('extractFlexContainer', () => {
  it('returns bubbles and carousels', () => {
    const bubble = { type: 'bubble' };
    expect(extractFlexContainer({ type: 'flex', contents: bubble })).toBe(bubble);
    expect(extractFlexContainer({ type: 'flex', contents: { type: 'carousel' } })).toEqual({ type: 'carousel' });
  });

  it('falls back on old or malformed rows', () => {
    expect(extractFlexContainer(null)).toBeNull();
    expect(extractFlexContainer('text')).toBeNull();
    expect(extractFlexContainer({ type: 'text' })).toBeNull();
    expect(extractFlexContainer({ type: 'flex', contents: { type: 'box' } })).toBeNull();
  });
});

describe('isMissingPayloadColumnError', () => {
  it('matches only the missing payload column', () => {
    expect(isMissingPayloadColumnError({ code: 'PGRST204', message: "Could not find the 'message_payload' column of 'line_messages' in the schema cache" })).toBe(true);
    expect(isMissingPayloadColumnError({ code: '42703', message: 'column "message_payload" of relation "line_messages" does not exist' })).toBe(true);
  });

  it('does not hide other failures', () => {
    expect(isMissingPayloadColumnError({ code: 'PGRST204', message: "Could not find the 'other' column" })).toBe(false);
    expect(isMissingPayloadColumnError({ code: '23503', message: 'message_payload' })).toBe(false);
    expect(isMissingPayloadColumnError(null)).toBe(false);
  });
});
