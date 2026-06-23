import { BadRequestError } from '../../../common/errors/index.js';

const TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

/**
 * Extract raw text from an uploaded file buffer.
 * @param {object} file - { buffer, mimetype, originalname }
 * @returns {Promise<string>}
 */
export async function extractText(file) {
  const { buffer, mimetype = '', originalname = '' } = file;

  if (TEXT_TYPES.has(mimetype) || /\.(txt|md|csv|json)$/i.test(originalname)) {
    return buffer.toString('utf8');
  }

  if (mimetype === 'application/pdf' || /\.pdf$/i.test(originalname)) {
    // pdf-parse is an optional dependency — loaded lazily so text uploads
    // work without it. Add `pdf-parse` to package.json to enable PDFs.
    try {
      const { default: pdfParse } = await import('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text;
    } catch {
      throw new BadRequestError('PDF parsing not available — add the "pdf-parse" dependency.');
    }
  }

  throw new BadRequestError(`Unsupported file type: ${mimetype || originalname}`);
}

export default extractText;
