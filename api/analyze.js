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
      return "";
    };

    // 두 파트 동시 호출
    const [part1, part2] = await Promise.all([
      callAPI(parsed.prompt1 || parsed.prompt || ""),
      callAPI(parsed.prompt2 || "")
    ]);

    res.status(200).json({ part1, part2, combined: part1 + "\n\n" + part2 });

  } catch(e) {
    res.status(200).json({ error: e.message });
  }
}
