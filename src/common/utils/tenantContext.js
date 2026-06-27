import { BadRequestError } from '../errors/index.js';

export function getTenantId(req) {
  const id = req.tenant?.id;
  if (!id) {
    throw new BadRequestError(
      'Missing tenant context. This route requires an authenticated tenant.',
    );
  }
  return id;
}

export default getTenantId;
