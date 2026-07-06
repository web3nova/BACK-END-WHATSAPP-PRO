// src/middleware/error.middleware.js

import { ZodError } from 'zod';
import { AppError } from '../common/errors/index.js';
import logger from '../config/logger.js';

// Central error handler — must be registered LAST in app.js (after all routes)
export const errorMiddleware = (err, req, res, next) => {
  // Zod validation errors (from direct .parse() calls in controllers)
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.flatten(),
    });
  }

  // Known, intentional errors (BadRequestError, NotFoundError, etc.)
  if (err instanceof AppError) {
    logger.warn(`[${err.statusCode}] ${err.message}`);
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // HTTP errors from body-parser / express (malformed JSON → 400, payload too large → 413, etc.)
  const httpStatus = err.status || err.statusCode;
  if (httpStatus && httpStatus < 500) {
    return res.status(httpStatus).json({
      success: false,
      message: err.message || 'Bad request',
    });
  }

  // Anything unexpected — log full detail, never leak internals to the client
  logger.error(err.stack || err.message || err);

  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
};