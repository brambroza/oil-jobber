'use client';

import type { CSSProperties, ReactNode } from 'react';
import {
  flexAspectRatio,
  flexBubbleWidth,
  flexColor,
  flexImageWidth,
  flexSafeUrl,
  flexSpacing,
  flexTextSize,
  type FlexNode,
} from '@/lib/utils/line-flex';

type Layout = 'vertical' | 'horizontal' | 'baseline';

const SECTION_PADDING: Record<string, string> = { header: '20px', body: '20px', footer: '10px' };
const JUSTIFY: Record<string, CSSProperties['justifyContent']> = { start: 'flex-start', end: 'flex-end', center: 'center' };
const GRAVITY: Record<string, CSSProperties['alignSelf']> = { top: 'flex-start', bottom: 'flex-end', center: 'center' };

function asNodes(value: unknown): FlexNode[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

/** Sizing inside the parent box: LINE defaults to flex 1 in a row, 0 in a column. */
function itemStyle(node: FlexNode, parent: Layout, index: number, parentSpacing?: string): CSSProperties {
  const flex = typeof node.flex === 'number' ? node.flex : parent === 'vertical' ? 0 : 1;
  const gap = index === 0 ? undefined : flexSpacing(node.margin) ?? parentSpacing;
  return {
    flex: flex > 0 ? `${flex} 0 0` : '0 0 auto',
    minWidth: 0,
    ...(gap ? (parent === 'vertical' ? { marginTop: gap } : { marginLeft: gap }) : {}),
  };
}

function boxStyle(node: FlexNode, defaultPadding?: string): CSSProperties {
  const padding = flexSpacing(node.paddingAll) ?? defaultPadding;
  const layout = node.layout as Layout;
  // Unset keys must be dropped: React would let `paddingTop: undefined` clear `padding`.
  const sidePadding: CSSProperties = Object.fromEntries(
    Object.entries({
      paddingTop: flexSpacing(node.paddingTop),
      paddingBottom: flexSpacing(node.paddingBottom),
      paddingLeft: flexSpacing(node.paddingStart),
      paddingRight: flexSpacing(node.paddingEnd),
    }).filter(([, value]) => value !== undefined),
  );
  return {
    display: 'flex',
    flexDirection: layout === 'vertical' ? 'column' : 'row',
    alignItems: layout === 'baseline' ? 'baseline' : undefined,
    justifyContent: typeof node.justifyContent === 'string' ? JUSTIFY[node.justifyContent.replace('flex-', '')] : undefined,
    padding,
    ...sidePadding,
    backgroundColor: flexColor(node.backgroundColor),
    borderRadius: flexSpacing(node.cornerRadius),
    borderColor: flexColor(node.borderColor),
    borderWidth: flexSpacing(node.borderWidth),
    borderStyle: node.borderWidth ? 'solid' : undefined,
    width: flexSpacing(node.width),
    height: flexSpacing(node.height),
    boxSizing: 'border-box',
  };
}

function textStyle(node: FlexNode): CSSProperties {
  return {
    fontSize: flexTextSize(node.size),
    color: flexColor(node.color),
    fontWeight: node.weight === 'bold' ? 700 : undefined,
    fontStyle: node.style === 'italic' ? 'italic' : undefined,
    textDecoration: node.decoration === 'underline' || node.decoration === 'line-through' ? String(node.decoration) : undefined,
  };
}

function FlexText({ node, style }: { node: FlexNode; style: CSSProperties }) {
  const spans = asNodes(node.contents);
  const maxLines = typeof node.maxLines === 'number' && node.maxLines > 0 ? node.maxLines : 0;
  const wrapStyle: CSSProperties = node.wrap
    ? { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
    : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const clampStyle: CSSProperties = node.wrap && maxLines
    ? { display: '-webkit-box', WebkitLineClamp: maxLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
    : {};

  return (
    <div
      style={{
        ...style,
        ...textStyle(node),
        ...wrapStyle,
        ...clampStyle,
        textAlign: node.align === 'center' || node.align === 'end' ? (node.align === 'end' ? 'right' : 'center') : undefined,
        alignSelf: typeof node.gravity === 'string' ? GRAVITY[node.gravity] : undefined,
      }}
    >
      {spans.length
        ? spans.map((span, index) => <span key={index} style={textStyle(span)}>{String(span.text ?? '')}</span>)
        : String(node.text ?? '')}
    </div>
  );
}

function FlexImage({ node, style }: { node: FlexNode; style: CSSProperties }) {
  const src = flexSafeUrl(node.url);
  if (!src) return null;
  return (
    <div style={{ ...style, display: 'flex', justifyContent: node.align === 'start' ? 'flex-start' : node.align === 'end' ? 'flex-end' : 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=''
        loading='lazy'
        style={{
          display: 'block',
          width: flexImageWidth(node.size),
          maxWidth: '100%',
          aspectRatio: flexAspectRatio(node.aspectRatio),
          objectFit: node.aspectMode === 'cover' ? 'cover' : 'contain',
        }}
      />
    </div>
  );
}

function FlexButton({ node, style }: { node: FlexNode; style: CSSProperties }) {
  const action = (node.action ?? {}) as FlexNode;
  const buttonStyle = node.style === 'primary' || node.style === 'secondary' ? node.style : 'link';
  const color = flexColor(node.color);
  const appearance: CSSProperties = buttonStyle === 'primary'
    ? { backgroundColor: color ?? '#17c950', color: '#ffffff' }
    : buttonStyle === 'secondary'
      ? { backgroundColor: color ?? '#dcdfe5', color: '#111111' }
      : { color: color ?? '#42659a' };
  const content = {
    style: {
      ...style,
      ...appearance,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: node.height === 'sm' ? 40 : 52,
      padding: '0 12px',
      borderRadius: 8,
      fontSize: 16,
      textDecoration: 'none',
    } as CSSProperties,
    children: String(action.label ?? ''),
  };
  const href = action.type === 'uri' ? flexSafeUrl(action.uri) : null;
  return href ? <a href={href} target='_blank' rel='noopener noreferrer' {...content} /> : <div {...content} />;
}

function FlexComponent({ node, parent, index, parentSpacing }: { node: FlexNode; parent: Layout; index: number; parentSpacing?: string }) {
  const style = itemStyle(node, parent, index, parentSpacing);

  switch (node.type) {
    case 'box':
      return <FlexBox node={node} style={style} />;
    case 'text':
      return <FlexText node={node} style={style} />;
    case 'image':
      return <FlexImage node={node} style={style} />;
    case 'button':
      return <FlexButton node={node} style={style} />;
    case 'separator':
      return <div style={{ ...style, flex: '0 0 auto', alignSelf: 'stretch', [parent === 'vertical' ? 'height' : 'width']: 1, backgroundColor: flexColor(node.color) ?? '#d4d6da' }} />;
    case 'filler':
      return <div style={{ ...style, flex: `${typeof node.flex === 'number' ? node.flex : 1} 0 0` }} />;
    default:
      return null;
  }
}

function FlexBox({ node, style, defaultPadding }: { node: FlexNode; style?: CSSProperties; defaultPadding?: string }) {
  const layout = (node.layout === 'horizontal' || node.layout === 'baseline' ? node.layout : 'vertical') as Layout;
  const spacing = flexSpacing(node.spacing);
  return (
    <div style={{ ...style, ...boxStyle({ ...node, layout }, defaultPadding) }}>
      {asNodes(node.contents).map((child, index) => (
        <FlexComponent key={index} node={child} parent={layout} index={index} parentSpacing={spacing} />
      ))}
    </div>
  );
}

function FlexBubble({ bubble }: { bubble: FlexNode }) {
  const styles = (bubble.styles ?? {}) as Record<string, FlexNode | undefined>;
  const section = (name: 'header' | 'body' | 'footer'): ReactNode => {
    const node = bubble[name] as FlexNode | undefined;
    if (!node) return null;
    return (
      <FlexBox
        node={{ ...node, backgroundColor: node.backgroundColor ?? styles[name]?.backgroundColor }}
        style={{ flex: name === 'body' ? '1 0 auto' : '0 0 auto' }}
        defaultPadding={SECTION_PADDING[name]}
      />
    );
  };
  const hero = bubble.hero as FlexNode | undefined;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        width: flexBubbleWidth(bubble.size),
        maxWidth: '100%',
        overflow: 'hidden',
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        backgroundColor: '#ffffff',
        color: '#111111',
        fontSize: 16,
        lineHeight: 1.4,
      }}
    >
      {section('header')}
      {hero?.type === 'image' ? <FlexImage node={hero} style={{}} /> : null}
      {hero?.type === 'box' ? <FlexBox node={hero} /> : null}
      {section('body')}
      {section('footer')}
    </div>
  );
}

/**
 * Shows a stored Flex bubble or carousel close to how LINE displays it.
 * Uses plain elements because Flex is a fixed layout spec and the theme must
 * not restyle what the customer actually received. Unknown components are skipped.
 */
export function FlexMessagePreview({ container }: { container: FlexNode }) {
  if (container.type === 'carousel') {
    return (
      <div style={{ display: 'flex', gap: 8, maxWidth: '100%', overflowX: 'auto' }}>
        {asNodes(container.contents).map((bubble, index) => <FlexBubble key={index} bubble={bubble} />)}
      </div>
    );
  }
  return <FlexBubble bubble={container} />;
}
