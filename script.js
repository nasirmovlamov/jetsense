// Required packages
// npm install node-fetch node-telegram-bot-api geolib node-cron
const { FlightRadar24API } = require("flightradarapi");
const frApi = new FlightRadar24API();
const say = require("say"); // ← TTS module
const airports = require("airport-iata-codes");
require("dotenv").config(); // Load .env vars

const fetch = require("node-fetch");
const TelegramBot = require("node-telegram-bot-api");
const geolib = require("geolib");
const cron = require("node-cron");

// === CONFIGURATION ===

console.log("process.env.LATITUDE", parseFloat(process.env.LATITUDE));
console.log("process.env.LONGITUDE", parseFloat(process.env.LONGITUDE));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = process.env.GEMINI_API_URL;
const YOUR_LOCATION = {
  latitude: parseFloat(process.env.LATITUDE),
  longitude: parseFloat(process.env.LONGITUDE),
};
const CHECK_INTERVAL_MS = 5000; // 5 seconds
const MAX_RADIUS_METERS = 17000; // 17 km

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
let notifiedPlanes = new Set();

// Gemini API'ye JSON'u açıklaması için gönder
async function convertJsonToReadableText(flights) {
  // Metni JSON string olarak Gemini'ye soruyoruz, Türkçe açıklama isteği ile
  const promptText = `Bu uçuş verisini Türkçe olarak çok kısa şekilde açıkla amma yalnızca ülke adlarını  ver ve bana ancak nerden nereye ve hangi hızla (km/h) gitdiyini ver başka hiç bir şey verme:\n\n${JSON.stringify(
    flights,
    null,
    2
  )}`;

  const body = {
    contents: [
      {
        parts: [
          {
            text: promptText,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(GEMINI_API_URL + `?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();

    // Gemini API response içeriği
    const readableText = data?.candidates?.[0]?.content || "Yanıt alınamadı";
    return readableText?.parts[0]?.text;
  } catch (error) {
    console.error("Gemini API hatası:", error);
    return null;
  }
}

function getDirectionFromHeading(heading) {
  if (heading == null) return "unknown direction";

  const directions = [
    "North",
    "North-East",
    "East",
    "South-East",
    "South",
    "South-West",
    "West",
    "North-West",
  ];
  const index = Math.round(heading / 45) % 8;
  return directions[index];
}

function getCountryByIata(iataCode) {
  console.log(iataCode);
  if (!iataCode) return "Unknown Country";
  const airport = airports(`${iataCode}`);
  console.log(airport);
  return airport ? airport[0]?.city : "Unknown Country";
}

async function speakFlightsSlowly(flights, index = 0) {
  console.log(flights[0]);
  if (index >= flights.length) return;

  const flight = flights[index];
  const readableText = await convertJsonToReadableText(flight);
  console.log("Readable text:", readableText);
  say.speak(readableText, "Yelda", 0.8, () => {
    setTimeout(() => speakFlightsSlowly(flights, index + 1), 4000);
  });
}

async function checkPlanes() {
  console.log("Checking for planes...");
  try {
    const bounds = frApi.getBoundsByPoint(
      YOUR_LOCATION.latitude,
      YOUR_LOCATION.longitude,
      MAX_RADIUS_METERS
    );

    const flights = await frApi.getFlights(null, bounds);
    // console.log("Detected flights:", flights.length);

    const newFlights = [];

    for (const flight of flights) {
      const {
        id,
        latitude,
        longitude,
        altitude,
        groundSpeed,
        heading,
        registration,
        number,
        airlineIata,
        originAirportIata,
        destinationAirportIata,
        callsign,
        aircraftCode,
      } = flight;

      if (!latitude || !longitude) continue;

      const distance =
        geolib.getDistance({ latitude, longitude }, YOUR_LOCATION) / 1000;
      if (distance <= MAX_RADIUS_METERS / 1000 && !notifiedPlanes.has(id)) {
        const direction = getDirectionFromHeading(heading);
        const name = callsign || number || "Unknown Flight";
        const fromCountry = getCountryByIata(originAirportIata);
        const toCountry = getCountryByIata(destinationAirportIata);

        newFlights.push({
          id,
          callsign: name,
          aircraft: aircraftCode || "N/A",
          registration: registration || "No Reg",
          airline: airlineIata || "Unknown",
          fromIata: originAirportIata || "?",
          toIata: destinationAirportIata || "?",
          fromCountry,
          toCountry,
          distance: Math.round(distance),
          altitude,
          speed: groundSpeed,
          direction,
        });
        await setTimeout(() => {}, 4000); // Throttle to avoid rate limits
        // Read aloud slowly
        speakFlightsSlowly(newFlights);
        notifiedPlanes.add(id);
      }
    }

    if (newFlights.length > 0) {
      // Prepare bulk message
      const message = newFlights
        .map(
          (f, i) => `✈️ *${f.callsign}* — ${f.fromIata} (${f.fromCountry}) → ${
            f.toIata
          } (${f.toCountry})  
Distance: ${f.distance} km | Alt: ${f.altitude || "?"} ft | Speed: ${
            f.speed || "?"
          } knots | Heading: ${f.direction}`
        )
        .join("\n\n");

      await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
        parse_mode: "Markdown",
      });
    }
  } catch (error) {
    console.error("❌ Error fetching flights:", error);
  }
}

checkPlanes();
setInterval(checkPlanes, CHECK_INTERVAL_MS);
