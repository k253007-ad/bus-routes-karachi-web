# Konsi Bus Karachi website

This Vite and React app recreates the public navigation and route browsing flows of the Android app. It uses the app's original VectorDrawable bus illustrations, local route data, and mobile first layout.

## Run

```powershell
cd website
npm ci
npm run dev -- --port 2000
```

Open http://localhost:2000/. For a phone on the same Wi-Fi, use http://<computer-LAN-IP>:2000/ (find the Wi-Fi IPv4 address with `ipconfig`). Vite binds to 0.0.0.0; Windows Firewall must allow the development server on your private network. Run `npm test` for the client tests and `npm run build` to type check and create `dist/`.

## Deploy to Vercel

Set the project root directory to `website`. The included `vercel.json` selects Vite, runs `npm run build`, publishes `dist`, and rewrites app routes to `index.html` for direct links.

## Source and data

- `src/App.tsx`: screens and navigation.
- `src/data.ts`: route and stop parsing.
- `src/styles.css`: responsive appearance and themes.
- `public/images/`: artwork converted from Android VectorDrawables. Run `python scripts/convert_android_vectors.py` to regenerate it.
- `public/data/`: local route snapshot. Run `python refresh_data.py` to refresh the public dataset after validation.

The local data contains 65 routes and 571 stops as of 18 October 2026. It is not a live timetable or vehicle position feed. Saved items and display preferences stay on the device. The website and Android app share direct Firebase contribution forms, route updates, and the reviews client. Contributions are not queued offline. Live submissions need a Firebase Web key and the coordinated security-rule migration; reviews need the owner to restore HTTPS/CORS. See [BACKEND.md](BACKEND.md) for the verified service status. The in-page map needs a Maps key; without one it offers a Google Maps link.

## Google Maps directions

The route details page shows Reviews, Report Issue, and Share in one row with one full route map below. The in-page map draws every listed stop. Google Maps on mobile limits how many intermediate stops an external directions link can carry, so that link shows the route's endpoints and representative stops for long routes.

To display the Google map inside the page, create a Google Cloud project with billing, enable **Maps JavaScript API** and **Routes API**, then create a website-restricted API key. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_MAPS_API_KEY` to that key. Include both `http://localhost:2000/*` and `http://127.0.0.1:2000/*` in the key's allowed website referrers for local testing, then restart Vite. The browser key is included in client code, so restrict it to the sites you control. Without a key, the map area is a button that opens Google Maps.

1. Open [Google Cloud Console](https://console.cloud.google.com/), create or choose a project, and enable billing.
2. In **APIs & Services → Library**, enable **Maps JavaScript API** and **Routes API**.
3. In **APIs & Services → Credentials**, create an API key. Set **Application restrictions** to **Websites**, add the local referrers above, and restrict the key to those two APIs.
4. Save the key in `website/.env.local` as `VITE_GOOGLE_MAPS_API_KEY=your_key`, then restart the local server.

Google's [Routes Library setup](https://developers.google.com/maps/documentation/javascript/routes/start) lists the required APIs. A [Google Maps directions link](https://developers.google.com/maps/documentation/urls/get-started) can carry only three intermediate stops in a mobile browser, so it cannot open a long route with every stop. The in-page Google map is designed to draw all stops together when the API key is configured.

## Android release

See [the Android build guide](../android-app/README.md) for APK/AAB builds, tests, signing backup, and the Play Store handoff. Keep user-supplied artwork in `public/images/`; `dist/` is generated and replaced on builds. Do not regenerate the supplied SVGs from the old Android vectors unless intentionally restoring older artwork.

## Local configuration

Copy `.env.example` to `.env.local`, supply the required public client settings, and restart Vite. `.env.local` stays ignored. `VITE_` variables are bundled and readable by users; never put signing passwords, service-account JSON, administrator keys, or private server secrets in them. Configure the same public values in Vercel before building there.

## Map limitations and verification

All route stops remain listed even if Google Maps cannot load. With a configured key, a failed map offers **Retry map**, and each attempt cleans up prior layers/listeners. `tests/fixtures/map-retry.html` is a local Vite-only SDK fixture for failure/retry/unmount checks; it is not part of the production build. Google directions links are limited to three intermediate stops on mobile browsers and cannot represent every stop on long routes. This limitation is not fixed by having an API key.
