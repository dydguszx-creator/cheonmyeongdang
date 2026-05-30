// 천명당 사주 API — 완성본
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

  // 클라이언트 연결 끊김 감지
  let clientGone = false;
  req.on('close', () => { clientGone = true; });

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
      res.end();
      return;
    }

    const reader = claudeRes.body.getReader();
    const decoder = new TextDecoder();
    let doneSent = false;

    while (true) {
      if (clientGone) break; // 클라이언트가 끊기면 스트림 중단
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            if (!clientGone) res.write(`data: ${JSON.stringify({ text: json.delta.text })}\n\n`);
          }
          if (json.type === 'message_stop') {
            if (!clientGone) res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            doneSent = true;
          }
          // 에러 이벤트도 처리
          if (json.type === 'error') {
            if (!clientGone) res.write(`data: ${JSON.stringify({ error: json.error?.message || '알 수 없는 오류' })}\n\n`);
          }
        } catch {}
      }
    }

    // 스트림이 done 신호 없이 끝났을 때 방어
    if (!doneSent && !clientGone) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    }

  } catch (e) {
    if (!clientGone) {
      res.write(`data: ${JSON.stringify({ error: e.message || '서버 오류' })}\n\n`);
    }
  }

  res.end();
}

export const config = {
  runtime: 'nodejs',
  maxDuration: 300,
};
