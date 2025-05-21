// scripts/watch_and_finetune.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

// OpenAI SDK v4 (CommonJS) 사용
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 메서드 존재 여부 확인
console.log('openai.files.create exists:', typeof openai.files?.create === 'function');
console.log('openai.fineTuning.jobs.create exists:', typeof openai.fineTuning?.jobs?.create === 'function');
console.log('openai.fineTuning.jobs.retrieve exists:', typeof openai.fineTuning?.jobs?.retrieve === 'function');

const SAMPLES_DIR = path.resolve(__dirname, '../training_samples');
const JSONL_PATH = path.resolve(__dirname, '../training_data.jsonl');
const LATEST_PATH = path.resolve(__dirname, '../latest_model.txt');
const BASE_MODEL = 'gpt-3.5-turbo';
const SUFFIX = 'auto';

// 1) 샘플 파일을 JSONL로 변환
function buildJsonl() {
  const pairs = [];
  fs.readdirSync(SAMPLES_DIR).forEach(file => {
    if (file.endsWith('_prompt.txt')) {
      const id = file.replace('_prompt.txt', '');
      const prompt = fs.readFileSync(path.join(SAMPLES_DIR, `${id}_prompt.txt`), 'utf8').trim();
      const completion = fs.readFileSync(path.join(SAMPLES_DIR, `${id}_completion.txt`), 'utf8').trim();
      pairs.push({ prompt: prompt + '\n\n###\n\n', completion });
    }
  });
  const jsonl = pairs.map(o => JSON.stringify(o)).join('\n') + '\n';
  fs.writeFileSync(JSONL_PATH, jsonl, 'utf8');
  console.log(`✅ JSONL (${pairs.length} samples) written to ${JSONL_PATH}`);
}

// 2) 파일 업로드 및 파인튜닝 실행
async function runFineTune() {
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

    console.log('➡️ Creating fine-tune job…');
    const ftRes = await openai.fineTuning.jobs.create({
      training_file: fileId,
      model: BASE_MODEL,
      suffix: SUFFIX,
    });
    const job = ftRes;
    console.log(`▶ Job created. ID: ${job.id}, status: ${job.status}`);

    let status = job.status;
    while (status !== 'succeeded' && status !== 'failed') {
      await new Promise(r => setTimeout(r, 30000));
      const info = await openai.fineTuning.jobs.retrieve(job.id);
      status = info.status;
      console.log(`… current status: ${status}`);
    }

    if (status === 'succeeded') {
      const detail = await openai.fineTuning.jobs.retrieve(job.id);
      const fineModel = detail.fine_tuned_model;
      fs.writeFileSync(LATEST_PATH, fineModel, 'utf8');
      console.log(`✅ Fine-tune complete. New model: ${fineModel}`);
    } else {
      console.error('❌ Fine-tune failed');
    }
  } catch (err) {
    console.error('runFineTune error:', err);
  }
}

// 3) training_samples 폴더 변경 감시 및 자동 실행
console.log(`🔍 Watching ${SAMPLES_DIR} for changes…`);
const watcher = chokidar.watch(SAMPLES_DIR, { ignoreInitial: true, awaitWriteFinish: true });
let debounceTimer;
function onChange(filePath) {
  console.log(`📄 Change detected: ${filePath}`);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    buildJsonl();
    await runFineTune();
  }, 5000);
}
watcher.on('add', onChange).on('change', onChange).on('unlink', onChange);
