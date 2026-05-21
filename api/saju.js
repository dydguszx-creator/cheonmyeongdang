

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST만 허용됩니다.' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const { name, gender, cal, year, month, day, hour, minute, categories, saju } = await req.json();
  if (!name || !year || !month || !day) return new Response(JSON.stringify({ error: '필수값 누락' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const timeStr = hour ? `${hour}시 ${minute || '00'}분` : '미상';
  const catStr = categories?.length ? categories.join(' / ') : '전체 분석';
  let sajuBlock = '';
  if (saju) {
    sajuBlock = `\n[앱 자동계산 사주팔자]\n년주: ${saju.year} / 월주: ${saju.month} / 일주: ${saju.day} / 시주: ${saju.hour}\n일간: ${saju.ilgan} / 오행: ${saju.ohaeng}\n대운: ${saju.daewoon}`;
  }

  const prompt = `당신은 천명당(天命堂) 소속 30년 경력의 사주명리학 전문가입니다.

[고객 정보]
이름: ${name} / 성별: ${gender} / 생년월일: ${cal} ${year}년 ${month}월 ${day}일
출생시각: ${timeStr} / 궁금한 것: ${catStr}${sajuBlock}

[원칙] 전문가처럼 존댓말로. 두루뭉술 금지. 이 사주에서만 나오는 말로.
섹션 1에서만 한자 허용. 각 섹션 충분히 상세하게. 절대 요약하지 말 것.

아래 9개 섹션을 순서대로 완전하게 작성하세요:
【1. 사주 구조 분석】사주팔자 도표·오행 분포·신강신약·용신희신기신
【2. 타고난 성격·기질】구체적 생활 장면으로. 강점·약점·대인관계.
【3. 대운·세운 10년 흐름】연도별 기회·위기·중요 결정 타이밍.
【4. 재물·직업운】재물 구조·직장형/사업형·이직 타이밍.
【5. 창업·사업 가능성】창업 여부·어울리는 업종·시작 타이밍.
【6. 연애·결혼운】배우자 자리·이상형·인연 시기·반복 패턴.
【7. 부모·자녀·가족】가족 역할·자녀 인연·주의 패턴.
【8. 건강·취약 부위】취약 장기·조심할 시기·맞춤 조언.
【9. 개운법·맞춤 조언】용신 기반 색상·방향·음식·오늘 실천 조언 5가지 이상.`;

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
    return new Response(JSON.stringify({ error: 'Claude API 오류', detail: err }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = claudeRes.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: json.delta.text })}\n\n`));
              }
              if (json.type === 'message_stop') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
              }
            } catch {}
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
