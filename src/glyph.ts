/** One icon drawing: grid viewBox, line width in grid units, SVG markup in currentColor. */
export type Glyph = {
  readonly viewBox: string;
  readonly stroke: number;
  readonly body: string;
};
