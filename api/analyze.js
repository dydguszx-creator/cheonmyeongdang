module.exports = async function(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);
if (req.method === ‘OPTIONS’) { res.status(200).end(); return; }
if (req.method !== ‘POST’) { res.status(405).end(); return; }

try {
let parsed;
if (req.body) {
parsed = typeof req.body === ‘string’ ? JSON.parse(req.body) : req.body;
} else {
let raw = ‘’;
await new Promise((resolve, reject) => {
req.on(‘data’, chunk => raw += chunk);
req.on(‘end’, resolve);
req.on(‘error’, reject);
});
parsed = JSON.parse(raw);
}

```
const prompt = parsed.prompt;
const apiKey = (parsed.apiKey || '').replace(/[^\x20-\x7E]/g, '').trim();

if (!prompt || !apiKey) {
  res.status(400).json({ error: 'missing params' });
  return;
}

const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8096,
    messages: [{ role: 'user', content: prompt }]
  })
});

const data = await response.json();
res.status(200).json(data);
```

} catch(e) {
res.status(200).json({ error: e.message });
}
};
