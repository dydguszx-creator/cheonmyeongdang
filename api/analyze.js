export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }

  try {
    let parsed;
    if (req.body) {
      parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } else {
      let raw = "";
      await new Promise((resolve, reject) => {
        req.on("data", chunk => { raw += chunk; });
        req.on("end", resolve);
        req.on("error", reject);
      });
      parsed = JSON.parse(raw);
    }

    const apiKey = (parsed.apiKey || "").replace(/[^\x20-\x7E]/g, "").trim();
    if (!apiKey) { res.status(400).json({ error: "missing apiKey" }); return; }

    const callAPI = async (prompt) => {
      if (!prompt) return "";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 8000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await response.json();
      if (data.content && data.content[0]) return data.content[0].text || "";
      if (data.error) return "[오류: " + data.error.message + "]";
      return "";
    };

    const prompts = [
      parsed.p1, parsed.p2, parsed.p3, parsed.p4, parsed.p5,
      parsed.p6, parsed.p7, parsed.p8, parsed.p9, parsed.p10
    ];

    const results = await Promise.all(prompts.map(p => callAPI(p || "")));
    const combined = results.filter(Boolean).join("\n\n");
    res.status(200).json({ combined });

  } catch(e) {
    res.status(200).json({ error: e.message });
  }
}
