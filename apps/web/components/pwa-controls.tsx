'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Localized } from '@/components/language';
import {
  isAppleMobile,
  isStandalone,
  watchPwa,
  type InstallPrompt,
} from '@/lib/pwa';

export function PwaControls({
  onReady,
  onError,
  updateDisabled,
}: {
  onReady: (ready: boolean) => void;
  onError: (message: string) => void;
  updateDisabled: boolean;
}) {
  const [installed, setInstalled] = useState(true);
  const [apple, setApple] = useState(false);
  const [secure, setSecure] = useState(true);
  const [help, setHelp] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState('');
  const prompt = useRef<InstallPrompt | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const sync = () =>
      setInstalled(
        isStandalone(
          media.matches,
          (navigator as Navigator & { standalone?: boolean }).standalone,
        ),
      );
    sync();
    setApple(
      isAppleMobile(
        navigator.userAgent,
        navigator.platform,
        navigator.maxTouchPoints,
      ),
    );
    setSecure(window.isSecureContext);
    const capture = (event: Event) => {
      event.preventDefault();
      prompt.current = event as InstallPrompt;
    };
    const complete = () => {
      prompt.current = null;
      setInstalled(true);
      setHelp(false);
      setMessage('');
    };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', complete);
    media.addEventListener('change', sync);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', complete);
      media.removeEventListener('change', sync);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !window.isSecureContext ||
      !('serviceWorker' in navigator)
    )
      return;
    return watchPwa(navigator.serviceWorker, document, {
      ready: () => onReady(true),
      update: setWaiting,
      blocked: () => {
        if (timer.current) clearTimeout(timer.current);
        setUpdating(false);
        setMessage(
          'Close other PrayerTime tabs or app windows, then try Update now again.',
        );
      },
      error: () =>
        onError(
          'Offline installation failed. Calculation still works while this page is open.',
        ),
      reload: () => window.location.reload(),
    });
  }, [onReady, onError]);
  const install = async () => {
    const event = prompt.current;
    if (!event) {
      setHelp(true);
      return;
    }
    prompt.current = null; // A prompt event can be used only once, including after dismissal.
    setPrompting(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted')
        setMessage(
          'Installation requested. Open PrayerTime from your home screen when it appears.',
        );
    } catch {
      setHelp(true);
    } finally {
      setPrompting(false);
    }
  };
  return (
    <Localized>
      <div className="pwa-controls">
        {!installed && (
          <Button
            variant="outline"
            onClick={() => void install()}
            disabled={prompting}
          >
            <Download size={16} />
            Install PrayerTime
          </Button>
        )}
        {waiting && (
          <div className="pwa-update" role="status">
            <span>A new version is ready.</span>
            <Button
              variant="outline"
              disabled={updating || updateDisabled}
              onClick={() => {
                setUpdating(true);
                setMessage('');
                waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
                timer.current = setTimeout(() => {
                  setUpdating(false);
                  setMessage(
                    'The update has not activated yet. Close other PrayerTime windows and try again.',
                  );
                }, 10_000);
              }}
            >
              <RefreshCw size={16} />
              {updating ? 'Updating…' : 'Update now'}
            </Button>
            {updateDisabled && (
              <span>Finish your configuration changes before updating.</span>
            )}
          </div>
        )}
        {message && (
          <p role="status" className="field-note">
            {message}
          </p>
        )}
        <Dialog open={help} onOpenChange={setHelp}>
          <DialogContent showCloseButton={false} className="pwa-install-dialog">
            <DialogTitle>Install PrayerTime</DialogTitle>
            <DialogDescription>
              Keep PrayerTime on your home screen and use saved calculations
              offline.
            </DialogDescription>
            {!secure && (
              <p>
                Installation needs a secure HTTPS address. Open the published
                website to install.
              </p>
            )}
            {apple ? (
              <ol>
                <li>Open this website in Safari.</li>
                <li>Open Share, then choose Add to Home Screen.</li>
                <li>Enable Open as Web App if shown, then tap Add.</li>
              </ol>
            ) : (
              <ol>
                <li>
                  Open this website in Chrome, Edge, or another browser that
                  supports app installation.
                </li>
                <li>
                  Open the browser menu and choose Install app or Add to Home
                  Screen, if available.
                </li>
              </ol>
            )}
            <p>
              If you opened a link inside another app, open it in your phone’s
              browser first.
            </p>
            <p>
              Wait for “Ready offline” before disconnecting. New city searches
              still need internet.
            </p>
            <Button onClick={() => setHelp(false)}>Close</Button>
          </DialogContent>
        </Dialog>
      </div>
    </Localized>
  );
}
