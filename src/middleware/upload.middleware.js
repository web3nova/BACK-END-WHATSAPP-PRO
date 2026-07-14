import multer from 'multer';
import { BadRequestError } from '../common/errors/index.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const MAX_SIZE_BYTES     = 20 * 1024 * 1024; // 20 MB

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError('Only JPG, PNG, WebP, GIF, and HEIC photos are accepted. Please convert your file and try again.'));
  }
};

export const uploadImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
}).single('image');
