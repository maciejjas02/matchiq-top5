// Cloudflare Pages Function: GET /matches/:date
// Top 5 lig + najlepsze kursy 1X2 (EU + UK).
// Szeroki horyzont (DAYS_FROM) i czytelna diagnostyka w "meta".
// Cache edge tylko dla udanych odpowiedzi.

const LEAGUES = [
  { key: "soccer_epl",                name: "Premier League" },
  { key: "soccer_spain_la_liga",      name: "La Liga (Hiszpania)" },
  { key: "soccer_italy_serie_a",      name: "Serie A (Włochy)" },
  { key: "soccer_germany_bundesliga", name: "Bundesliga (Niemcy)" },
  { key: "soccer_france_ligue_one",   name: "Ligue 1 (Francja)" },
];

const TTL_SEC   = 600;  // 10 min
const DAYS_FROM = 21;   // ile dni do przodu pobieramy z The Odds API

export async function onRequest({ params, request, env }) {
  const date = (params?.date || "").trim(); // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Invalid date" }, 400);
  if (!env.ODDS_API_KEY)               return json({ error: "Missing ODDS_API_KEY" }, 500);

  const url      = new URL(request.url);
  const noCache  = url.searchParams.has("nocache");
  const cacheKey = new Request(`https://cache/matches/${date}`);

  // zwróć z edge cache (jeśli nie prosimy o pominięcie)
  if (!noCache) {
    const hit = await caches.default.match(cacheKey);
    if (hit) return hit;
  }

  const meta = { calls: [], errors: [] };
  const allDates = new Set();

  // pobieramy równolegle wszystkie ligi
  const results = await Promise.all(
    LEAGUES.map(async ({ key, name }) => {
      const api = `https://api.the-odds-api.com/v4/sports/${key}/odds` +
                  `?regions=eu,uk&markets=h2h&oddsFormat=decimal&daysFrom=${DAYS_FROM}` +
                  `&apiKey=${env.ODDS_API_KEY}`;

      const r = await fetch(api);
      meta.calls.push({
        league: name,
        status: r.status,
        remaining: r.headers.get("x-requests-remaining") || null
      });

      if (!r.ok) {
        meta.errors.push({ league: name, status: r.status });
        return null;
      }

      const games = await r.json();
      if (!Array.isArray(games)) return null;

      const dayMatches = [];
      for (const g of games) {
        const iso = g?.commence_time;
        if (!iso) continue;

        const day = iso.slice(0, 10);
        allDates.add(day);
        if (day !== date) continue;

        const best = bestOddsH2H(g);
        if (best) {
          dayMatches.push({
            home: g.home_team,
            away: g.away_team,
            utcDate: iso,
            odds: best,
          });
        }
      }

      return dayMatches.length ? { name, matches: dayMatches } : null;
    })
  );

  const leagues  = results.filter(Boolean);
  const nextDate = findNextDate(allDates, date);

  const payload = { date, nextDate, leagues, meta };

  // jeśli wszystkie ligi zwróciły błąd (np. 401/403/429) – nie cache’uj
  const allFailed = leagues.length === 0 && meta.errors.length === LEAGUES.length;

  const res = json(payload, allFailed ? 503 : 200, {
    "Cache-Control": allFailed
      ? "no-store"
      : `public, max-age=0, s-maxage=${TTL_SEC}`,
  });

  if (!allFailed && !noCache) {
    await caches.default.put(cacheKey, res.clone());
  }

  return res;
}

/** wybiera najlepsze kursy 1X2 z dostępnych bukmacherów */
function bestOddsH2H(game) {
  let home = 0, draw = 0, away = 0;
  const H = game.home_team, A = game.away_team;

  for (const bm of game.bookmakers || []) {
    const mkt = (bm.markets || []).find(m => m.key === "h2h");
    if (!mkt) continue;

    for (const o of mkt.outcomes || []) {
      const p = Number(o.price);
      if (!isFinite(p)) continue;

      if (o.name === H) home = Math.max(home, p);
      else if (o.name === A) away = Math.max(away, p);
      else if (/^draw$/i.test(o.name)) draw = Math.max(draw, p);
    }
  }

  return (home && draw && away) ? { home, draw, away } : null;
}

/** zwraca najbliższą datę >= from, dla której są dane w horyzoncie */
function findNextDate(allDates, from) {
  const arr = Array.from(allDates).filter(d => d >= from).sort();
  return arr[0] || null;
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}
