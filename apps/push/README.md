# Prayer reminders

The Pages frontend uses Web Push for all five prayers and opens the Sunni Adhan player when a notification is tapped. The audio streams from PrayTimes on demand. The service uses the same WASM engine, prayer adjustments, timezone and explicit Ramadan setting as the timetable. Each enabled device has its own Durable Object with one recurring alarm.

## Deployment

1. Install dependencies with `npm ci` in this directory. The Worker bundles the existing WASM from `apps/web/public/wasm`.
2. Configure `APP_ORIGIN` in `wrangler.jsonc` with the exact Pages origin. Provision `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` as Worker secrets or bindings. Use a persistent P-256 VAPID key pair and a contact URI, such as a `mailto:` address. Changing the key pair requires browsers to resubscribe.
3. Deploy the Worker with `npx wrangler deploy`. Set `NEXT_PUBLIC_PRAYER_PUSH_URL` to the Worker origin when building the Pages frontend. Deploy the generated root `dist/`.
4. Open the installed site, enable reminders and use **Send test notification** to check the device without waiting for a prayer time. An accepted test means the push provider accepted it. Check the phone to confirm delivery. iPhone requires an installed Home Screen web app. A tap opens the Adhan panel for manual playback.

The reminder service retains a browser subscription and calculation settings while enabled. Disabling removes them and cancels its alarm. Push delivery requires connectivity and permission and follows the phone's system sound settings. The offline prayer timetable is still available. Audio streaming needs connectivity.

Run `npm test` for the scheduling tests and `npm run build` for the Worker dry run. The root `scripts/test-offline.mjs` tests the built service worker, including handling and opening a prayer notification.
