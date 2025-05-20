// scripts/watch_and_finetune.js
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
require('dotenv').config();

// OpenAI 라이브러리 import: CommonJS 호환 처리
let OpenAI;
try {
  // v4+ default export
  OpenAI = require('openai').default;
} catch (e1) {
  try {
    // Named export fallback
    OpenAI = require('openai').OpenAI;
  } catch (e2) {
    console.error('OpenAI import failed:', e1, e2);
    process.exit(1);
  }
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 디버그: OpenAI 인스턴스에 fineTunes가 있는지 확인
console.log('--- OpenAI Debug ---');
console.log('Instance prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(openai)));
console.log('openai.fineTunes exists:', !!openai.fineTunes);
console.log('--------------------');

const SAMPLES_DIR = path.resolve(__dirname, '../training_samples');
const JSONL_PATH  = path.resolve(__dirname, '../training_data.jsonl');
const LATEST_PATH = path.resolve(__dirname, '../latest_model.txt');
const BASE_MODEL  = 'gpt-3.5-turbo';
const SUFFIX      = 'auto';

// 1) training_samples → training_data.jsonl 갱신
function buildJsonl() {
  const pairs = [];
  fs.readdirSync(SAMPLES_DIR).forEach(file => {
    if (file.endsWith('_prompt.txt')) {
      const id = file.replace('_prompt.txt','');
      const p = fs.readFileSync(path.join(SAMPLES_DIR, `${id}_prompt.txt`), 'utf8');
      const c = fs.readFileSync(path.join(SAMPLES_DIR, `${id}_completion.txt`), 'utf8');
      pairs.push({ prompt: p.trim(), completion: c.trim() });
    }
  });
  const jsonl = pairs.map(o => JSON.stringify(o)).join('\n') + '\n';
  fs.writeFileSync(JSONL_PATH, jsonl);
  console.log(`✅ JSONL (${pairs.length} samples) written to ${JSONL_PATH}`);
}

// 2) 파인튜닝 잡 생성 & 완료 대기, 최신 모델 저장
async function runFineTune() {
  if (!openai.fineTunes || typeof openai.fineTunes.create !== 'function') {
    console.error('Error: openai.fineTunes.create is not a function');
    process.exit(1);
  }

  console.log('➡️ Uploading training file…');
  const fileRes = await openai.files.create({ file: fs.createReadStream(JSONL_PATH), purpose: 'fine-tune' });
  console.log(`✅ File uploaded: ${fileRes.id}`);

  console.log('➡️ Creating fine-tune job…');
  const ft = await openai.fineTunes.create({ training_file: fileRes.id, model: BASE_MODEL, suffix: SUFFIX });
  console.log(`▶ Job created: ${ft.id}, waiting for completion…`);

  let status = ft.status;
  while (!['succeeded','failed'].includes(status)) {
    await new Promise(r => setTimeout(r, 30000));
    const info = await openai.fineTunes.get({ fine_tune_id: ft.id });
    status = info.status;
    console.log(`… current status: ${status}`);
  }

  if (status === 'succeeded') {
    const detail = await openai.fineTunes.get({ fine_tune_id: ft.id });
    const fineModel = detail.fine_tuned_model;
    fs.writeFileSync(LATEST_PATH, fineModel, 'utf8');
    console.log(`✅ Fine-tune complete. New model: ${fineModel}`);
  } else {
    console.error('❌ Fine-tune failed');
  }
}

// 3) 워처 설정
console.log(`🔍 Watching ${SAMPLES_DIR} for changes…`);
const watcher = chokidar.watch(SAMPLES_DIR, { ignoreInitial: true });
watcher.on('add', fp => onChange(fp))
       .on('change', fp => onChange(fp))
       .on('unlink', fp => onChange(fp));

let timer = null;
function onChange(fp) {
  console.log(`📄 Change detected: ${fp}`);
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      buildJsonl();
      await runFineTune();
    } catch (e) {
      console.error(e);
    }
  }, 5000);
}
