export default async function handler(req, res) {
  try {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey        = process.env.GROQ_API_KEY;
  const geminiKey      = process.env.GEMINI_API_KEY;
  const tmKey          = process.env.TICKETMASTER_API_KEY;
  const ebKey          = process.env.EVENTBRITE_API_KEY;

  const { type, messages, max_tokens = 2000, temperature = 0.7,
          location, lat, lng, dates } = req.body;

  // ── REAL EVENTS: Ticketmaster + Eventbrite ──────────────────────────────────
  if (type === "events" && location) {
    const results = { ticketmaster: [], eventbrite: [] };

    // Build date range from free days array
    const startDate = dates && dates[0] ? dates[0] : new Date().toISOString().split("T")[0];
    const endDate   = dates && dates.length > 1 ? dates[dates.length - 1] : startDate;

    // ── Ticketmaster ──────────────────────────────────────────────────────────
    if (tmKey) {
      try {
        const tmUrl = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
        tmUrl.searchParams.set("apikey", tmKey);
        tmUrl.searchParams.set("city",   location);
        tmUrl.searchParams.set("startDateTime", startDate + "T00:00:00Z");
        tmUrl.searchParams.set("endDateTime",   endDate   + "T23:59:59Z");
        tmUrl.searchParams.set("size", "20");
        tmUrl.searchParams.set("sort", "date,asc");
        tmUrl.searchParams.set("classificationName", "music,arts,family,sports,miscellaneous");

        const tmRes  = await fetch(tmUrl.toString());
        if (!tmRes.ok) throw new Error("TM " + tmRes.status);
        const tmData = await tmRes.json();
        const events = tmData?._embedded?.events || [];

        results.ticketmaster = events.map(ev => ({
          id:     ev.id,
          name:   ev.name,
          date:   ev.dates?.start?.localDate || startDate,
          time:   ev.dates?.start?.localTime
                    ? ev.dates.start.localTime.slice(0,5).replace(/^0/,"").replace(":",":")
                    : "Check details",
          venue:  ev._embedded?.venues?.[0]?.name || location,
          url:    ev.url || "",
          image:  ev.images?.[0]?.url || "",
          type:   mapTMClassification(ev.classifications?.[0]),
          source: "Ticketmaster",
          price:  ev.priceRanges
                    ? "$" + ev.priceRanges[0].min + (ev.priceRanges[0].max !== ev.priceRanges[0].min ? "–$" + ev.priceRanges[0].max : "")
                    : "Check site"
        }));
      } catch(e) {
        console.error("Ticketmaster error:", e.message);
      }
    }

    // ── Eventbrite ────────────────────────────────────────────────────────────
    if (ebKey) {
      try {
        const ebUrl = new URL("https://www.eventbriteapi.com/v3/events/search/");
        ebUrl.searchParams.set("token",                ebKey);
        ebUrl.searchParams.set("location.address",     location);
        ebUrl.searchParams.set("location.within",      "25mi");
        ebUrl.searchParams.set("start_date.range_start", startDate + "T00:00:00Z");
        ebUrl.searchParams.set("start_date.range_end",   endDate   + "T23:59:59Z");
        ebUrl.searchParams.set("expand", "venue,ticket_availability");
        ebUrl.searchParams.set("page_size", "20");

        const ebRes  = await fetch(ebUrl.toString(), {
          headers: { "Authorization": "Bearer " + ebKey }
        });
        if (!ebRes.ok) throw new Error("EB " + ebRes.status);
        const ebData = await ebRes.json();
        const events = ebData?.events || [];

        results.eventbrite = events.map(ev => ({
          id:     ev.id,
          name:   ev.name?.text || "Event",
          date:   ev.start?.local?.split("T")[0] || startDate,
          time:   ev.start?.local
                    ? formatTime12hr(ev.start.local.split("T")[1])
                    : "Check details",
          venue:  ev.venue?.name || ev.venue?.address?.city || location,
          url:    ev.url || "",
          image:  ev.logo?.url || "",
          description: ev.description?.text?.slice(0, 200) || ev.summary || "",
          type:   mapEBCategory(ev.category_id),
          source: "Eventbrite",
          price:  ev.is_free ? "Free" : "Check site"
        }));
      } catch(e) {
        console.error("Eventbrite error:", e.message);
      }
    }

    // Combine and deduplicate by name+date
    const allEvents  = [...results.ticketmaster, ...results.eventbrite];
    const seen       = new Set();
    const deduped    = allEvents.filter(ev => {
      const key = (ev.name + ev.date).toLowerCase().replace(/\s/g,"");
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    return res.status(200).json({ events: deduped, sources: ["ticketmaster","eventbrite"] });
  }

  // ── AI: Groq with Gemini fallback ──────────────────────────────────────────
  if (!groqKey && !geminiKey) {
    return res.status(500).json({ error: "No AI keys configured" });
  }

  if (groqKey) {
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", temperature, max_tokens, messages })
      });
      const data = await groqRes.json();
      const errMsg = data?.error?.message || "";
      const isLimit = groqRes.status === 429 || errMsg.toLowerCase().includes("rate") || errMsg.toLowerCase().includes("quota");
      if (groqRes.ok && !data.error) return res.status(200).json({ ...data, _provider: "groq" });
      if (!isLimit) return res.status(groqRes.status).json({ error: errMsg });
      console.log("Groq limit — falling back to Gemini");
    } catch(e) { console.log("Groq failed:", e.message); }
  }

  if (!geminiKey) return res.status(429).json({ error: "Groq limit reached, no Gemini key set" });

  try {
    const prompt = messages.map(m => m.content).join("\n\n");
    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature, maxOutputTokens:max_tokens} }) }
    );
    const gemData = await gemRes.json();
    if (!gemRes.ok || gemData.error) throw new Error(gemData?.error?.message || "Gemini error");
    const text = gemData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return res.status(200).json({ _provider:"gemini", choices:[{message:{content:text}}] });
  } catch(e) {
    return res.status(500).json({ error: "Both AI providers failed: " + e.message });
  }
  } catch(err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatTime12hr(timeStr) {
  if (!timeStr) return "Check details";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}

function mapTMClassification(cls) {
  if (!cls) return "Community";
  const seg = (cls.segment?.name || "").toLowerCase();
  const gen = (cls.genre?.name   || "").toLowerCase();
  if (seg.includes("music"))                    return "Music";
  if (seg.includes("sport"))                    return "Fitness";
  if (seg.includes("art") || seg.includes("theatre")) return "Arts";
  if (seg.includes("family"))                   return "Community";
  if (gen.includes("comedy") || gen.includes("social")) return "Social";
  return "Community";
}

function mapEBCategory(catId) {
  const MAP = {
    "103":"Music","108":"Fitness","105":"Arts","104":"Food",
    "107":"Learning","110":"Social","113":"Community",
    "115":"Outdoors","117":"Social","109":"Volunteer"
  };
  return MAP[String(catId)] || "Community";
}
