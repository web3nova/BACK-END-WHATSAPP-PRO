import { ForbiddenError } from '../common/errors/index.js';
import { isSubscriptionActive } from '../modules/billing/billing.service.js';

// BizIQ sells one product at different billing cadences (weekly / monthly /
// quarterly / yearly) — there are no feature-tiered plans, so the only thing
// worth gating is "is this tenant currently paying or in an active trial?".
//
// Usage on any route: router.use(requireActiveSubscription())
export const requireActiveSubscription = () =>
  async (req, res, next) => {
    try {
      if (req.user?.isSuperAdmin) return next();

      const tenantId = req.tenant?.id;
      if (!tenantId) return next(new ForbiddenError('No tenant context'));

      if (!(await isSubscriptionActive(tenantId))) {
        return next(new ForbiddenError('Your trial or subscription has ended. Please subscribe to continue.'));
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };

export default requireActiveSubscription;
