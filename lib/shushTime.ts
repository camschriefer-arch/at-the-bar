function clockLabel(at: Date): string {
  const hours = at.getHours();
  const minutes = at.getMinutes().toString().padStart(2, '0');
  const suffix = hours < 12 ? 'am' : 'pm';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes}${suffix}`;
}

/**
 * When a shhhh lifts, in the words the confirm dialog uses: "3:40pm tomorrow".
 * Written by hand rather than through Intl so it reads the same on both phones.
 */
export function untilLabel(expiresAt: string, now: Date = new Date()): string {
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return 'in a day';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.floor((at.getTime() - startOfToday) / 86_400_000);
  const day = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  return `${clockLabel(at)} ${day}`;
}
