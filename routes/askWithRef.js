// routes/askWithRef.js
const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const { getTopKChunks } = require('../vectorStore');
const { cosineSimilarity } = require('../vectorStore');

// Multer setup: 최대 3개 파일을 'references' 필드로 받음
const tmpStorage = multer.memoryStorage();
const upload = multer({ storage: tmpStorage }).array('references', 3);

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// POST /askWithRef: 최대 3개 one-time reference files + message
router.post('/askWithRef', upload, async (req, res) => {
  try {
    const userMessage = req.body.message;

    // 1) 사용자 메시지 임베딩
    const qEmb = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: userMessage
    });
    const queryEmbedding = qEmb.data[0].embedding;

    // 2) 글로벌 RAG context 추출
    const globalChunks = getTopKChunks(queryEmbedding, 3);

    // 3) 업로드된 파일들 처리 (req.files는 배열)
    const files = req.files || [];
    let refTop = [];

    for (const file of files) {
      const text = file.buffer.toString('utf8');
      const CHUNK_SIZE = 1000;
      const chunks = [];
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        chunks.push(text.slice(i, i + CHUNK_SIZE));
      }
      // 각 청크 임베딩
      const embedResults = await Promise.all(
        chunks.map(c => openai.embeddings.create({ model: 'text-embedding-ada-002', input: c }))
      );
      // 유사도 계산 후 상위 3개 청크 선별
      const scored = embedResults.map((r, idx) => ({
        text: chunks[idx],
        score: cosineSimilarity(r.data[0].embedding, queryEmbedding)
      }));
      scored.sort((a, b) => b.score - a.score);
      refTop.push(...scored.slice(0, 3).map(c => c.text));
    }

    // 4) 메시지 조합: 글로벌 + 파일별 참조
    const knowledgeContext = [...globalChunks, ...refTop].join('\n\n');
    const messages = [
      { role: 'system', content: `[Knowledge]\n${knowledgeContext}` },
      { role: 'user',   content: userMessage }
    ];

    // 5) GPT 호출
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.3,
      max_tokens: 2000
    });

    res.json({ answer: completion.choices[0].message.content });
  } catch (err) {
    console.error('[/askWithRef] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
