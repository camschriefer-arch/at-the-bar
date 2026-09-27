/**
 * The pieces an emoji is assembled from: skin tones, the joiner that makes one
 * emoji out of several, the selector that asks for the coloured form, the
 * keycap, and the tag characters the subdivision flags spell themselves with.
 * None of them mean anything on their own.
 */
const JOINERS: readonly [number, number][] = [
  [0x200d, 0x200d],
  [0x20e3, 0x20e3],
  [0xfe0f, 0xfe0f],
  [0x1f3fb, 0x1f3ff],
  [0xe0020, 0xe007f],
];

/**
 * Where the pictographs themselves live. Broad ranges rather than the Unicode
 * property, which not every engine the app runs on can be relied on to know:
 * the job is to tell an emoji from writing, and writing sits elsewhere.
 */
const PICTURES: readonly [number, number][] = [
  [0x00a9, 0x00a9],
  [0x00ae, 0x00ae],
  [0x203c, 0x203c],
  [0x2049, 0x2049],
  [0x2122, 0x2122],
  [0x2139, 0x2139],
  [0x2194, 0x21aa],
  [0x231a, 0x232a],
  [0x23cf, 0x23fa],
  [0x24c2, 0x24c2],
  [0x25aa, 0x25fe],
  [0x2600, 0x27bf],
  [0x2934, 0x2935],
  [0x2b00, 0x2bff],
  [0x3030, 0x3030],
  [0x303d, 0x303d],
  [0x3297, 0x3299],
  [0x1f000, 0x1faff],
];

function within(point: number, ranges: readonly [number, number][]): boolean {
  return ranges.some(([low, high]) => point >= low && point <= high);
}

/**
 * What counts as a reaction typed by hand. The chips offer three and the
 * phone's keyboard offers the rest, so the only thing to rule out is someone
 * writing in the box: words belong in a comment, where they can be read.
 */
export function asReaction(text: string): string | null {
  const trimmed = text.trim();
  const points = [...trimmed].map((character) => character.codePointAt(0) ?? 0);
  if (points.length === 0) return null;

  // A flag or a family runs to several code points, but not to a sentence, and
  // the column keeps eight.
  if (points.length > 8) return null;

  const picture = (point: number) => within(point, PICTURES) && !within(point, JOINERS);
  if (!points.every((point) => picture(point) || within(point, JOINERS))) return null;
  if (!points.some(picture)) return null;
  return trimmed;
}
