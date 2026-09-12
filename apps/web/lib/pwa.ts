export type InstallPrompt = Event & {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
export function isAppleMobile(
  userAgent: string,
  platform: string,
  touchPoints: number,
) {
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === 'MacIntel' && touchPoints > 1)
  );
}
export function isStandalone(
  displayStandalone: boolean,
  iosStandalone?: boolean,
) {
  return displayStandalone || iosStandalone === true;
}

/** Keep the waiting version separate; activation happens only after a user request. */
export function watchPwa(
  sw: ServiceWorkerContainer,
  doc: Document,
  callbacks: {
    ready(): void;
    update(worker: ServiceWorker | null): void;
    blocked(): void;
    error(): void;
    reload(): void;
  },
) {
  let disposed = false;
  let registration: ServiceWorkerRegistration | undefined;
  let hadController = Boolean(sw.controller);
  let lastCheck = 0;
  const cleanups: (() => void)[] = [];
  const message = (event: MessageEvent) => {
    if (event.data?.type === 'OFFLINE_READY') callbacks.ready();
    if (event.data?.type === 'UPDATE_BLOCKED') callbacks.blocked();
  };
  const controller = () => {
    if (hadController) callbacks.reload();
    else {
      hadController = true;
      sw.controller?.postMessage({ type: 'CHECK_READY' });
    }
  };
  const visible = () => {
    if (
      doc.visibilityState === 'visible' &&
      registration &&
      Date.now() - lastCheck > 60_000
    ) {
      lastCheck = Date.now();
      void registration.update().catch(() => {}); // Offline reopening remains usable.
    }
  };
  sw.addEventListener('message', message);
  sw.addEventListener('controllerchange', controller);
  doc.addEventListener('visibilitychange', visible);
  void sw
    .register('/sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      if (disposed) return;
      registration = reg;
      const notify = () => {
        if (reg.waiting && sw.controller) callbacks.update(reg.waiting);
        reg.active?.postMessage({ type: 'CHECK_READY' });
      };
      const found = () => {
        const worker = reg.installing;
        if (!worker) return;
        const change = () => {
          if (worker.state === 'installed') notify();
          if (worker.state === 'redundant') callbacks.error();
        };
        worker.addEventListener('statechange', change);
        cleanups.push(() => worker.removeEventListener('statechange', change));
        change();
      };
      reg.addEventListener('updatefound', found);
      cleanups.push(() => reg.removeEventListener('updatefound', found));
      notify();
      found();
    })
    .catch(() => {
      if (!disposed) callbacks.error();
    });
  return () => {
    disposed = true;
    sw.removeEventListener('message', message);
    sw.removeEventListener('controllerchange', controller);
    doc.removeEventListener('visibilitychange', visible);
    cleanups.forEach((fn) => fn());
  };
}
