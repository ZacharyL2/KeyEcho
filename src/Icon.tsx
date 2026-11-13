import type { Glyph } from './glyph';
import * as styles from './Icon.css';
import * as glyphs from './icons.gen';

export type IconName = keyof typeof glyphs;

const em = (v: number) => `${Math.round(v * 10000) / 10000}em`;

/** Stem of regular text as a fraction of its font size, paired with the library's 1.5 line. */
const TEXT_STEM = 0.085;
const LIBRARY_STROKE = 1.5;

/**
 * max(box × stroke / grid, 0.085em): the drawing scaled to the box, never
 * thinner than the text it sits in. The svg sets no font-size and its box is
 * 1em (Icon.css.ts), so both terms are in the surrounding text's em.
 */
function strokeWidth(glyph: Glyph): string {
  const grid = Number(glyph.viewBox.split(' ')[2]);
  return em(
    Math.max(glyph.stroke / grid, (TEXT_STEM * glyph.stroke) / LIBRARY_STROKE),
  );
}

export function Icon(props: { name: IconName; class?: string }) {
  const glyph = () => glyphs[props.name];
  return (
    <svg
      aria-hidden="true"
      class={props.class ? `${styles.uiIcon} ${props.class}` : styles.uiIcon}
      fill="none"
      innerHTML={glyph().body}
      stroke-linecap="round"
      stroke-linejoin="round"
      style={{ 'stroke-width': strokeWidth(glyph()) }}
      viewBox={glyph().viewBox}
    />
  );
}
