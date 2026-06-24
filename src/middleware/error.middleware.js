// src/middleware/error.middleware.js

import { AppError } from '../common/errors/index.js';
import logger from '../config/logger.js';

// Central error handler — must be registered LAST in app.js (after all routes)
export const errorMiddleware = (err, req, res, next) => {
  // Known, intentional errors (BadRequestError, NotFoundError, etc.)
  if (err instanceof AppError) {
    logger.warn(`[${err.statusCode}] ${err.message}`);
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Anything unexpected — log full detail, never leak internals to the client
  logger.error(err.stack || err.message || err);

  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
};