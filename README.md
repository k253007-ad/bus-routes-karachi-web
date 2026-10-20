# Bus Routes Karachi web app

This Vite and React app recreates the public navigation and route browsing flows of the Android app. It uses the app's original VectorDrawable bus illustrations, local route data, and mobile first layout.

## Run

```powershell
cd website
npm ci
npm run dev
```

Open the local address printed by Vite. Run `npm run build` to type check and create `dist/`.

## Deploy to Vercel

Set the project root directory to `website`. The included `vercel.json` selects Vite, runs `npm run build`, publishes `dist`, and rewrites app routes to `index.html` for direct links.

## Source and data

- `src/App.tsx`: screens and navigation.
- `src/data.ts`: route and stop parsing.
- `src/styles.css`: responsive appearance and themes.
- `public/images/`: artwork converted from Android VectorDrawables. Run `python scripts/convert_android_vectors.py` to regenerate it.
- `public/data/`: local route snapshot. Run `python refresh_data.py` to refresh the public dataset after validation.

The local data contains 65 routes and 571 stops as of 18 October 2026. It is not a live timetable or vehicle position feed. Favorites and display preferences are stored in the browser. On the web, contributions open an email draft, and route maps open Google Maps. Android-only Firebase reviews and submissions need a deployed backend to work on a website.

## Google Maps directions

The route details page shows Reviews, Report Issue, and Share in one row with one full route map below. The in-page map draws every listed stop. Google Maps on mobile limits how many intermediate stops an external directions link can carry, so that link shows the route's endpoints and representative stops for long routes.

To display the Google map inside the page, create a Google Cloud project with billing, enable **Maps JavaScript API** and **Routes API**, then create a website-restricted API key. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_MAPS_API_KEY` to that key. Include both `http://localhost:2000/*` and `http://127.0.0.1:2000/*` in the key's allowed website referrers for local testing, then restart Vite. The browser key is included in client code, so restrict it to the sites you control. Without a key, the map area is a button that opens Google Maps.

1. Open [Google Cloud Console](https://console.cloud.google.com/), create or choose a project, and enable billing.
2. In **APIs & Services → Library**, enable **Maps JavaScript API** and **Routes API**.
3. In **APIs & Services → Credentials**, create an API key. Set **Application restrictions** to **Websites**, add the local referrers above, and restrict the key to those two APIs.
4. Save the key in `website/.env.local` as `VITE_GOOGLE_MAPS_API_KEY=your_key`, then restart the local server.

Google's [Routes Library setup](https://developers.google.com/maps/documentation/javascript/routes/start) lists the required APIs. A [Google Maps directions link](https://developers.google.com/maps/documentation/urls/get-started) can carry only three intermediate stops in a mobile browser, so it cannot open a long route with every stop. The in-page Google map is designed to draw all stops together when the API key is configured.
