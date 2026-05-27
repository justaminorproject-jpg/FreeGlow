export default async function handler(req, res) {

  // Always return JSON — never let an HTML error escape
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const groqKey   = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const tmKey     = process.env.TICKETMASTER_API_KEY;
  const ebKey     = process.env.EVENTBRITE_API_KEY;

  const body = req.body || {};
  const { type, messages, max_tokens = 2000, temperature = 0.7, location, dates } = body;

  // ── REAL EVENTS: Ticketmaster + Eventbrite ──────────────────────────────────
  if (type === "events" && location) {
    const results = [];
    const startDate = (dates && dates[0])                   || new Date().toISOString().split("T")[0];
    const endDate   = (dates && dates[dates.length - 1])    || startDate;

    // Ticketmaster
    if (tmKey) {
      try {
        const url = "https://app.ticketmaster.com/discovery/v2/events.json"
          + "?apikey=" + tmKey
          + "&city="   + encodeURIComponent(location)
          + "&startDateTime=" + startDate + "T00:00:00Z"
          + "&endDateTime="   + endDate   + "T23:59:59Z"
          + "&size=20&sort=date,asc";
        const r = await fetch(url);
        if (r.ok) {
          const d = await r.json();
          const evs = (d._embedded && d._embedded.events) || [];
          evs.forEach(function(ev) {
            results.push({
              id:     ev.id,
              name:   ev.name,
              date:   (ev.dates && ev.dates.start && ev.dates.start.localDate) || startDate,
              time:   (ev.dates && ev.dates.start && ev.dates.start.localTime)
                        ? fmtTime(ev.dates.start.localTime) : "Check details",
              venue:  (ev._embedded && ev._embedded.venues && ev._embedded.venues[0] && ev._embedded.venues[0].name) || location,
              url:    ev.url || "",
              type:   tmCategory(ev.classifications && ev.classifications[0]),
              source: "Ticketmaster",
              price:  (ev.priceRanges && ev.priceRanges[0])
                        ? "$" + ev.priceRanges[0].min : "Check site",
              description: ""
            });
          });
        }
      } catch(e) { console.error("TM error:", e.message); }
    }

    // Eventbrite
    if (ebKey) {
      try {
        const url = "https://www.eventbriteapi.com/v3/events/search/"
          + "?location.address=" + encodeURIComponent(location)
          + "&location.within=25mi"
          + "&start_date.range_start=" + startDate + "T00:00:00Z"
          + "&start_date.range_end="   + endDate   + "T23:59:59Z"
          + "&expand=venue,ticket_availability&page_size=20";
        const r = await fetch(url, { headers: { "Authorization": "Bearer " + ebKey } });
        if (r.ok) {
          const d = await r.json();
          const evs = d.events || [];
          evs.forEach(function(ev) {
            var start = (ev.start && ev.start.local) || "";
            results.push({
              id:     ev.id,
              name:   (ev.name && ev.name.text) || "Event",
              date:   start ? start.split("T")[0] : startDate,
              time:   start ? fmtTime(start.split("T")[1]) : "Check details",
              venue:  (ev.venue && ev.venue.name) || location,
              url:    ev.url || "",
              type:   ebCategory(ev.category_id),
              source: "Eventbrite",
              price:  ev.is_free ? "Free" : "Check site",
              description: (ev.summary || "")
            });
          });
        }
      } catch(e) { console.error("EB error:", e.message); }
    }

    // Deduplicate
    var seen = {};
    var deduped = results.filter(function(ev) {
      var key = (ev.name + ev.date).toLowerCase().replace(/\s/g,"");
      if (seen[key]) return false;
      seen[key] = true; return true;
    });

    return res.status(200).json({ events: deduped });
  }

  // ── AI: Groq → Gemini fallback ─────────────────────────────────────────────
  if (!messages || !messages.length) {
    return res.status(400).json({ error: "No messages provided" });
  }

  // Try Groq
  if (groqKey) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + groqKey },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", temperature, max_tokens, messages })
      });
      const d = await r.json();
      const errMsg = (d.error && d.error.message) || "";
      const isLimit = r.status === 429
        || errMsg.toLowerCase().includes("rate")
        || errMsg.toLowerCase().includes("quota");
      if (r.ok && !d.error) return res.status(200).json(Object.assign({}, d, { _provider: "groq" }));
      if (!isLimit) return res.status(r.status).json({ error: errMsg || "Groq error" });
      console.log("Groq limit hit — trying Gemini");
    } catch(e) { console.error("Groq fetch error:", e.message); }
  }

  // Try Gemini
  if (geminiKey) {
    try {
      var prompt = messages.map(function(m){ return m.content; }).join("\n\n");
      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + geminiKey,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: temperature, maxOutputTokens: max_tokens } }) }
      );
      const d = await r.json();
      if (!r.ok || d.error) throw new Error((d.error && d.error.message) || "Gemini error");
      var text = (d.candidates && d.candidates[0] && d.candidates[0].content
                  && d.candidates[0].content.parts && d.candidates[0].content.parts[0]
                  && d.candidates[0].content.parts[0].text) || "";
      return res.status(200).json({ _provider: "gemini", choices: [{ message: { content: text } }] });
    } catch(e) {
      return res.status(500).json({ error: "Gemini error: " + e.message });
    }
  }

  return res.status(500).json({ error: "No AI keys configured on server" });
}

function fmtTime(t) {
  if (!t) return "Check details";
  var parts = t.split(":");
  var h = parseInt(parts[0]), m = parseInt(parts[1]) || 0;
  var ampm = h >= 12 ? "PM" : "AM";
  return (h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
}

function tmCategory(cls) {
  if (!cls) return "Community";
  var seg = ((cls.segment && cls.segment.name) || "").toLowerCase();
  if (seg.includes("music"))  return "Music";
  if (seg.includes("sport"))  return "Fitness";
  if (seg.includes("art") || seg.includes("theatre")) return "Arts";
  if (seg.includes("family")) return "Community";
  return "Social";
}

function ebCategory(id) {
  var MAP = {"103":"Music","108":"Fitness","105":"Arts","104":"Food",
             "107":"Learning","110":"Social","113":"Community",
             "115":"Outdoors","117":"Social","109":"Volunteer"};
  return MAP[String(id)] || "Community";
}
