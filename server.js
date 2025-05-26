// server.js
require('dotenv').config();

// 환경변수 유효성 검증
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

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
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',') : 
  ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

const { globalErrorHandler } = require('./middleware/errorHandler');

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

// 5) 글로벌 에러 핸들러
app.use(globalErrorHandler);

// 5) 벡터 스토어 초기화 후 서버 기동
(async () => {
  console.log('➡️ [vectorStore] initializing...');
  try {
    await initializeVectorStore(process.env.OPENAI_API_KEY);
    console.log(`✅ [vectorStore] ready with ${chunks.length} chunks`);
    
    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('🔄 SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      console.log('🔄 SIGINT received, shutting down gracefully');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });
    
  } catch (e) {
    console.error('🔥 [vectorStore] initialization failed:', e);
    console.error('🔄 Shutting down server due to initialization failure');
    process.exit(1);
  }
})();
