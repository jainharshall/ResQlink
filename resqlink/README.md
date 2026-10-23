# ResQLink prototype (offline-first PWA + Gemini)

## Run
1. Install Python 3.11+ then:  pip install -r requirements.txt
2. Optional Gemini (online answers):
   - Windows PowerShell:  $env:GEMINI_API_KEY="your_key"
   - Mac/Linux:           export GEMINI_API_KEY=your_key
   - Model defaults to gemini-flash-latest. Change with GEMINI_MODEL if needed.
3. Start:  uvicorn server:app --host 0.0.0.0 --port 8000
4. Open http://localhost:8000 in Chrome (F12, Ctrl+Shift+M for phone view).
5. Responder dashboard: http://localhost:8000/dashboard.html

## Test offline
Load the app once, then DevTools > Network > Offline and reload. Ask, shelters and SOS queue all still work.
SOS made offline shows PENDING and becomes SENT when you go back online.

## Shake-to-alert contacts
In the SOS tab, save up to five trusted contacts and enable shake alerts. A detected shake asks for confirmation before creating a live-location link and SMS drafts. Tap each contact's SMS button and send the message in your phone's messaging app; the browser cannot silently send SMS.

Live location requires internet access and location permission. Keep ResQLink open in the foreground for updates. The private link expires after one hour, and you can stop sharing sooner from the SOS tab. Motion sensors and location require HTTPS on phones (localhost is allowed for development).

## How it works
- Online + key: server retrieves the best guides, Gemini rewrites them using ONLY those guides.
- Offline / no key / Gemini error: the phone answers locally from the same guides (keyword retrieval).
- The API key stays on the server and is never sent to the browser.

## Notes
- Service worker needs HTTPS or localhost. For a phone, deploy behind HTTPS (Render, Vercel + backend, or ngrok).
- After editing static files, bump V in static/sw.js so browsers refresh the cache.
- shelters.json is DEMO data. Replace with real verified locations.
- Not built yet: phone-to-phone relay and a tile map (shelters use an offline radar view).
