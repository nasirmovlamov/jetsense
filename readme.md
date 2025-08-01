# 🛫 JetSense

**JetSense** is a local airspace monitoring assistant that tracks nearby flights in real time, summarizes them in natural language (via Gemini AI), reads them aloud using TTS, and sends you alerts on Telegram.

Built for aviation nerds, plane spotters, or anyone who wants to know **what's flying over their head right now** — with zero manual effort.

---

## 🚀 Features

- 🛰 Real-time flight tracking using Flightradar24 API
- 🗺 Distance filtering with geolocation support
- 🧠 Flight info summarized via Google Gemini AI (in Turkish)
- 🔊 Text-to-Speech narration (local voice output)
- 📩 Telegram bot notifications
- 🔁 Runs continuously, checks every X seconds
- 🛑 Avoids duplicates with flight ID memory

---

## 🧰 Technologies Used

- `flightradarapi` – Flight data access
- `say` – Text-to-Speech (TTS)
- `geolib` – Distance calculations
- `node-fetch` – API calls
- `node-telegram-bot-api` – Telegram integration
- `node-cron` – For potential scheduling
- `dotenv` – Secure environment config
- `airport-iata-codes` – Airport info
