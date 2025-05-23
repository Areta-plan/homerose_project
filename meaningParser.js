// meaningParser.js
// Utility to extract title, first paragraph and closing sections from raw text
// based on semantic cues as described in project requirements.

function parseRawContentMeaningBased(raw) {
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
    const lines = text.split('\n');
    title = lines.shift().trim();
    body = lines.join('\n');
  }

  const paragraphs = body
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  const firstPatterns = [
    /혹시.*고민.*(있으신가요|있나요|있습니까)/i,
    /많은 분들이.*걱정/i,
    /이 글.*클릭.*분들/i,
    /5분만.*투자.*보세요/i
  ];

  let firstparagraph = '';
  for (const p of paragraphs) {
    if (firstPatterns.some(re => re.test(p))) {
      firstparagraph = p;
      break;
    }
  }
  if (!firstparagraph) {
    if (paragraphs.length > 1) {
      firstparagraph = `${paragraphs[0]}\n\n${paragraphs[1]}`;
    } else {
      firstparagraph = paragraphs[0] || '';
    }
  }

  const closingPatterns = [
    /지금 바로 연락 안 주셔도 됩니다/i,
    /작은 선택이 미래를 바꿉니다/i,
    /저희는 그걸로 충분합니다/i,
    /부담 없이 연락 주세요/i,
    /꼭 지금 당장이 아니어도 괜찮습니다/i
  ];

  let closing = '';
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i];
    if (closingPatterns.some(re => re.test(p))) {
      closing = p;
      break;
    }
  }

  if (!closing) {
    const candidates = paragraphs.slice(-3);
    closing = candidates.reduce((longest, p) => (p.length > longest.length ? p : longest), '');
  }

  const result = {};
  if (title) result.title = title;
  if (firstparagraph) result.firstparagraph = firstparagraph;
  if (closing) result.closing = closing;

  return Object.keys(result).length ? result : null;
}

module.exports = { parseRawContentMeaningBased };