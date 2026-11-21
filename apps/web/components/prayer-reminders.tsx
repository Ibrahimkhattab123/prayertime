'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language';
import type { CalculationRequest } from '@/lib/engine';
import { translate } from '@/lib/i18n';

const catalogue = [
  ['Adhan-Makkah', 'Mecca'],
  ['Adhan-Madinah', 'Madinah'],
  ['Adhan-Alaqsa', 'Al-Aqsa'],
  ['Adhan-Egypt', 'Egypt'],
  ['Adhan-Halab', 'Halab'],
  ['Abdul-Basit', 'Abdul Basit'],
  ['Abdul-Ghaffar', 'Abdul Ghaffar'],
  ['Abdul-Hakam', 'Abdul Hakam'],
  ['Al-Hussaini', 'Al-Hussaini'],
  ['Bakir-Bash', 'Bakir Bash'],
  ['Hafez', 'Hafez'],
  ['Hafiz-Murad', 'Hafiz Murad'],
  ['Minshawi', 'Minshawi'],
  ['Naghshbandi', 'Naghshbandi'],
  ['Saber', 'Saber'],
  ['Sharif-Doman', 'Sharif Doman'],
  ['Yusuf-Islam', 'Yusuf Islam'],
];
const api = process.env.NEXT_PUBLIC_PRAYER_PUSH_URL?.replace(/\/$/, '');
const preference = 'prayertime-reminders-v1';
const recordingKey = 'prayertime-adhan-v1';

type Preference = { key: string; enabled: boolean };
function readPreference(): Preference | null {
  try {
    const value = JSON.parse(localStorage.getItem(preference) ?? 'null');
    return /^[a-f0-9]{64}$/.test(value?.key) ? value : null;
  } catch {
    return null;
  }
}

function decodeKey(key: string) {
  return Uint8Array.from(
    atob(key.replaceAll('-', '+').replaceAll('_', '/')),
    (character) => character.charCodeAt(0),
  );
}

export function PrayerReminders({ request }: { request: CalculationRequest }) {
  const { language } = useLanguage();
  const t = (value: string) => translate(value, language);
  const [selected, setSelected] = useState(catalogue[0][0]);
  const [playing, setPlaying] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [setup, setSetup] = useState<{
    worker: ServiceWorkerRegistration;
    key: Uint8Array<ArrayBuffer>;
  } | null>(null);
  const [online, setOnline] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const synced = useRef('');
  const updates = useRef<Promise<void>>(Promise.resolve());
  const {
    timezone,
    location,
    profiles,
    high_latitude,
    rounding,
    ramadan,
    adjustments_minutes,
  } = request;
  const registration = JSON.stringify({
    configuration: {
      timezone,
      location,
      profiles,
      high_latitude,
      rounding,
      ramadan,
      adjustments_minutes,
    },
    language,
  });
  useEffect(() => {
    const available =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupported(available);
    const connection = () => setOnline(navigator.onLine);
    connection();
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    setEnabled(
      Boolean(
        available &&
        readPreference()?.enabled &&
        Notification.permission === 'granted',
      ),
    );
    try {
      const saved = localStorage.getItem(recordingKey);
      if (saved && catalogue.some(([id]) => id === saved)) setSelected(saved);
    } catch {}
    if (new URLSearchParams(window.location.search).get('adhan') === '1') {
      setOpen(true);
      document
        .getElementById('prayer-reminders')
        ?.scrollIntoView({ block: 'start' });
    }
    return () => {
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
    };
  }, []);

  useEffect(() => {
    if (!supported || !api || !online) return;
    const controller = new AbortController();
    void Promise.all([
      navigator.serviceWorker.ready,
      fetch(api + '/config', {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10000),
        ]),
      }),
    ])
      .then(async ([worker, response]) => {
        if (!response.ok) throw new Error('Missing push configuration');
        const { publicKey } = (await response.json()) as {
          publicKey?: unknown;
        };
        if (typeof publicKey !== 'string') throw new Error('Missing push key');
        if (!controller.signal.aborted)
          setSetup({ worker, key: decodeKey(publicKey) });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatus('The reminder service is unavailable.');
      });
    return () => controller.abort();
  }, [supported, online]);

  const saveRegistration = async (
    key: string,
    subscription: PushSubscription,
  ) => {
    const response = await fetch(api + '/subscription', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({ ...JSON.parse(registration), subscription }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Registration failed');
    synced.current = registration;
  };

  useEffect(() => {
    if (!api || !enabled || busy || synced.current === registration || !online)
      return;
    const local = readPreference();
    if (!local?.enabled) return;
    const controller = new AbortController();
    const update = updates.current.then(async () => {
      const worker = await navigator.serviceWorker.getRegistration();
      const subscription = await worker?.pushManager.getSubscription();
      if (controller.signal.aborted) return;
      if (!subscription) {
        setEnabled(false);
        return;
      }
      await saveRegistration(local.key, subscription);
    });
    updates.current = update.catch(() => {
      if (!controller.signal.aborted)
        setStatus(
          'Could not update prayer reminders. Reopen PrayerTime while online to retry.',
        );
    });
    return () => controller.abort();
  }, [enabled, busy, registration, online]);

  const toggle = async () => {
    if (!supported || !api || !online || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const local = readPreference();
      if (enabled && local) {
        await updates.current;
        const response = await fetch(api + '/subscription', {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + local.key },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('Unregistration failed');
        localStorage.setItem(
          preference,
          JSON.stringify({ ...local, enabled: false }),
        );
        setEnabled(false);
        const worker = await navigator.serviceWorker.getRegistration();
        await (await worker?.pushManager.getSubscription())?.unsubscribe();
        setStatus('Prayer reminders turned off.');
        return;
      }
      if (!setup) return;
      if (Notification.permission === 'denied') {
        setStatus(
          'Allow notifications in your device settings to enable reminders.',
        );
        return;
      }
      const key =
        local?.key ??
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
      localStorage.setItem(preference, JSON.stringify({ key, enabled: false }));
      const push = await setup.worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: setup.key,
      });
      await saveRegistration(key, push);
      localStorage.setItem(preference, JSON.stringify({ key, enabled: true }));
      setEnabled(true);
      setStatus('Prayer reminders turned on.');
    } catch {
      setStatus(
        Notification.permission === 'denied'
          ? 'Allow notifications in your device settings to enable reminders.'
          : 'Could not change prayer reminders. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const play = () => {
    if (!audio.current) return;
    const url = 'https://praytimes.org/audio/sunni/' + selected + '.mp3';
    setPlaying(true);
    audio.current.src = url;
    void audio.current
      .play()
      .catch(() =>
        setStatus(
          'Could not play the Adhan. Check your connection and try again.',
        ),
      );
  };

  return (
    <details
      id="prayer-reminders"
      className="prayer-reminders"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Bell size={17} aria-hidden="true" /> {t('Reminders and Adhan')}
      </summary>
      <div className="reminder-settings">
        <div>
          <h2>{t('Prayer reminders')}</h2>
          <p>
            {t(
              'Receive a push notification at each of your five prayer times. Enabling this shares your prayer calculation settings and push subscription with the reminder service.',
            )}
          </p>
          {(!api || !supported) && (
            <p>
              {t(
                !api
                  ? 'The reminder service is unavailable.'
                  : 'On iPhone, add PrayerTime to your Home Screen and open it there to enable notifications.',
              )}
            </p>
          )}
          <Button
            type="button"
            onClick={() => void toggle()}
            disabled={
              !api || !supported || !online || (!setup && !enabled) || busy
            }
          >
            {t(enabled ? 'Turn off reminders' : 'Enable prayer reminders')}
          </Button>
        </div>
        <div>
          <h2>{t('Sunni Adhan')}</h2>
          <label htmlFor="adhan-recording">{t('Recording')}</label>
          <select
            id="adhan-recording"
            value={selected}
            onChange={(event) => {
              const id = event.currentTarget.value;
              audio.current?.pause();
              setPlaying(false);
              audio.current?.removeAttribute('src');
              setSelected(id);
              try {
                localStorage.setItem(recordingKey, id);
              } catch {}
            }}
          >
            {catalogue.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
          <Button type="button" onClick={play} variant="outline">
            <Volume2 size={16} />
            {t('Play Adhan')}
          </Button>
          <audio
            ref={audio}
            controls
            hidden={!playing}
            preload="none"
            aria-label={t('Sunni Adhan')}
          />
          <a
            href="https://praytimes.org/docs/adhan"
            target="_blank"
            rel="noreferrer"
          >
            {t('Recordings from PrayTimes')}
          </a>
        </div>
      </div>
      {status && <output>{t(status)}</output>}
    </details>
  );
}
