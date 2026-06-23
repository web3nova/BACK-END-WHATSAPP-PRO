/**
 * Split text into overlapping chunks, preferring to break on whitespace.
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.chunkSize=1000]  - target characters per chunk
 * @param {number} [opts.overlap=150]     - characters shared between neighbours
 * @returns {string[]}
 */
export function chunkText(text, { chunkSize = 1000, overlap = 150 } = {}) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);

    // Try to break on the last space within the window to avoid cutting words.
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(' ', end);
      if (lastSpace > start + chunkSize * 0.5) end = lastSpace;
    }

    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks.filter(Boolean);
}

export default chunkText;
