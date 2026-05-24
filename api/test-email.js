// 테스트용 - 결제 검증 없이 이메일 발송 테스트
// 나중에 삭제하거나 비활성화 가능

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'email 필요' });

  const testName = name || '테스트';

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
        max_tokens: 500,
        messages: [{ role: 'user', content: '안녕하세요! 테스트 메시지입니다. "천명당 이메일 테스트 성공!"이라고만 답해주세요.' }],
      }),
    });

    if (!claudeRes.ok) {
      return res.status(502).json({ error: 'Claude API 오류' });
    }

    const claudeData = await claudeRes.json();
    const testText = claudeData.content?.[0]?.text ?? '테스트 텍스트';

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: [email],
        subject: '[천명당] 이메일 테스트',
        html: `<div style="font-family:sans-serif;padding:40px;background:#f5f5f7"><div style="max-width:500px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;text-align:center"><div style="font-size:48px;margin-bottom:16px">✅</div><div style="font-size:20px;font-weight:900;color:#1C2B3A;margin-bottom:8px">이메일 발송 테스트 성공!</div><div style="font-size:14px;color:#666;line-height:1.8">${testText}</div><div style="margin-top:24px;font-size:12px;color:#aaa">천명당 테스트 메일</div></div></div>`,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      return res.status(502).json({ error: '이메일 발송 실패', detail: err });
    }

    return res.status(200).json({ success: true, message: `${email}로 테스트 메일 발송!` });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
