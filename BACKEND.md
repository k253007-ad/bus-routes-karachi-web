# Konsi Bus Karachi backend

The website and Android APK share the same backend client. The APK bundles the
website and its initial route data; it does not need the development computer
to stay online.

## Existing services

- Firebase project: `busprojectmmd` (the original Android app's project).
- Public route reads: `db_version`, `route_list`, `stop_list`,
  `stops_on_a_route`. Reverse stop membership and direct journeys are derived
  from the validated route snapshot.
- Guest-authenticated contributions: `feedback`, `bus_feedback`,
  `stops_pending`. These collections are not read by the public app.
- Reviews: `https://api.rungpk.com/api/v1/`. The client's `routeId` query
  filter matches the supplied server controller, which ignores the old
  `/reviews/:routeId` path parameter.

Firebase's public client configuration is in `src/backend/config.ts`; this is
not an administrator credential. Guest authentication is loaded on the first
contribution. Firebase security rules remain authoritative. No service-account
key, administrator password, or reviews administrator key belongs in the app.

## Route updates and offline use

The app opens using its last validated saved snapshot, or the bundled files.
It checks for updates at startup, when returning to the app, when the connection
returns, and using **View Data → Check for Updates**. A changed database version
triggers a complete download with validation and a second version check. An
incomplete or inconsistent download cannot replace working routes.

Reports and route suggestions are sent directly, with guest identity and server
timestamps. They are not silently queued offline. A stable submission ID avoids
duplicate records on repeated taps. The form remains filled when a request
fails; success requires a matching server confirmation.

The security update sends one atomic root PATCH containing the submission and
its matching `submission_limits/{uid}/{collection}` record. Deploy the reviewed
rules in `security/database.rules.json` before enabling submissions. There is no
fallback to the old, weaker single-record protocol. See `security/README.md`
for migration, administrator access, and local emulator verification details.

## Reviews server action required

At verification on 2026-10-21, the original reviews server failed HTTPS
certificate verification because its certificate had expired. The server owner
must renew the certificate and configure the full certificate chain. The app
keeps certificate verification enabled and displays an unavailable message on
failure. Review requests are implemented, but live review reads/writes cannot
be verified until the certificate is repaired.

If CORS is restricted on that server, allow the actual app/website origins,
including `https://localhost` for the Capacitor Android app and
`https://bus-khi-routes.vercel.app` for the deployed website. Development uses
its own actual localhost/LAN origin. Do not add administrator keys to fix CORS.
If the server moves, set `VITE_REVIEWS_API_URL` to its HTTPS API base URL and
rebuild the website/APK.

## Firebase authentication configuration required

A read-only public Firebase Auth configuration request returned HTTP 403:
`Requests from this Android client application <empty> are blocked.` The only
client key present locally is restricted to the original Android client.
The React/Capacitor client must use a Firebase Web client key for the same
`busprojectmmd` project. The project owner should provide that public client
configuration, keep anonymous authentication enabled, and configure the key's
allowed referrers/API restrictions for the new app and website. Do not remove
restrictions from the original Android key or expose an administrator key.

Set the new public Web key in `website/.env.local`:

```dotenv
VITE_FIREBASE_API_KEY=<public-web-client-key-for-busprojectmmd>
```

Then rebuild the APK. Without this configuration, route browsing and public
route updates work, but authenticated contributions remain blocked by Google.
The app reports the failure and never pretends the submission was saved.

The server owner must also deploy the hardened submission rules described above.
These local changes do not alter the live project's Firebase rules.

## Verification

```powershell
cd website
npm ci
npm test
npm run build
npm audit
```

From `android-app`, run `npm run check:native` and `./build-android.ps1` to
rebuild and verify the signed APK. The output is `build/konis-bus.apk`.

Tests cover data consistency, version races, offline fallback, route lookup,
submission validation, confirmed writes, repeated taps, review contracts,
TLS-only configuration, service errors, and timeouts. They do not write test
feedback or reviews into the production services. A live Firebase route refresh
was verified separately; production contribution writes and Android device
behavior still require an end-to-end test on the target device.

## Skills used

Discovered with Vercel's `find-skills`: Google's `firebase-auth-basics` for guest
identity, and `obra/superpowers`' `requesting-code-review` for independent
sub-agent review. The installed `capacitor-app-development` skill guides the
existing Android wrapper, and `agent-browser` guides local UI verification.
