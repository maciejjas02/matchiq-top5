// server.js 

const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));  
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// === Configuration ===
require('dotenv').config();
const ODDS_API_KEY = process.env.ODDS_API_KEY;  
const ODDS_API_HOST = "https://api.the-odds-api.com/v4/sports";
const LEAGUES = [
    { key: "soccer_epl", name: "Premier League" },
    { key: "soccer_spain_la_liga", name: "La Liga (Hiszpania)" },
    { key: "soccer_italy_serie_a", name: "Serie A (Włochy)" },
    { key: "soccer_germany_bundesliga", name: "Bundesliga (Niemcy)" },
    { key: "soccer_france_ligue_one", name: "Ligue 1 (Francja)" }
];

app.use(express.static(path.join(__dirname, 'public')));

app.get('/matches/:date', async (req, res) => {
    const dateStr = req.params.date; 
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)){
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }

    try {
        const fetchPromises = LEAGUES.map(league => {
            const url = `${ODDS_API_HOST}/${league.key}/odds?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${ODDS_API_KEY}`;
            return fetch(url).then(response => response.json())
                              .then(data => ({ league: league.name, data }));
        });
        const results = await Promise.all(fetchPromises);


        const responseData = { date: dateStr, leagues: [] };
        results.forEach(result => {
            const leagueName = result.league;
            const games = result.data;
            if (!games || games.length === 0) return;  // no matches
            const matches = [];
            games.forEach(game => {
                if (!game.commence_time) return;
                const gameDate = game.commence_time.slice(0, 10);
                if (gameDate !== dateStr) return;
                const homeTeam = game.home_team;
                const awayTeam = game.away_team;
                let homeOdd = null, drawOdd = null, awayOdd = null;
                if (game.bookmakers && game.bookmakers.length > 0) {
                    let oddsFound = false;
                    for (const bookmaker of game.bookmakers) {
                        if (bookmaker.key === "pinnacle" || !oddsFound) {
                            const markets = bookmaker.markets || [];
                            const h2hMarket = markets.find(m => m.key === "h2h");
                            if (h2hMarket && h2hMarket.outcomes) {
                                h2hMarket.outcomes.forEach(outcome => {
                                    if (outcome.name === homeTeam) homeOdd = outcome.price;
                                    else if (outcome.name === awayTeam) awayOdd = outcome.price;
                                    else if (outcome.name.toLowerCase() === "draw") drawOdd = outcome.price;
                                });
                                oddsFound = true;
                                break;
                            }
                        }
                    }
                }
                if (homeOdd !== null && awayOdd !== null && drawOdd !== null) {
                    matches.push({
                        home: homeTeam,
                        away: awayTeam,
                        utcDate: game.commence_time, 
                        odds: {
                            home: homeOdd,
                            draw: drawOdd,
                            away: awayOdd
                        }
                    });
                }
            });
            if (matches.length > 0) {
                responseData.leagues.push({
                    name: leagueName,
                    matches: matches
                });
            }
        });

        res.json(responseData);
    } catch (err) {
        console.error("Error fetching odds data:", err);
        res.status(500).json({ error: "Failed to fetch match data" });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
