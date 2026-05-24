// 천명당 결제 검증 + 이메일 자동 발송 API (포트원 V1)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });

  const { paymentId, name, gender, cal, year, month, day, hour, min, categories, email } = req.body;

  if (!paymentId || !email || !name || !year || !month || !day) {
    return res.status(400).json({ error: '필수값이 누락됐습니다.' });
  }

  try {
    // ── 1. 포트원 V1 액세스 토큰 발급 ──
    const tokenRes = await fetch('https://api.iamport.kr/users/getToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imp_key: process.env.PORTONE_API_KEY,
        imp_secret: process.env.PORTONE_API_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      return res.status(502).json({ error: '포트원 인증 실패' });
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.response?.access_token;

    if (!accessToken) {
      return res.status(502).json({ error: '토큰 발급 실패' });
    }

    // ── 2. 결제 정보 조회 및 검증 ──
    const paymentRes = await fetch(`https://api.iamport.kr/payments/${paymentId}`, {
      headers: { 'Authorization': accessToken },
    });

    if (!paymentRes.ok) {
      return res.status(502).json({ error: '결제 조회 실패' });
    }

    const paymentData = await paymentRes.json();
    const payment = paymentData.response;

    if (!payment) {
      return res.status(400).json({ error: '결제 정보를 찾을 수 없습니다.' });
    }

    // 결제 상태 확인
    if (payment.status !== 'paid') {
      return res.status(400).json({ error: '결제가 완료되지 않았습니다.', status: payment.status });
    }

    // 금액 검증 (14,000원)
    if (payment.amount !== 14000) {
      return res.status(400).json({ error: '결제 금액이 올바르지 않습니다.' });
    }

    // ── 3. Claude 분석 ──
    const timeStr = hour ? `${hour}시 ${min || '00'}분` : '미상';
    const catStr = categories?.length ? categories.join(' / ') : '전체 분석';

    const prompt = `당신은 천명당(天命堂) 소속 30년 경력의 사주명리학 전문가입니다.
아래 고객 정보를 바탕으로 9개 섹션을 순서대로 분석해주세요.

[고객 정보]
이름: ${name} / 성별: ${gender} / 생년월일: ${cal} ${year}년 ${month}월 ${day}일
출생시각: ${timeStr} / 궁금한 것: ${catStr}

[작성 원칙]
- 전문가가 고객 옆에서 직접 말해주듯 존댓말로 자연스럽게.
- 두루뭉술·일반론 절대 금지. 본인 사주에서만 나올 수 있는 말로.
- 섹션 1에서만 한자 허용. 섹션 2 이후 한자 절대 금지.
- 각 섹션 최소 1,500자 이상. 전체 최소 20,000자 이상.
- 세운 간지: 2026=병오 2027=정미 2028=무신 2029=기유 2030=경술

【1. 사주 구조 분석】사주팔자 도표·오행 분포·신강신약·용신희신기신
【2. 타고난 성격·기질】본인만의 기질을 구체적 생활 장면으로. 강점·약점·대인관계.
【3. 대운 흐름 분석】전체 대운 목록·현재 대운 상세·지금 해야 할 행동.
【4. 재물·직업운】재물 구조·직장형/사업형·이직 타이밍.
【5. 창업·사업 가능성】창업 여부·어울리는 업종·시작 타이밍.
【6. 연애·결혼운】배우자 자리·이상형·인연 시기·반복 패턴.
【7. 부모·자녀·가족】가족 역할·자녀 인연·주의 패턴.
【8. 건강·취약 부위】취약 장기·조심할 시기·맞춤 조언.
【9. 연도별 세운 분석 (2026~2035)】각 연도를 반드시 아래 형식으로:

### 🗓️ YYYY년 간지년
💰 재물·직업: (상세 내용)
❤️ 연애·가족: (상세 내용)
🌿 건강 주의: (상세 내용)
✨ 핵심 키워드: 키워드1 / 키워드2 / 키워드3
📝 총평: 이 해 전반 분위기.
행동 조언: 구체적 행동.`;

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
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      return res.status(502).json({ error: 'Claude API 오류' });
    }

    const claudeData = await claudeRes.json();
    const analysisText = claudeData.content?.[0]?.text ?? '';

    // ── 4. 이메일 발송 ──
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    const emailHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${name}님의 사주 분석 보고서</title>
<style>
  body { font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; background: #f5f5f7; margin: 0; padding: 20px; }
  .wrap { max-width: 680px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .cover { background: linear-gradient(160deg, #0d1a26, #050c12); padding: 48px 36px; text-align: center; }
  .cover-badge { font-size: 11px; letter-spacing: 4px; color: #C9A84C; margin-bottom: 16px; }
  .cover-title { font-size: 26px; font-weight: 900; color: #fff; line-height: 1.5; margin-bottom: 24px; }
  .cover-title em { color: #C9A84C; font-style: normal; }
  .cover-info { background: rgba(201,168,76,0.08); border: 1px solid rgba(201,168,76,0.2); border-radius: 12px; padding: 18px 24px; display: inline-block; text-align: left; min-width: 240px; }
  .cover-row { display: flex; gap: 14px; margin-bottom: 7px; font-size: 13px; }
  .cover-row:last-child { margin-bottom: 0; }
  .cover-key { color: #C9A84C; width: 56px; flex-shrink: 0; }
  .cover-val { color: #c0d0da; }
  .cover-date { font-size: 10px; color: #2a4050; letter-spacing: 2px; margin-top: 18px; }
  .body { padding: 36px; }
  .sec-body { font-size: 14px; line-height: 2.1; color: #333; word-break: keep-all; white-space: pre-wrap; }
  .footer { background: #0a1420; padding: 28px 36px; text-align: center; }
  .footer-brand { font-size: 15px; font-weight: 700; color: #C9A84C; letter-spacing: 2px; margin-bottom: 6px; }
  .footer-text { font-size: 11px; color: #3d5a6c; line-height: 2; }
</style>
</head>
<body>
<div class="wrap">
  <div class="cover">
    <div class="cover-badge">✦ CHEONMYEONGDANG · 天命堂</div>
    <div class="cover-title">${name} 님의<br/><em>사주 명리 분석 보고서</em></div>
    <div class="cover-info">
      <div class="cover-row"><span class="cover-key">성 명</span><span class="cover-val">${name}</span></div>
      <div class="cover-row"><span class="cover-key">성 별</span><span class="cover-val">${gender}</span></div>
      <div class="cover-row"><span class="cover-key">생년월일</span><span class="cover-val">${cal} ${year}년 ${month}월 ${day}일</span></div>
      <div class="cover-row"><span class="cover-key">출생시각</span><span class="cover-val">${timeStr}</span></div>
    </div>
    <div class="cover-date">발행일 · ${today}</div>
  </div>
  <div class="body">
    <div class="sec-body">${analysisText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>')}</div>
  </div>
  <div class="footer">
    <div class="footer-brand">天命堂 천명당</div>
    <div class="footer-text">천명당은 당신의 방향을 응원합니다 🌙<br/>본 보고서는 사주명리학 전통 이론에 기반한 참고 자료입니다.</div>
  </div>
</div>
</body>
</html>`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: [email],
        subject: `[천명당] ${name}님의 사주 분석 보고서가 도착했습니다 🌙`,
        html: emailHtml,
      }),
    });

    if (!resendRes.ok) {
      return res.status(502).json({ error: '이메일 발송 실패' });
    }

    return res.status(200).json({
      success: true,
      message: `${email}로 보고서를 발송했습니다.`,
    });

  } catch (e) {
    console.error('서버 오류:', e);
    return res.status(500).json({ error: '서버 오류', detail: e.message });
  }
}
