/** Display-only conversion of the selected civil date; never determines Ramadan rules. */
export function hijriDateLabel(date: string, locale = 'en-GB'): string {
  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      calendar: 'islamic-umalqura',
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      era: 'short',
    });
    if (formatter.resolvedOptions().calendar !== 'islamic-umalqura')
      return 'Hijri date unavailable';
    return formatter.format(new Date(`${date}T12:00:00Z`));
  } catch {
    return 'Hijri date unavailable';
  }
}
