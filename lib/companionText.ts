import type { VisitCompanion } from './types';

/** "Warren", "Warren and Pete", "Warren, Pete and Sam". */
export function nameList(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The people on a visit who have said yes, in the order the card reads them. */
export function confirmedNames(companions: readonly VisitCompanion[]): string[] {
  return companions.filter((person) => !person.pending).map((person) => person.display_name);
}

/** The people who have not answered yet, shown only to the two of them. */
export function pendingNames(companions: readonly VisitCompanion[]): string[] {
  return companions.filter((person) => person.pending).map((person) => person.display_name);
}
