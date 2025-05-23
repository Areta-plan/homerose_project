/**
 * blog_extract.js
 *
 * Simple CLI utility for crawling blog posts and saving their cleaned text.
 *
 * Usage:
 *   node blog_extract.js <URL1> <URL2> ...
 *
 * The script visits each URL using Puppeteer, extracts the main article
 * content, removes common advertisement phrases and phone numbers, and
 * stores the result in the `raw_corpus` directory.
 */

const fs = require('fs');           // File system utilities
const path = require('path');       // Utility for handling file paths
const chalk = require('chalk').default;     // Colored console output
const mkdirp = require('mkdirp');   // Recursive directory creation
const puppeteer = require('puppeteer'); // Headless browser for scraping

// Directory to store raw corpus
const outputDir = path.join(__dirname, 'raw_corpus');
mkdirp.sync(outputDir);

// Determine the next numeric suffix for the output file based on existing files
// e.g. if blog_001.txt and blog_002.txt exist, this returns 3.
function getNextIndex() {
  const files = fs
    .readdirSync(outputDir)
    .filter(f => /^blog_\d{3}\.txt$/.test(f));

  if (files.length === 0) return 1;

  const indices = files.map(f => parseInt(f.match(/(\d{3})/)[0], 10));
  return Math.max(...indices) + 1;
}

// Cleans raw text extracted from a page.
// 1. Remove phone numbers.
// 2. Strip out promotional phrases.
// 3. Collapse consecutive blank lines.
function cleanText(text) {
  if (!text) return '';

  // Regex pattern for phone numbers (e.g. 02-1234-5678, 01012345678)
  text = text.replace(/\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, '');

  // Remove common advertising phrases
  const phrases = ['클릭', '카톡상담', '컨설', '문의', '연락주세요'];
  const phraseRegex = new RegExp(phrases.join('|'), 'g');
  text = text.replace(phraseRegex, '');

  // Reduce multiple blank lines to a single line break
  text = text.replace(/\n{2,}/g, '\n');
  return text.trim();
}
// Extracts the main content element from the loaded page.
// For Naver blogs, the real article is inside an iframe named "mainFrame".
// For other sites, fall back to common article containers.
async function extractContent(page, url) {
  const domain = new URL(url).hostname;

  // Handle Naver blogs where the article is nested inside an iframe
  if (domain.includes('naver.com')) {
    try {
      await page.waitForSelector('iframe#mainFrame', { timeout: 5000 });
      const frame = page.frames().find(f => f.name() === 'mainFrame');
      if (frame) {
        return frame
          .$eval('.se-main-container', el => el.innerText)
          .catch(() => null);
      }
    } catch (e) {
      return null;
    }
  } else {
    // Try common article containers on generic sites
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

// Entry point. Processes the URLs provided on the command line.
async function main() {
  const urls = process.argv.slice(2);
  
  // Print usage message when no URLs are supplied
  if (urls.length === 0) {
    console.log('Usage: node blog_extract.js <URL1> <URL2> ...');
    process.exit(1);
  }

  const browser = await puppeteer.launch();  // Launch headless browser
  let nextIndex = getNextIndex();            // Starting file index
  let success = 0;
  let fail = 0;

  for (const url of urls) {
    const page = await browser.newPage();

    try {
    // Navigate to the page and attempt to pull the main text
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
  // Summary output after processing all URLs
  console.log(
    chalk.blue(`\nProcessed ${urls.length} URLs -> Success: ${success}, Failed: ${fail}`)
  );
}

main().catch(err => {
  console.error(chalk.red('Unexpected error:'), err);
});
