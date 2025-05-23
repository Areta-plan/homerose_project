// server.js
require('dotenv').config();
// console.log('Loaded OPENAI_API_KEY:', process.env.OPENAI_API_KEY);

const express = require('express');
const cors    = require('cors');
const path    = require('path');

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
