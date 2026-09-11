/** Educational school overview, separate from the numerical rule implementation. */
export function fiqhExplanation(prayer: string, asrProfile: string): string[] {
  const content: Record<string, string[]> = {
    fajr: [
      'Hanafi, Maliki, Shafi‘i and Hanbali: Fajr begins at true dawn (fajr al-sadiq), when light spreads horizontally along the eastern horizon, rather than the earlier vertical false dawn. Its outer time boundary is sunrise.',
      'The schools discuss preferred times within that period; Maliki texts also distinguish ordinary and necessity periods in some presentations. The displayed dawn angle estimates the physical sign. It is not itself a universal angle prescribed by a fiqh school.',
    ],
    dhuhr: [
      'All four Sunni schools begin Dhuhr after zawal: the Sun has passed its highest meridian position and the noon shadow begins to lengthen.',
      'For Shafi‘i, Maliki and Hanbali, the usual Dhuhr-to-Asr boundary is one object-height of additional shadow beyond the noon shadow. Abu Hanifa’s two-shadow position places the boundary later; Abu Yusuf and Muhammad al-Shaybani (the Sahibayn) use one additional object-height. School-specific shared or necessity periods are not calculated here.',
      'The app displays the calculated transit boundary. A mosque may allow a short margin after transit before praying Dhuhr; no automatic margin is included here.',
    ],
    asr: [
      'Shafi‘i, Maliki and Hanbali: Asr begins at the one-shadow threshold—an object’s noon shadow plus its own height. Hanafi: Abu Hanifa’s position uses the noon shadow plus twice the object’s height; the Sahibayn position uses the one-shadow threshold.',
      'Sunset is the outer boundary, but the whole interval is not equally recommended. Shafi‘i texts distinguish preferred and later permissible periods; Maliki and Hanbali texts distinguish ordinary and necessity periods. Their detailed endpoints and intra-school variations are not represented by the single start time shown here.',
      asrProfile === 'fiqh.hanafi_abu_hanifa@1'
        ? 'Your calculated result uses Abu Hanifa’s two-shadow convention.'
        : asrProfile === 'fiqh.hanafi_sahibayn@1'
          ? 'Your calculated result uses the Hanafi Sahibayn one-shadow convention.'
          : 'Your calculated result uses the shared Shafi‘i, Maliki and Hanbali one-shadow convention.',
    ],
    maghrib: [
      'The four Sunni schools begin Maghrib when the solar disc has completely set. This differs from merely losing sight of the Sun behind a nearby building or mountain.',
      'Shafi‘i (the more reliable extended-time opinion) and Hanbali accounts extend Maghrib to the disappearance of red twilight. The Maliki Risalah describes a short ordinary period for performing Maghrib and its prerequisites, while recording a broader opinion extending to red twilight. Hanafi discussions connect the endpoint with the red/white shafaq disagreement used for Isha.',
      'These are school overviews of the interval. This timetable calculates the sunset start; it does not declare an end to each school’s ordinary or necessity period.',
    ],
    isha: [
      'Maliki, Shafi‘i and Hanbali accounts begin Isha when the red twilight has disappeared. In Hanafi jurisprudence, Abu Hanifa is associated with the disappearance of the remaining white twilight, while Abu Yusuf and Muhammad al-Shaybani use the disappearance of red twilight; later Hanafi authorities discuss both positions.',
      'The end of Isha requires further distinctions between preferred, permissible and necessity time. The hadith of prayer times mentions midnight; school treatments differ in how later periods before true dawn are classified. The app’s sunset-to-sunrise midpoint is a solar-night marker, not a school-specific legal deadline.',
      'Choosing a Hanafi Asr option does not automatically select white-twilight Isha. The independent calculation method supplies an angle or fixed interval as a numerical convention; the app does not observe shafaq or compute full fiqh windows.',
    ],
  };
  return content[prayer] ?? [];
}
export const fiqhSources = [
  {
    label: 'Sahih Muslim 612a · prayer-time signs',
    url: 'https://sunnah.com/muslim:612a',
  },
  {
    label: 'Maliki Risalah · chapter 8',
    url: 'https://www.iium.edu.my/deed/lawbase/risalah_maliki/book08.html',
  },
  {
    label: 'Darul Iftaa · Hanafi Asr opinions',
    url: 'https://daruliftaa.us/fatwa/163/',
  },
];
