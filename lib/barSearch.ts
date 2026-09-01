import type { Bar } from './types';

export type BarSuggestion = { bar: Bar; distanceMeters: number | null };

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Suggestions for a partially typed bar name. Nearby bars are preferred over
 * catalog-wide matches, and within each group a name that starts with the query
 * outranks one that merely contains it.
 */
export function rankBarSuggestions(
  query: string,
  nearby: readonly BarSuggestion[],
  remote: readonly Bar[],
  limit: number
): BarSuggestion[] {
  const needle = normalize(query);
  const nearbyIds = new Set(nearby.map((entry) => entry.bar.id));

  const score = (bar: Bar, isNearby: boolean) => {
    const name = normalize(bar.name);
    if (needle && !name.includes(needle)) return null;
    return (isNearby ? 0 : 2) + (needle && name.startsWith(needle) ? 0 : 1);
  };

  const candidates: { suggestion: BarSuggestion; score: number }[] = [];

  for (const entry of nearby) {
    const rank = score(entry.bar, true);
    if (rank === null) continue;
    candidates.push({ suggestion: entry, score: rank });
  }

  for (const bar of remote) {
    if (nearbyIds.has(bar.id)) continue;
    const rank = score(bar, false);
    if (rank === null) continue;
    candidates.push({ suggestion: { bar, distanceMeters: null }, score: rank });
  }

  candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;

    const left = a.suggestion.distanceMeters;
    const right = b.suggestion.distanceMeters;
    if (left !== null && right !== null && left !== right) return left - right;

    return a.suggestion.bar.name.localeCompare(b.suggestion.bar.name);
  });

  return candidates.slice(0, limit).map((candidate) => candidate.suggestion);
}

export function formatBarSubtitle(suggestion: BarSuggestion): string {
  const place = [suggestion.bar.city, suggestion.bar.state].filter(Boolean).join(', ');
  if (suggestion.distanceMeters === null) return place;

  const miles = suggestion.distanceMeters / 1609.344;
  const distance = miles < 0.1 ? `${Math.round(suggestion.distanceMeters)} m` : `${miles.toFixed(1)} mi`;

  return place ? `${distance} · ${place}` : distance;
}
