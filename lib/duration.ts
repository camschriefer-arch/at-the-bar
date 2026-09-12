/** Minutes as the kind of length someone would say out loud: "2h 15m". */
export function formatMinutes(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 1) return null;

  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;

  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
