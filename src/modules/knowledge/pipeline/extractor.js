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
    try {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default ?? pdfParseModule;
      if (typeof pdfParse !== 'function') throw new Error('pdf-parse module did not export a function');
      const data = await pdfParse(buffer);
      return data.text;
    } catch (err) {
      throw new BadRequestError(`PDF parsing failed: ${err?.message || 'unknown error'}`);
    }
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.docx$/i.test(originalname)
  ) {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (err) {
      throw new BadRequestError(`DOCX parsing failed: ${err?.message || 'unknown error'}`);
    }
  }

  throw new BadRequestError(`Unsupported file type: ${mimetype || originalname}`);
}

export default extractText;
