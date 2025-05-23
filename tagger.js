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

function getPrefix(file) {
  const m = path.basename(file).match(/^(.*?_)/);
  return m ? m[1] : null;
}

async function processFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split(/\r?\n/);
    if (lines[0].startsWith('//')) return; // already tagged

    const prefix = getPrefix(filePath);
    if (!prefix) return;
    const body = data.trim();
    if (!body) {
      console.log(chalk.red(`❌ Empty content: ${filePath}`));
      return;
    }

    const tags = await generateTags(prefix, body);
    if (!tags) return;

    lines.unshift(`// ${tags}`);
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