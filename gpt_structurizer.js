// gpt_structurizer.js
// Step1: convert raw_corpus txt files into structured json by splitting sections
// Step2: convert structured json into training_samples with tagging headers

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const chalk = require('chalk').default;

const RAW_DIR = path.join(__dirname, 'raw_corpus');
const STRUCT_DIR = path.join(__dirname, 'structured');
const OUT_DIR = path.join(__dirname, 'training_samples');

// SECTION_INFO defines prefix and directory name for each section
const SECTION_INFO = {
  title: { dir: 'title', prefix: 'ti_' },
  firstparagraph: { dir: 'firstparagraph', prefix: 'fp_' },
  closing: { dir: 'closing', prefix: 'cl_' },
  story: { dir: 'story', prefix: 'story_' }
};

mkdirp.sync(RAW_DIR);
mkdirp.sync(STRUCT_DIR);
mkdirp.sync(OUT_DIR);
for (const info of Object.values(SECTION_INFO)) {
  mkdirp.sync(path.join(OUT_DIR, info.dir));
}

const TAG_TEMPLATES = {
  'fp_': [
    '[키워드: ]',
    '[타깃: ]',
    '[R: ]',
    '[E: ]',
    '[M: ]',
    '[유도문장: ]'
  ],
  'ti_': [
    '[키워드: ]',
    '[주유형: ]',
    '[세부특징1: ]',
    '[세부특징2: ]'
  ],
  'cl_': [
    '[톤1: ]',
    '[톤2: ]',
    '[목표/효과: ]'
  ],
  'story_': [
    '[주제: ]',
    '[메시지: ]',
    '[문제상황: ]',
    '[위기: ]',
    '[절정: ]',
    '[해소/결말: ]'
  ]
};

function buildHeader(prefix) {
  const tags = TAG_TEMPLATES[prefix] || [];
  return '===user===\n' + tags.join('\n') + '\n\n===assistant===\n';
}

// Parse raw text into {title, firstparagraph, closing}
function parseRawContent(raw) {
  const text = raw.replace(/\r/g, '');
  if (!text.trim()) return null;

  let title = '';
  let body = text;

  const titleMatch = text.match(/===title===\s*([\s\S]*?)(?:\n===|$)/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
    const bodyMatch = text.match(/===body===\s*([\s\S]*)/i);
    body = bodyMatch ? bodyMatch[1].trim() : text.slice(titleMatch[0].length).trim();
  } else {
    const lines = text.split('\n').map(l => l.trim());
    title = lines.shift() || '';
    body = lines.join('\n');
  }

  const paragraphs = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const firstparagraph = paragraphs[0] || '';
  const closing = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : '';

  const result = {};
  if (title) result.title = title;
  if (firstparagraph) result.firstparagraph = firstparagraph;
  if (closing) result.closing = closing;
  return Object.keys(result).length ? result : null;
}

function saveJson(file, data) {
  const jsonPath = path.join(STRUCT_DIR, path.basename(file, '.txt') + '.json');
  try {
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(chalk.green(`Saved ${jsonPath}`));
    return true;
  } catch (e) {
    console.log(chalk.red(`❌ Failed to write JSON: ${e.message}`));
    return false;
  }
}

function getNextIndex(info) {
  const dirPath = path.join(OUT_DIR, info.dir);
  mkdirp.sync(dirPath);
  const files = fs.readdirSync(dirPath).filter(f => f.startsWith(info.prefix));
  const nums = files.map(f => {
    const m = f.match(/(\d+)/); return m ? parseInt(m[1],10) : 0;
  });
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function saveSample(section, text) {
  const info = SECTION_INFO[section];
  if (!info || !text) return;
  const idx = String(getNextIndex(info)).padStart(3, '0');
  const filePath = path.join(OUT_DIR, info.dir, `${info.prefix}${idx}.txt`);
  const header = buildHeader(info.prefix);
  fs.writeFileSync(filePath, header + text.trim() + '\n', 'utf8');
  console.log(chalk.green(`Created ${filePath}`));
}

function processRawFile(file) {
  try {
    const rawPath = path.join(RAW_DIR, file);
    const raw = fs.readFileSync(rawPath, 'utf8');
    if (!raw.trim()) {
      console.log(chalk.red(`❌ Empty content: ${file}`));
      return;
    }
    const data = parseRawContent(raw);
    if (!data) {
      console.log(chalk.red(`❌ No recognizable sections: ${file}`));
      return;
    }
    if (!saveJson(file, data)) return;
  } catch (e) {
    console.log(chalk.red(`❌ Exception: ${e.message}`));
  }
}

function processJsonFile(file) {
  try {
    const jsonPath = path.join(STRUCT_DIR, file);
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    for (const [section, text] of Object.entries(data)) {
      if (!SECTION_INFO[section]) continue;
      saveSample(section, text);
    }
  } catch (e) {
    console.log(chalk.red(`❌ Exception: ${e.message}`));
  }
}

function main() {
  const rawFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.txt'));
  for (const f of rawFiles) processRawFile(f);

  const jsonFiles = fs.readdirSync(STRUCT_DIR).filter(f => f.endsWith('.json'));
  for (const f of jsonFiles) processJsonFile(f);
}

main();