const https = require('https');

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    // body 읽기 (스트리밍)
    let rawBody = '';
    await new Promise((resolve, reject) => {
      req.on('data', chunk => rawBody += chunk);
      req.on('end', resolve);
      req.on('error', reject);
    });

    const { prompt, apiKey } = JSON.parse(rawBody);
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
          catch(e) { reject(new Error('JSON parse error: ' + data.substring(0, 100))); }
        });
      });
      request.on('error', reject);
      request.setTimeout(55000, () => { request.destroy(); reject(new Error('timeout')); });
      request.write(body);
      request.end();
    });

    res.status(200).json(result);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
