const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
app.use(cors());

// GET /sofa/2025-08-16
app.get("/sofa/:date", async (req, res) => {
  const date = req.params.date; // YYYY-MM-DD
  const url = `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${date}`;

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" } 
    });
    const text = await r.text(); // czasem text/plain
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Proxy działa: http://localhost:${PORT}/sofa/2025-08-16`)
);
