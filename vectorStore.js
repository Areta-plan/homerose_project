const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');
let pLimit;
try {
  pLimit = require('p-limit');
  if (typeof pLimit !== 'function' && pLimit.default) {
    pLimit = pLimit.default;
  }
} catch (err) {
  throw new Error('p-limit 모듈을 찾을 수 없습니다. npm install p-limit 로 설치하세요.');
}

// 설정 상수
const EMBEDDING_MODEL = 'text-embedding-ada-002';
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');
const CACHE_PATH = path.join(__dirname, 'chunksCache.json');
const CONCURRENCY = 5;          // 병렬 임베딩 요청 제한
const CHUNK_SIZE = 1000;        // 청크 크기 (문자 수)
const CHUNK_OVERLAP = 200;      // 청크 겹침 문자 수

// 벡터 저장 공간
let chunks = [];

// 두 벡터 간 코사인 유사도 계산
function cosineSimilarity(a, b) {
  let dot = 0.0, magA = 0.0, magB = 0.0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8);
}

// 캐시 로드
function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return { fileHashes: {}, chunks: [] };
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return { fileHashes: {}, chunks: [] };
  }
}

// 캐시 저장
function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

// 문자열 청크 분할 (슬라이딩 윈도우)
function chunkText(text) {
  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  const result = [];
  for (let start = 0; start < text.length; start += step) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    result.push(text.slice(start, end));
    if (end === text.length) break;
  }
  return result;
}

// 파일 내용 해시 계산
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// 벡터 스토어 초기화: 캐시 활용 + 신규/변경 청크만 임베딩
async function initializeVectorStore(apiKey) {
  console.log('➡️ [vectorStore] initializing...');
  const openai = new OpenAI({ apiKey });
  const cache = loadCache();
  const oldHashes = cache.fileHashes;
  const oldChunks = cache.chunks || [];
  const newFileHashes = {};
  const keptChunks = [];
  const toEmbed = [];

  // 모듈(폴더)별 파일 순회
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.warn('[vectorStore] knowledge directory not found, skipping.');
    chunks = [];
    saveCache({ fileHashes: {}, chunks });
    return;
  }
  const modules = fs.readdirSync(KNOWLEDGE_DIR).filter(d =>
    fs.statSync(path.join(KNOWLEDGE_DIR, d)).isDirectory());
  for (const mod of modules) {
    const dirPath = path.join(KNOWLEDGE_DIR, mod);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.txt'));
    for (const file of files) {
      const relPath = path.join(mod, file);
      const fullPath = path.join(dirPath, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const hash = hashContent(content);
      newFileHashes[relPath] = hash;
      if (oldHashes[relPath] === hash) {
        oldChunks.filter(c => c.source === relPath).forEach(c => keptChunks.push(c));
      } else {
        chunkText(content).forEach((txt, idx) => {
          toEmbed.push({ source: relPath, category: mod, text: txt, sliceIndex: idx });
        });
      }
    }
  }

  // 병렬 임베딩
    // Limit the concurrency of embedding requests
 const limitFn = pLimit(CONCURRENCY);
  const embedTasks = toEmbed.map(ci => limitFn(async () => {
    const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: ci.text });
    return {
      id: `${ci.source}#${ci.sliceIndex}`,
      source: ci.source,
      category: ci.category,
      text: ci.text,
      embedding: res.data[0].embedding
    };
  }));
  const newChunks = await Promise.all(embedTasks);

  // 최종 chunks 갱신 & 캐시 저장
  chunks = [...keptChunks, ...newChunks];
  saveCache({ fileHashes: newFileHashes, chunks });
  console.log(`✅ [vectorStore] ready with ${chunks.length} chunks`);
}

// 카테고리별 Top-K 청크 추출
function getTopKChunksByCategory(queryEmbedding, category, topK = 3) {
  const filtered = category
    ? chunks.filter(c => c.category === category)
    : chunks;
  return filtered
    .map(c => ({ text: c.text, score: cosineSimilarity(c.embedding, queryEmbedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(c => c.text);
}

// 별칭: 전체 청크 대상으로 Top-K 뽑기
function getTopKChunks(queryEmbedding, topK = 3) {
  return getTopKChunksByCategory(queryEmbedding, undefined, topK);
}

module.exports = {
  initializeVectorStore,
  getTopKChunksByCategory,
  getTopKChunks,
  cosineSimilarity,
  chunks
};