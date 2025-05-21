// server.js
require('dotenv').config();
// console.log('Loaded OPENAI_API_KEY:', process.env.OPENAI_API_KEY);

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const { initializeVectorStore, chunks } = require('./vectorStore');
const askRouter  = require('./routes/ask');
const blogRouter = require('./routes/blog');
const chatRouter = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3000;

// 1) 공통 미들웨어
app.use(cors());
app.use(express.json());

// 2) 정적 파일 서빙 (chatgpt-client 폴더)
const clientDir = path.join(__dirname, 'chatgpt-client');
console.log(`🔧 Serve static files from: ${clientDir}`);
app.use(express.static(clientDir));

// (선택) 루트 경로에서 index.html 제공
app.get('/', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

// 3) 참고자료 제공 엔드포인트
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');
app.get('/knowledge', (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(401).json({ error: '로그인 후 이용하세요.' });
  }
  fs.readdir(KNOWLEDGE_DIR, (err, files) => {
    if (err) {
      console.error('Knowledge list error:', err);
      return res.status(500).json({ error: '참고자료 목록을 불러올 수 없습니다.' });
    }
    const knowledge = files
      .filter(f => f.endsWith('.txt'))
      .map(f => ({
        name: f,
        content: fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf8')
      }));
    res.json({ knowledge });
  });
});

// 4) API 라우터 연결
app.use('/ask', askRouter);
app.use('/blog', blogRouter);
app.use('/chat', chatRouter);

// 5) 벡터 스토어 초기화 후 서버 기동
(async () => {
  console.log('➡️ [vectorStore] initializing...');
  try {
    await initializeVectorStore(process.env.OPENAI_API_KEY);
    console.log(`✅ [vectorStore] ready with ${chunks.length} chunks`);
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('🔥 [vectorStore] initialization failed:', e);
    process.exit(1);
  }
})();
