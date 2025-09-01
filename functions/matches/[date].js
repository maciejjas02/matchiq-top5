// Cloudflare Pages Function: GET /matches/:date
// Zwraca mecze Top 5 lig + najlepsze kursy 1X2 (EU region) z The Odds API
// Używa cache edge (Cloudflare) żeby nie zjadać limitu API

const LEAGUES = [
  { key: "soccer_epl",                 name: "Premier League" },
  { key: "soccer_spain_la_liga",       name: "La Liga (Hiszpania)" },
  { key: "soccer_italy_serie_a",       name: "Serie A (Włochy)" },
  { key: "soccer_germany_bundesliga",  name: "Bundesliga (Niemcy)" },
  { key: "soccer_france_ligue_one",    name: "Ligue 1 (Francja)" },
];

const TTL_SEC = 600; // 10 min cache na edge

export async function onRequest({ params, request, env }) {
  try {
    const date = (params?.date || "").trim(); // YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ error: "Invalid date format. Use YYYY-MM-DD." }, 400);
    }
    if (!env.ODDS_API_KEY) {
      return json({ error: "Missing ODDS_API_KEY in environment." }, 500);
    }

    // Cache (pomiń jeśli ?nocache=1)
    const url = new URL(request.url);
    const noCache = url.searchParams.has("nocache");
    const cacheKey = new Request(`https://cache.internal/matches/${date}`);
    if (!noCache) {
      const cached = await caches.default.match(cacheKey);
      if (cached) return cached;
    }

    // Pobierz ligi równolegle
    const leagues = await Promise.all(
      LEAGUES.map(async ({ key, name }) => {
        const api = `https://api.the-odds-api.com/v4/sports/${key}/odds?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${env.ODDS_API_KEY}`;
        const r = await fetch(api);
        if (!r.ok) return null;
        const games = await r.json();

        const matches = [];
        for (const g of games || []) {
          const start = g?.commence_time;
          if (!start || start.slice(0, 10) !== date) continue;

          const best = bestOddsH2H(g);
          if (!best) continue;

          matches.push({
            home: g.home_team,
            away: g.away_team,
            utcDate: start,          // ISO UTC
            odds: best               // {home, draw, away} – MAX po wszystkich bukach
          });
        }
        return matches.length ? { name, matches } : null;
      })
    );

    const payload = {
      date,
      leagues: leagues.filter(Boolean) // usuń puste
    };

    const res = json(payload, 200, {
      "Cache-Control": `public, max-age=0, s-maxage=${TTL_SEC}`
    });
    // Zapis do cache edge
    await caches.default.put(cacheKey, res.clone());
    return res;
  } catch (e) {
    return json({ error: "Internal error", detail: String(e) }, 500);
  }
}

function bestOddsH2H(game) {
  let home = 0, draw = 0, away = 0;
  const hName = game.home_team;
  const aName = game.away_team;

  for (const bm of game.bookmakers || []) {
    const mkt = (bm.markets || []).find(m => m.key === "h2h");
    if (!mkt) continue;
    for (const o of mkt.outcomes || []) {
      const price = Number(o.price);
      if (!isFinite(price)) continue;
      if (o.name === hName) home = Math.max(home, price);
      else if (o.name === aName) away = Math.max(away, price);
      else if (/^draw$/i.test(o.name)) draw = Math.max(draw, price);
    }
  }
  if (home && draw && away) return { home, draw, away };
  return null;
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extra
    }
  });
}
