require('dotenv').config();
const fs = require('fs');
const path = require('path');
const chalk = require('chalk').default;
const OpenAI = require('openai');

const TRAIN_DIR = path.join(__dirname, 'training_samples');

const TAG_FORMATS = {
  fp_: '[키워드], [타깃], [R], [E], [M], [유도문장]',
  ti_: '[키워드], [주유형], [세부특징1], [세부특징2]',
  cl_: '[톤1], [톤2], [목표/효과]',
  story_: '[주제], [메시지], [문제상황], [위기], [절정], [해소/결말]'
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateTags(prefix, text) {
  const format = TAG_FORMATS[prefix];
  if (!format) return null;
  const prompt = `다음 본문을 분석하여 '${format}' 형식으로 태그를 작성해줘.\n\n본문:\n${text}`;
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }]
    });
    return res.choices[0]?.message?.content?.trim();
  } catch (err) {
    console.log(chalk.red(`❌ GPT error: ${err.message}`));
    return null;
  }
}

function parseTagsString(str) {
  const map = {};
  const regex = /\[([^\[\]]+)\]/g;
  let m;
  while ((m = regex.exec(str))) {
    const parts = m[1].split(':');
    if (parts.length < 2) continue;
    const key = parts.shift().trim();
    const value = parts.join(':').trim();
    map[key] = value;
  }
  return map;
}

function getPrefix(file) {
  const m = path.basename(file).match(/^(.*?_)/);
  return m ? m[1] : null;
}

async function processFile(filePath) {
  try {
    let data = fs.readFileSync(filePath, 'utf8');
    let lines = data.split(/\r?\n/);

    const prefix = getPrefix(filePath);
    if (!prefix) return;

    let tagLine = null;
    if (lines[0].startsWith('//')) {
      tagLine = lines.shift().slice(2).trim();
    }

    const body = lines.join('\n').trim();
    if (!body) {
      console.log(chalk.red(`❌ Empty content: ${filePath}`));
      return;
    }

    if (!tagLine) {
      tagLine = await generateTags(prefix, body);
      if (!tagLine) return;
    }

    const tagMap = parseTagsString(tagLine);

    const userIdx = lines.indexOf('===user===');
    const assistantIdx = lines.indexOf('===assistant===');
    if (userIdx === -1 || assistantIdx === -1) {
      console.log(chalk.red(`❌ Invalid format: ${filePath}`));
      return;
    }

    // Remove any stray lines before the user section
    if (userIdx > 0) {
      lines = lines.slice(userIdx);
    }

    // Recompute indices after possible slice
    const startIdx = lines.indexOf('===user===');
    const endIdx = lines.indexOf('===assistant===');

    for (let i = startIdx + 1; i < endIdx; i++) {
      const match = lines[i].match(/^\[([^:]+):\s*\]/);
      if (match) {
        const key = match[1].trim();
        if (tagMap[key]) lines[i] = `[${key}: ${tagMap[key]}]`;
      }
    }

    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log(chalk.green(`Tagged ${filePath}`));
  } catch (err) {
    console.log(chalk.red(`❌ Failed to process ${filePath}: ${err.message}`));
  }
}

async function main() {
  const sections = fs.readdirSync(TRAIN_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const sec of sections) {
    const dir = path.join(TRAIN_DIR, sec);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    for (const f of files) {
      await processFile(path.join(dir, f));
    }
  }
}

main();