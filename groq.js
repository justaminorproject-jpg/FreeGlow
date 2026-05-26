export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const groqKey   = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!groqKey && !geminiKey) {
    return res.status(500).json({ error: "No AI API keys configured on server" });
  }

  const { messages, max_tokens = 2000, temperature = 0.7 } = req.body;

  // ── Try Groq first ──────────────────────────────────────────────────────────
  if (groqKey) {
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature,
          max_tokens,
          messages
        })
      });

      const data = await groqRes.json();

      // Check for rate limit or token errors — fall through to Gemini
      const errMsg = data?.error?.message || "";
      const isRateLimit =
        groqRes.status === 429 ||
        errMsg.toLowerCase().includes("rate limit") ||
        errMsg.toLowerCase().includes("quota") ||
        errMsg.toLowerCase().includes("tokens") ||
        errMsg.toLowerCase().includes("capacity");

      if (groqRes.ok && !data.error) {
        // Success — return with provider tag
        return res.status(200).json({ ...data, _provider: "groq" });
      }

      if (!isRateLimit) {
        // Real error (bad key, bad request) — don't bother trying Gemini
        return res.status(groqRes.status).json({ error: errMsg || "Groq error" });
      }

      console.log("Groq limit hit, falling back to Gemini…");
    } catch (e) {
      console.log("Groq fetch failed:", e.message, "— trying Gemini…");
    }
  }

  // ── Fallback: Gemini ────────────────────────────────────────────────────────
  if (!geminiKey) {
    return res.status(429).json({ error: "Groq limit reached and no Gemini key configured" });
  }

  try {
    // Convert OpenAI-style messages to Gemini format
    const prompt = messages.map(m => m.content).join("\n\n");

    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: max_tokens
          }
        })
      }
    );

    const gemData = await gemRes.json();

    if (!gemRes.ok || gemData.error) {
      const msg = gemData?.error?.message || "Gemini error";
      return res.status(gemRes.status).json({ error: msg });
    }

    // Normalize Gemini response to OpenAI format so client code stays the same
    const text = gemData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return res.status(200).json({
      _provider: "gemini",
      choices: [{ message: { content: text } }]
    });

  } catch (e) {
    return res.status(500).json({ error: "Both Groq and Gemini failed: " + e.message });
  }
}
