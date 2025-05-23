// services/chatService.js
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { SYSTEM_PROMPT } = require('../prompts');
const { getTopKChunksByCategory, getTopKChunks } = require('../vectorStore');
const { webSearch } = require('./webSearch');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 최신 파인튜닝 모델 ID 읽기 (자동 학습 후 latest_model.txt에 저장)
function getLatestModel() {
  try {
    const model = fs.readFileSync(path.resolve(__dirname, '../latest_model.txt'), 'utf8').trim();
    return model || 'gpt-4o';
  } catch {
    return 'gpt-4o';
  }
}

/**
 * 단순 메시지 처리: /ask 엔드포인트용
 */
async function handleChatRequest(userMessage) {
  const model = getLatestModel();
  // 1) 임베딩 생성
  const { data } = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: userMessage
  });
  const embedding = data[0].embedding;

  // 2) RAG 청크 추출
  const chunks = getTopKChunks(embedding, 3);
  console.log('---- RAG Debug (/ask) ----');
  console.log('User Message:', userMessage);
  console.log('Retrieved Chunks:', chunks);
  console.log('-------------------------');
  const knowledgeContext = chunks.join('\n\n');

  // 3) GPT 호출
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: '[Knowledge]\n' + knowledgeContext },
    { role: 'user',   content: userMessage }
  ];
  console.log('Final Messages (/ask):', messages);
  try {
    const resp = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.3,
      top_p: 0.9,
      frequency_penalty: 0.7,
      max_tokens: 1800
    });
    return resp.choices[0].message.content;
  } catch (err) {
    console.error('[/ask] OpenAI call failed:', err);
    throw new Error('OpenAI 응답 생성 중 오류가 발생했습니다.');
  }
}

/**
 * 대화 히스토리 처리: /chat 엔드포인트용
 */
async function handleChatHistoryRequest(messages, references = []) {
  const model = getLatestModel();
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) throw new Error('사용자 메시지가 필요합니다.');

  const { data } = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: lastUser.content
  });
  const embedding = data[0].embedding;

  const chunks = getTopKChunks(embedding, 3);
  const knowledgeContext = chunks.join('\n\n');

  const finalMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: '[Knowledge]\n' + knowledgeContext },
    ...messages
  ];

  if (references.length > 0) {
    console.log('[chatService] uploaded references:', references.map(f => f.originalname));
  }

  try {
    console.log('Final Messages (/chat):', finalMessages);
    const resp = await openai.chat.completions.create({
      model,
      messages: finalMessages,
      temperature: 0.3,
      top_p: 0.9,
      frequency_penalty: 0.7,
      max_tokens: 1800
    });
    return resp.choices[0].message.content;
  } catch (err) {
    console.error('[/chat] OpenAI call failed:', err);
    throw new Error('대화 응답 생성 중 오류가 발생했습니다.');
  }
}

/**
 * 블로그 초안 생성: /blog 엔드포인트용
 */
async function handleBlogRequest({ topic, mode, userParams }) {
  const model = getLatestModel();

  // 1) 웹 검색
  const results = await webSearch(`${topic} 최신 트렌드`, 3);
  const searchContext = results
    .map((r, i) => `${i+1}. ${r.title}\n${r.snippet}\n(${r.link})`)
    .join('\n\n');

  // 2) 주제 임베딩
  const qEmb = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: topic
  });
  const emb = qEmb.data[0].embedding;

  // 3) 모듈별 RAG 컨텍스트
  const titlesCtx   = getTopKChunksByCategory(emb, 'titles', 3);
  const introCtx    = getTopKChunksByCategory(emb, 'intro', 3);
  const mainKey     = mode === 'story' ? 'mainStory' : 'mainKnowledge';
  const mainCtx     = getTopKChunksByCategory(emb, mainKey, 3);
  const strengthCtx = getTopKChunksByCategory(emb, 'strength', 3);
  const closingCtx  = getTopKChunksByCategory(emb, 'closing', 3);

  console.log('---- RAG Debug (/blog) ----');
  console.log('Topic:', topic, 'Mode:', mode, 'Params:', userParams);
  console.log('Search Context:', searchContext);
  console.log('Titles Context:', titlesCtx);
  console.log('Intro Context:', introCtx);
  console.log(`Main (${mode}) Context:`, mainCtx);
  console.log('Strength Context:', strengthCtx);
  console.log('Closing Context:', closingCtx);
  console.log('--------------------------');

  // 3) 시스템 프롬프트 조립
  const systemPrompt = `
${SYSTEM_PROMPT}

---
[Web Search Results]\n${searchContext}

1) [5 Compelling Titles 참고 자료]
${titlesCtx.join('\n\n')}

2) [First Paragraph 참고 자료]
${introCtx.join('\n\n')}

3) [Main Content (${mode}) 참고 자료]
${mainCtx.join('\n\n')}

4) [Brand Strength Highlight]
${strengthCtx.join('\n\n')}

5) [Emotional/Impactful Closing]
${closingCtx.join('\n\n')}

위 순서와 자료만 참고해서, 아래 구조로 블로그 글을 작성하세요:
1. 5 Compelling Titles
2. First Paragraph
3. Main Content (${mode})
4. Brand Strength Highlight
5. Emotional/Impactful Closing
`.trim();

  // 4) GPT 호출
  try {
    const resp = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: `주제: ${topic}\n추가 파라미터: ${userParams}` }
      ],
      temperature: 0.25,
      top_p: 0.8,
      frequency_penalty: 0.7,
      max_tokens: 5000
    });
    return resp.choices[0].message.content;
  } catch (err) {
    console.error('[/blog] OpenAI call failed:', err);
    throw new Error('블로그 초안 생성 중 오류가 발생했습니다.');
  }
}

module.exports = { handleChatRequest, handleChatHistoryRequest, handleBlogRequest };
