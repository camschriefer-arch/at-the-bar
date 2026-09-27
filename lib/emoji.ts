/**
 * What counts as a reaction typed by hand. The chips offer three and the
 * phone's keyboard offers the rest, so the only thing to rule out is someone
 * writing in the box: words belong in a comment, where they can be read.
 */
export function asReaction(text: string): string | null {
  const points = [...text.trim()];
  if (points.length === 0) return null;

  // A flag or a family runs to several code points, but not to a sentence, and
  // the column keeps eight.
  if (points.length > 8) return null;

  // Everything an emoji is built from - the pictographs themselves, the skin
  // tones, the joiner, the variation selector - sits above the scripts people
  // write words in, so this is the whole of the test.
  if (points.some((point) => (point.codePointAt(0) ?? 0) < 0x2000)) return null;
  return points.join('');
}
