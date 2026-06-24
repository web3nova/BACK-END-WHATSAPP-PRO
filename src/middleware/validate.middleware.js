// src/middleware/validate.middleware.js
import { BadRequestError } from '../common/errors/index.js';

// Wraps a zod schema shaped like { body?, query?, params? } and validates
// the matching parts of the request. On success, replaces req.body/query/params
// with the parsed (and coerced/defaulted) values.
export const validate = (schema) => (req, res, next) => {
  try {
    const toValidate = {
      ...(schema.shape.body ? { body: req.body } : {}),
      ...(schema.shape.query ? { query: req.query } : {}),
      ...(schema.shape.params ? { params: req.params } : {}),
    };

    const parsed = schema.parse(toValidate);

    if (parsed.body) req.body = parsed.body;
    if (parsed.query) req.query = parsed.query;
    if (parsed.params) req.params = parsed.params;

    return next();
  } catch (err) {
    if (err.name === 'ZodError') {
      return next(new BadRequestError('Validation failed', err.errors));
    }
    return next(err);
  }
};

export default validate;