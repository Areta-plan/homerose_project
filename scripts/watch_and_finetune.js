require('dotenv').config();
const cron = require('node-cron');
const path = require('path');
const simpleGit = require('simple-git');
const repoDir = path.resolve(__dirname, '..');
const git = simpleGit(repoDir);

cron.schedule('*/5 * * * *', async () => {
  try {
    console.log('🔄 주기적 pull 시작…');
    await git.pull(process.env.GITHUB_REMOTE || 'origin', process.env.GITHUB_BRANCH || 'master');
    console.log('✅ 원격 변경사항 로컬 반영 완료');
  } catch (e) {
    console.error('❌ pull 실패:', e.message);
  }
});

const fs = require('fs');h');
const chokidar = require('chokidar');

// OpenAI SDK v4 (CommonJS) 사용
let openai;

const SAMPLES_DIR = path.resolve(__dirname, '../training_samples');
const JSONL_PATH = path.resolve(__dirname, '../training_data.jsonl');
const TRAINING_DIR = path.resolve(__dirname, '../training_data');
const LATEST_PATH = path.resolve(__dirname, '../latest_model.txt');
// Fine-tuning now requires an explicit model version.
// The 0125 release is generally available for fine-tuning.
const BASE_MODEL = 'gpt-3.5-turbo-0125';
const SUFFIX = 'auto';

// Git 동기화를 위한 함수
async function syncGit() {
  const {
    GITHUB_TOKEN,
    GITHUB_REPO,
    GITHUB_REMOTE = 'origin',
    GITHUB_BRANCH = 'main'
  } = process.env;

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    console.error('🔧 Git 동기화 건너뜀: GITHUB_TOKEN 또는 GITHUB_REPO가 설정되지 않았습니다.');
    return;
@@ -130,84 +129,84 @@ function buildJsonl() {
              { role: 'user', content: prompt },
              { role: 'assistant', content: completion }
            ]
          });
        }
      } else if (entry.name.endsWith('.txt')) {
        const conv = parseConversation(full);
        if (conv) records.push(conv);
      }
    });
  }
  traverse(SAMPLES_DIR);
  const jsonl = records.map(o => JSON.stringify(o)).join('\n') + '\n';
  fs.writeFileSync(JSONL_PATH, jsonl, 'utf8');
  console.log(`✅ JSONL (${records.length} samples) written to ${JSONL_PATH}`);
  
  splitJsonl();
}

// 보조: training_data.jsonl을 분할하여 섹션별 JSONL 저장
function splitJsonl() {
  if (!fs.existsSync(TRAINING_DIR)) {
    fs.mkdirSync(TRAINING_DIR, { recursive: true });
  }

  const mapping = {
    title: { dir: 'title', prompt: '다음에 대한 타이틀을 작성해줘' },
    first_paragraph: { dir: 'firstparagraph', prompt: '다음에 대한 첫 문단을 작성해줘' },
    closing: { dir: 'closing', prompt: '다음 내용을 감정적으로 마무리해줘' }
  };

  for (const [section, info] of Object.entries(mapping)) {
    const sectionDir = path.join(SAMPLES_DIR, info.dir);
    const records = [];
    if (fs.existsSync(sectionDir)) {
      const files = fs.readdirSync(sectionDir).filter(f => f.endsWith('.txt'));
      for (const file of files) {
        const full = path.join(sectionDir, file);
        let text = fs.readFileSync(full, 'utf8');
        const idx = text.indexOf('===assistant===');
        if (idx >= 0) {
          text = text.substring(idx + '===assistant==='.length);
        }
        text = text.trim();
        if (!text) continue;
        records.push({
          messages: [
            { role: 'user', content: info.prompt },
            { role: 'assistant', content: text }
          ]
        });
      }
    }
    const jsonl = records.map(r => JSON.stringify(r)).join('\n');
    const outPath = path.join(TRAINING_DIR, `${section}_samples.jsonl`);
    fs.writeFileSync(outPath, jsonl + (records.length ? '\n' : ''), 'utf8');
  }

  console.log(`✅ Section JSONL files written to ${TRAINING_DIR}`);
}

// 2) 파일 업로드 및 파인튜닝 실행
async function runFineTune() {
  if (!openai) {
    const { OpenAI } = require('openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('openai.files.create exists:', typeof openai.files?.create === 'function');
    console.log('openai.fineTuning.jobs.create exists:', typeof openai.fineTuning?.jobs?.create === 'function');
    console.log('openai.fineTuning.jobs.retrieve exists:', typeof openai.fineTuning?.jobs?.retrieve === 'function');
  }
  if (typeof openai.files?.create !== 'function' ||
      typeof openai.fineTuning?.jobs?.create !== 'function' ||
      typeof openai.fineTuning?.jobs?.retrieve !== 'function') {
    console.error('Error: required OpenAI methods are not available');
    process.exit(1);
  }
  try {
    console.log('➡️ Uploading training file…');
    const fileRes = await openai.files.create({
      file: fs.createReadStream(JSONL_PATH),
      purpose: 'fine-tune',
    });
    const fileId = fileRes.id;
    console.log(`✅ File uploaded. ID: ${fileId}`);