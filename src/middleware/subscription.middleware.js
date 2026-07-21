import { ForbiddenError } from '../common/errors/index.js';
import prisma from '../config/prisma.js';
import { config } from '../config/index.js';

// BizIQ sells one product at different billing cadences (weekly / monthly /
// quarterly / yearly) — there are no feature-tiered plans, so the only thing
// worth gating is "is this tenant currently paying or in an active trial?".
//
// Usage on any route: router.use(requireActiveSubscription())
export const requireActiveSubscription = () =>
  async (req, res, next) => {
    try {
      // MVP/onboarding phase — see config.billing.enforceGate comment.
      // No tenant should be locked out while we aren't charging anyone yet.
      if (!config.billing.enforceGate) return next();

      if (req.user?.isSuperAdmin) return next();

      const tenantId = req.tenant?.id;
      if (!tenantId) return next(new ForbiddenError('No tenant context'));

      const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
      const status = subscription?.status ?? 'EXPIRED';
      const trialStillValid = status === 'TRIAL' && subscription.trialEndsAt > new Date();

      if (status !== 'ACTIVE' && !trialStillValid) {
        return next(new ForbiddenError('Your trial or subscription has ended. Please subscribe to continue.'));
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };

export default requireActiveSubscription;
