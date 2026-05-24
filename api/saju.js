// 천명당 사주 API — 완성본
// saju.html에서 만든 프롬프트를 그대로 받아서 Claude에 전달

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: '프롬프트가 없습니다.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      res.write(`data: ${JSON.stringify({ error: err })}\n\n`);
      return res.end();
    }

    const reader = claudeRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            res.write(`data: ${JSON.stringify({ text: json.delta.text })}\n\n`);
          }
          if (json.type === 'message_stop') {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          }
        } catch {}
      }
    }
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  }

  res.end();
}

export const config = {
  runtime: 'nodejs',
  maxDuration: 300,
};
