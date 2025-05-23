// gpt_structurizer.js
// Script to automatically split raw blog posts into structured sections using GPT
// and save them into the training_samples directory.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const chalk = require('chalk');
const chokidar = require('chokidar');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const RAW_DIR = path.join(__dirname, 'raw_corpus');
const OUT_DIR = path.join(__dirname, 'training_samples');
const ERR_DIR = path.join(__dirname, 'structurizer_errors');

const SECTION_INFO = {
  title: { dir: 'title', prefix: 'ti_' },
  firstParagraph: { dir: 'firstparagraph', prefix: 'fp_' },
  mainContent: { dir: 'maincontent', prefix: 'mc_' },
  usp: { dir: 'usp', prefix: 'usp_' },
  closing: { dir: 'closing', prefix: 'cl_' },
  story: { dir: 'story', prefix: 'story_' }
};

mkdirp.sync(RAW_DIR);
mkdirp.sync(OUT_DIR);
mkdirp.sync(ERR_DIR);

// Ensure section directories exist
for (const info of Object.values(SECTION_INFO)) {
  mkdirp.sync(path.join(OUT_DIR, info.dir));
}

const SYSTEM_PROMPT = `당신은 블로그 글을 구조적으로 분해하는 AI입니다.
사용자로부터 제공된 블로그 원고를 다음 6개 섹션으로 분리하세요:

Title

First Paragraph (REMA 구조)

Main Content (정보 또는 스토리형 본문)

Brand Strength Highlight (USP 강조)

Emotional Closing (감성 마무리)

Storytelling (고객 경험 기반 미니 에피소드)

각 섹션 앞에는 반드시 아래 마커를 붙이세요:
===title===
===first_paragraph===
===main_content===
===usp===
===closing===
===story===

출력은 마크다운 없이 순수 텍스트 형식이며, 각 섹션은 공백 없이 붙여서 출력하세요.`;

// Get the next numeric index based on existing training samples.
function getNextIndex() {
  const nums = [];
  for (const info of Object.values(SECTION_INFO)) {
    const dirPath = path.join(OUT_DIR, info.dir);
    if (!fs.existsSync(dirPath)) continue;
    const files = fs.readdirSync(dirPath).filter(f => new RegExp(`^${info.prefix}\\d{3}\\.txt$`).test(f));
    for (const f of files) {
      const m = f.match(/(\d{3})/);
      if (m) nums.push(parseInt(m[1], 10));
    }
  }
  return nums.length ? Math.max(...nums) + 1 : 1;
}

// Parse GPT output into section map.
function parseSections(text) {
  const regex = /===title===\s*([\s\S]*?)\s*===first_paragraph===\s*([\s\S]*?)\s*===main_content===\s*([\s\S]*?)\s*===usp===\s*([\s\S]*?)\s*===closing===\s*([\s\S]*?)\s*===story===\s*([\s\S]*)/i;
  const m = text.match(regex);
  if (!m) return null;
  return {
    title: m[1].trim(),
    firstParagraph: m[2].trim(),
    mainContent: m[3].trim(),
    usp: m[4].trim(),
    closing: m[5].trim(),
    story: m[6].trim()
  };
}

// Write one section to a file with the given prefix and index.
function writeSection(section, index, content) {
  const info = SECTION_INFO[section];
  if (!info) return;
  const dir = path.join(OUT_DIR, info.dir);
  const idx = String(index).padStart(3, '0');
  const filePath = path.join(dir, `${info.prefix}${idx}.txt`);
  fs.writeFileSync(filePath, content, 'utf8');
}

// Call GPT and store the result for one raw file.
async function processFile(file, index) {
  const inputPath = path.join(RAW_DIR, file);
  const raw = fs.readFileSync(inputPath, 'utf8');

    if (!raw.trim()) {
    console.log(chalk.red(`❌ Empty content: ${file}`));
    return false;
  }

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: raw }
      ]
    });

    const content = resp.choices[0].message.content.trim();
    const sections = parseSections(content);
    if (!sections) {
      console.log(chalk.red(`❌ No recognizable sections: ${file}`));
      return false;
    }

    writeSection('title', index, sections.title);
    writeSection('firstParagraph', index, sections.firstParagraph);
    writeSection('mainContent', index, sections.mainContent);
    writeSection('usp', index, sections.usp);
    writeSection('closing', index, sections.closing);
    writeSection('story', index, sections.story);

    console.log(chalk.green(`Processed ${file}`));
    return true;
  } catch (err) {
    const errFile = path.join(ERR_DIR, `${path.parse(file).name}.log`);
    fs.writeFileSync(errFile, err.stack || err.message, 'utf8');
    console.error(chalk.red(`❌ Exception while parsing ${file}: ${err.message}`));
    return false;
  }
}

async function main() {
  const watchMode = process.argv.includes('--watch');
  const files = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.txt'));

  let success = 0;
  let index = getNextIndex();

  for (const f of files) {
    const ok = await processFile(f, index);
    if (ok) {
      success++;
      index++;
      fs.unlinkSync(path.join(RAW_DIR, f));
    }
  }

  if (!watchMode) {
    if (files.length === 0) {
      console.log(chalk.yellow('No raw files found.'));
    }
    console.log(chalk.blue(`Finished. Success: ${success} / ${files.length}`));
    return;
  }

  console.log(chalk.blue(`Initial run complete. Success: ${success} / ${files.length}`));
  console.log(chalk.cyan('Watching raw_corpus for new files...'));
  const watcher = chokidar.watch(RAW_DIR, { ignoreInitial: true, awaitWriteFinish: true });
  watcher.on('add', async filePath => {
    if (!filePath.endsWith('.txt')) return;
    const file = path.basename(filePath);
    const ok = await processFile(file, index);
    if (ok) {
      index++;
      fs.unlink(filePath, err => {
        if (err) console.error(`Failed to remove ${file}:`, err.message);
      });
    }
  });
}

main().catch(err => {
  console.error('Unexpected error:', err);
});