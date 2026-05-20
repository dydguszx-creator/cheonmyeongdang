// =====================================================
// 천명당 사주 자동화 API — 스트리밍 버전 (짤림 완전 해결)
// Vercel Serverless Function — api/saju.js
//
// 스트리밍 방식: Claude 응답을 글자 단위로 바로 전송
// → Vercel 10초 타임아웃 무관, 짤림 없음
// =====================================================

export const config = {
  runtime: 'edge', // Edge Runtime: 타임아웃 없음 (최대 30분)
};

export default async function handler(req) {
  // CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST만 허용됩니다.' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { name, gender, cal, year, month, day, hour, minute, categories, saju } = await req.json();

  if (!name || !year || !month || !day) {
    return new Response(JSON.stringify({ error: '이름, 생년월일은 필수입니다.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 프롬프트 조립 ──────────────────────────────────
  const timeStr = hour ? `${hour}시 ${minute || '00'}분` : '미상';
  const catStr  = categories?.length ? categories.join(' / ') : '전체 분석';

  let sajuBlock = '';
  if (saju) {
    sajuBlock = `
[앱 자동계산 사주팔자 — 아래 8글자를 그대로 사용, 직접 계산 금지]
년주: ${saju.year} / 월주: ${saju.month} / 일주: ${saju.day} / 시주: ${saju.hour}
일간: ${saju.ilgan} / 오행분포: ${saju.ohaeng}
대운: ${saju.daewoon}`;
  }

  const prompt = `당신은 천명당(天命堂) 소속 30년 경력의 사주명리학 전문가입니다.

[고객 정보]
이름: ${name} / 성별: ${gender} / 생년월일: ${cal} ${year}년 ${month}월 ${day}일
출생시각: ${timeStr} / 특별 궁금한 점: ${catStr}
${sajuBlock}

[필수 원칙]
⛔ [앱 자동계산 사주팔자]가 있으면 그 8글자를 반드시 그대로 사용. 직접 계산 절대 금지.
- 전문가가 옆에서 설명해주듯 존댓말·자연스러운 문체
- 두루뭉술·일반론 절대 금지. 이 사주 구조에서만 나오는 말로.
- 섹션 1에서만 한자 허용. 섹션 2 이후 한자 금지, 쉬운 말로.
- 각 섹션 충분히 상세하게. 절대 요약·생략하지 말 것.
- 세운: 2026=丙午 2027=丁未 2028=戊申 2029=己酉 2030=庚戌

아래 9개 섹션을 순서대로 완전하게 작성하세요:

【1. 사주 구조 분석】
사주팔자 8글자 도표 · 오행 분포 · 신강/신약 판단 · 용신·희신·기신 도출 · 일간 성격 핵심 요약

【2. 타고난 성격·기질】
이 사람만의 기질을 구체적 생활 장면으로. 강점·약점·대인관계 패턴·스트레스 반응.

【3. 대운·세운 10년 흐름 (2026~2035)】
연도별 테마와 기회·위기 포인트. 중요 결정 타이밍 명시.

【4. 재물·직업운】
타고난 재물 구조 · 직장형/사업형 판단 · 이직·전직 최적 타이밍.

【5. 창업·사업 가능성과 시기】
창업 사주 여부 · 어울리는 업종 · 시작 타이밍 · 동업 적합성.

【6. 연애·결혼운】
배우자 자리 에너지 · 이상형 유형 · 인연 오는 시기 · 반복 연애 패턴과 극복법.

【7. 부모·자녀·가족 관계】
가족 내 역할 에너지 · 자녀 인연 시기 · 반복 패턴과 주의점.

【8. 건강·취약 부위】
취약 장기 · 조심해야 할 시기 · 맞춤 음식·운동·생활습관 조언.

【9. 개운법·생활 맞춤 조언】
용신 기반 색상·방향·음식·소품 · 복권 방향 · 오늘부터 실천 가능한 구체적 조언 5가지 이상.`;

  // ── Claude API 스트리밍 호출 ───────────────────────
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,   // 넉넉하게 — 스트리밍이라 짤릴 이유 없음
      stream: true,         // ← 스트리밍 ON
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    return new Response(JSON.stringify({ error: 'Claude API 오류', detail: err }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── SSE 스트림 변환: Claude → 브라우저 ──────────────
  // Claude가 보내는 SSE를 그대로 프론트에 중계
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
          const lines  = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              // 텍스트 델타만 추출해서 전송
              if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                const text = json.delta.text;
                // 프론트가 파싱하기 쉽게 JSON으로 감싸서 전송
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
              // 종료 시그널
              if (json.type === 'message_stop') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
              }
            } catch {
              // 파싱 불가 라인 무시
            }
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
      'X-Accel-Buffering': 'no', // Nginx 버퍼링 비활성화
    },
  });
}
