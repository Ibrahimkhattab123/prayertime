import type { CalculationRequest } from './engine';
/** Partial number/date fields are normal while editing, not calculation requests. */
export function completeConfiguration(request: CalculationRequest): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(request.date) &&
    !!request.timezone.trim() &&
    Number.isFinite(request.location.latitude_deg) &&
    Math.abs(request.location.latitude_deg) <= 90 &&
    Number.isFinite(request.location.longitude_deg) &&
    Math.abs(request.location.longitude_deg) <= 180 &&
    Object.values(request.adjustments_minutes).every(
      (v) => Number.isFinite(v) && Math.abs(v) <= 120,
    )
  );
}
/** A changed input invalidates every task started for the previous configuration. */
export class CalculationRevision {
  private revision = 0;
  invalidate() {
    this.revision++;
  }
  snapshot() {
    return this.revision;
  }
  accepts(snapshot: number) {
    return this.revision === snapshot;
  }
}
