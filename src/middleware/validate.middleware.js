import { BadRequestError } from '../common/errors/index.js';

/**
 * Validate a request segment with a Zod schema.
 * Usage: validate(schema, 'body' | 'query' | 'params')
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) {
    return next(new BadRequestError('Invalid request payload', parsed.error.flatten()));
  }

  req[source] = parsed.data;
  return next();
};

export default validate;
