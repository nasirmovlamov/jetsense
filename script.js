// Required packages

const { FlightRadar24API } = require("flightradarapi");
const frApi = new FlightRadar24API();
const say = require("say"); // ← TTS module
const airports = require("airport-iata-codes");
const fetch = require("node-fetch");
const TelegramBot = require("node-telegram-bot-api");
const geolib = require("geolib");
require("dotenv").config(); // Load .env vars

// === CONFIGURATION ===
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

async function convertJsonToReadableText(flights) {
  const promptText = `Bana yalnızca nerden nereye tam ülke adları ile ver başka hiç bir şey verme:\n\n${JSON.stringify(
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
  if (!iataCode) return "Unknown Country";
  const airport = airports(`${iataCode}`);
  return airport ? airport[0]?.city : "Unknown Country";
}

async function speakFlightsSlowly(flights, index = 0) {
  if (index >= flights.length) return;

  const flight = flights[index];
  const readableText = await convertJsonToReadableText(flight);
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
