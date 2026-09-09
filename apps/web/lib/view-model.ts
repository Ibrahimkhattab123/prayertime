import type { CalculationRequest, Prayer } from './engine';
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function sameRequest(a: CalculationRequest, b: CalculationRequest) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
export function nextPrayer(prayers: Prayer[], now: number): Prayer | null {
  return (
    prayers
      .filter((p) => p.adjusted && p.adjusted.unix_seconds > now)
      .sort((a, b) => a.adjusted!.unix_seconds - b.adjusted!.unix_seconds)[0] ??
    null
  );
}
