module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  
  // body 읽기
  let body = '';
  try {
    if (req.body) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    } else {
      await new Promise((resolve) => {
        req.on('data', chunk => body += chunk);
        req.on('end', resolve);
      });
    }
    const parsed = JSON.parse(body);
    res.status(200).json({ 
      ok: true, 
      hasPrompt: !!parsed.prompt, 
      hasKey: !!parsed.apiKey,
      keyStart: parsed.apiKey ? parsed.apiKey.substring(0, 10) : 'none'
    });
  } catch(e) {
    res.status(500).json({ error: e.message, body: body.substring(0, 100) });
  }
};
