// blog_extract.js: Crawl blog pages and save cleaned text
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const mkdirp = require('mkdirp');
const puppeteer = require('puppeteer');

// Directory to store raw corpus
const outputDir = path.join(__dirname, 'raw_corpus');
mkdirp.sync(outputDir);

// Determine starting index based on existing files
function getNextIndex() {
  const files = fs.readdirSync(outputDir).filter(f => /^blog_\d{3}\.txt$/.test(f));
  if (files.length === 0) return 1;
  const indices = files.map(f => parseInt(f.match(/(\d{3})/)[0], 10));
  return Math.max(...indices) + 1;
}

// Cleaning function using regex rules
function cleanText(text) {
  if (!text) return '';
  // remove phone numbers
  text = text.replace(/\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, '');
  // remove promotional phrases
  const phrases = ['클릭', '카톡상담', '컨설', '문의', '연락주세요'];
  const phraseRegex = new RegExp(phrases.join('|'), 'g');
  text = text.replace(phraseRegex, '');
  // collapse multiple empty lines
  text = text.replace(/\n{2,}/g, '\n');
  return text.trim();
}

async function extractContent(page, url) {
  const domain = new URL(url).hostname;
  // If it's a Naver blog, handle iframe
  if (domain.includes('naver.com')) {
    try {
      await page.waitForSelector('iframe#mainFrame', { timeout: 5000 });
      const frame = page.frames().find(f => f.name() === 'mainFrame');
      if (frame) {
        return frame.$eval('.se-main-container', el => el.innerText).catch(() => null);
      }
    } catch (e) {
      return null;
    }
  } else {
    // Default extraction: <article> or <div id="content">
    const selectors = ['article', 'div#content'];
    for (const sel of selectors) {
      const exists = await page.$(sel);
      if (exists) {
        return page.$eval(sel, el => el.innerText).catch(() => null);
      }
    }
  }
  return null;
}

async function main() {
  const urls = process.argv.slice(2);
  if (urls.length === 0) {
    console.log('Usage: node blog_extract.js <URL1> <URL2> ...');
    process.exit(1);
  }

  const browser = await puppeteer.launch();
  let nextIndex = getNextIndex();
  let success = 0;
  let fail = 0;

  for (const url of urls) {
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      let text = await extractContent(page, url);
      if (text) {
        text = cleanText(text);
        if (text.length > 0) {
          const fileName = `blog_${String(nextIndex).padStart(3, '0')}.txt`;
          const filePath = path.join(outputDir, fileName);
          fs.writeFileSync(filePath, text, 'utf8');
          console.log(chalk.green(`Saved ${url} -> ${fileName}`));
          nextIndex++;
          success++;
        } else {
          console.log(chalk.yellow(`No content after cleaning: ${url}`));
          fail++;
        }
      } else {
        console.log(chalk.yellow(`Failed to extract content: ${url}`));
        fail++;
      }
    } catch (err) {
      console.log(chalk.red(`Error processing ${url}: ${err.message}`));
      fail++;
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log(chalk.blue(`\nProcessed ${urls.length} URLs -> Success: ${success}, Failed: ${fail}`));
}

main().catch(err => {
  console.error(chalk.red('Unexpected error:'), err);
});