// scripts/watch_and_finetune.js
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
require('dotenv').config();
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  console.log('➡️ Uploading training file…');
  const fileRes = await openai.files.create({
    file: fs.createReadStream(JSONL_PATH),
    purpose: 'fine-tune'
  });
  console.log(`✅ File uploaded: ${fileRes.id}`);
  console.log('➡️ Creating fine-tune job…');
  const ft = await openai.fineTunes.create({
    training_file: fileRes.id,
    model: BASE_MODEL,
    suffix: SUFFIX
  });
  console.log(`▶ Job created: ${ft.id}, waiting for completion…`);
  // 상태 폴링
  let status = ft.status;
  while (!['succeeded','failed'].includes(status)) {
    await new Promise(r => setTimeout(r, 30000)); // 30초 대기
    const info = await openai.fineTunes.get({ fine_tune_id: ft.id });
    status = info.status;
    console.log(`… current status: ${status}`);
  }
  if (status === 'succeeded') {
    const fineModel = (await openai.fineTunes.get({ fine_tune_id: ft.id })).fine_tuned_model;
    fs.writeFileSync(LATEST_PATH, fineModel, 'utf8');
    console.log(`✅ Fine-tune complete. New model: ${fineModel}`);
  } else {
    console.error('❌ Fine-tune failed');
  }
}

// 3) 워처 설정
console.log(`🔍 Watching ${SAMPLES_DIR} for changes…`);
const watcher = chokidar.watch(SAMPLES_DIR, { ignoreInitial: true });
watcher.on('add', path => onChange(path))
       .on('change', path => onChange(path))
       .on('unlink', path => onChange(path));

let timer = null;
function onChange(fp) {
  console.log(`📄 Change detected: ${fp}`);
  if (timer) clearTimeout(timer);
  // 5초간 추가 변화 대기 후 실행
  timer = setTimeout(async () => {
    try {
      buildJsonl();
      await runFineTune();
    } catch (e) {
      console.error(e);
    }
  }, 5000);
}
