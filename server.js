// server.js
require("dotenv").config();

const fs      = require("fs");
const path    = require("path");
const express = require("express");
const cors    = require("cors");
const OpenAI  = require("openai");

const { initializeVectorStore, chunks } = require("./vectorStore");
const askRouter  = require("./routes/ask");    // 경로 수정: routes/ask.js
const blogRouter = require("./routes/blog");   // 경로 수정: routes/blog.js
const askWithRefRouter = require("./routes/askWithRef");

const app = express();
const PORT = process.env.PORT || 3000;

// 공통 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../chatgpt-client")));
app.use('/askWithRef', askWithRefRouter);

// 참고자료 제공 엔드포인트
const KNOWLEDGE_DIR = path.join(__dirname, "knowledge");
app.get("/knowledge", (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(401).json({ error: "로그인 후 이용하세요." });

  fs.readdir(KNOWLEDGE_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: "참고자료 로드 실패" });
    const knowledge = files
      .filter(f => f.endsWith(".txt"))
      .map(f => ({
        name: f,
        content: fs.readFileSync(path.join(KNOWLEDGE_DIR, f), "utf8")
      }));
    res.json({ knowledge });
  });
});

// RAG & GPT 엔드포인트
app.use("/ask", askRouter);
app.use("/blog", blogRouter);

// 벡터스토어 초기화 후 서버 기동
(async () => {
  console.log("➡️ [vectorStore] initializing...");
  await initializeVectorStore(process.env.OPENAI_API_KEY);
  console.log(`✅ [vectorStore] ready with ${chunks.length} chunks`);

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
})();
