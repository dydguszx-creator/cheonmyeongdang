const https = require(‘https’);

module.exports = async function(req, res) {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);
if (req.method === ‘OPTIONS’) { res.status(200).end(); return; }
if (req.method !== ‘POST’) { res.status(405).json({ error: ‘not allowed’ }); return; }

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
const { prompt } = parsed;
// API 키 정리 - 공백, 줄바꿈, 특수문자 제거
const apiKey = (parsed.apiKey || '').replace(/[\s\r\n\t\u200b\ufeff]/g, '').trim();

if (!prompt || !apiKey) { res.status(400).json({ error: 'missing params' }); return; }

const body = JSON.stringify({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 8096,
  messages: [{ role: 'user', content: prompt }]
});

const result = await new Promise((resolve, reject) => {
  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body)
    }
  };
  const request = https.request(options, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch(e) { resolve({ error: 'parse error' }); }
    });
  });
  request.on('error', (e) => resolve({ error: e.message }));
  request.setTimeout(55000, () => { request.destroy(); resolve({ error: 'timeout' }); });
  request.write(body);
  request.end();
});

res.status(200).json(result);
```

} catch(e) {
res.status(200).json({ error: e.message });
}
};
