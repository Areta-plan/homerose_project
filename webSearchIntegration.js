// src/services/webSearch.js
// Google Custom Search 기반 실시간 웹 검색 유틸
// 환경변수: GOOGLE_API_KEY, GOOGLE_CX_ID
const fetch = require('node-fetch');

async function webSearch(query, numResults = 3) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx     = process.env.GOOGLE_CX_ID;
  if (!apiKey || !cx) {
    throw new Error('환경변수 GOOGLE_API_KEY 또는 GOOGLE_CX_ID가 설정되지 않았습니다.');
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${numResults}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google CSE Error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data.items) return [];

  return data.items.map(item => ({
    title:   item.title,
    snippet: item.snippet,
    link:    item.link
  }));
}

module.exports = { webSearch };


// src/services/chatService.js
const OpenAI = require('openai');
const { SYSTEM_PROMPT } = require('../prompts');
const { getTopKChunksByCategory } = require('../vectorStore');
const { webSearch } = require('./webSearch');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 주제와 모드(knowledge|story)를 받아
 * RAG + WebSearch를 결합해 블로그 글을 생성
 */
async function handleBlogRequest({ topic, mode, userParams }) {
  // 1) Web Search
  const results = await webSearch(`${topic} 최신 트렌드`, 3);
  const searchContext = results
    .map((r, i) => `${i+1}. ${r.title}\n${r.snippet}\n(${r.link})`)
    .join('\n\n');

  // 2) 쿼리 임베딩
  const { data } = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: topic
  });
  const emb = data[0].embedding;

  // 3) 모듈별 RAG 컨텍스트
  const titlesCtx   = getTopKChunksByCategory(emb, 'titles', 3).join('\n\n');
  const introCtx    = getTopKChunksByCategory(emb, 'intro', 3).join('\n\n');
  const mainKey     = mode === 'story' ? 'mainStory' : 'mainKnowledge';
  const mainCtx     = getTopKChunksByCategory(emb, mainKey, 3).join('\n\n');
  const strengthCtx = getTopKChunksByCategory(emb, 'strength', 3).join('\n\n');
  const closingCtx  = getTopKChunksByCategory(emb, 'closing', 3).join('\n\n');

  // 4) 시스템 프롬프트 조립
  const systemPrompt = `
${SYSTEM_PROMPT}

---
[Web Search Results]\n${searchContext}

1) [5 Compelling Titles 참고 자료]\n${titlesCtx}

2) [First Paragraph 참고 자료]\n${introCtx}

3) [Main Content (${mode}) 참고 자료]\n${mainCtx}

4) [Brand Strength Highlight 참고 자료]\n${strengthCtx}

5) [Emotional/Impactful Closing 참고 자료]\n${closingCtx}

위 순서와 자료만 참고해서, 아래 구조로 블로그 글을 작성하세요:
1. 5 Compelling Titles
2. First Paragraph
3. Main Content (${mode})
4. Brand Strength Highlight
5. Emotional/Impactful Closing
`.trim();

  // 5) Chat Completion
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `주제: ${topic}\n추가 파라미터: ${userParams}` }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });

  return response.choices[0].message.content;
}

module.exports = { handleBlogRequest };
