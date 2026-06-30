import { ForbiddenError } from '../common/errors/index.js';
import { getPlanLimits } from '../common/constants/plans.js';
import prisma from '../config/prisma.js';

// Usage on any route:  requireFeature('websiteBuilder')
// Usage for limits:    requireFeature('maxUsers', async (tenantId) => prisma.user.count({ where: { tenantId } }))

export const requireFeature = (feature, getCurrentCount = null) =>
  async (req, res, next) => {
    try {
      if (req.user?.isSuperAdmin) return next();

      const tenantId = req.tenant?.id;
      if (!tenantId) return next(new ForbiddenError('No tenant context'));

      const subscription = await prisma.subscription.findUnique({
        where: { tenantId },
      });

      const plan   = subscription?.plan ?? 'free';
      const status = subscription?.status ?? 'active';

      if (status === 'CANCELLED' || status === 'EXPIRED') {
        return next(new ForbiddenError(`Subscription is ${status.toLowerCase()}. Please renew to continue.`));
      }

      const limits = getPlanLimits(plan);
      const limit  = limits[feature];

      // Boolean feature flag (e.g. websiteBuilder)
      if (typeof limit === 'boolean') {
        if (!limit) {
          return next(new ForbiddenError(`Your plan does not include ${feature}. Please upgrade.`));
        }
        return next();
      }

      // Numeric limit with a count function
      if (typeof limit === 'number' && getCurrentCount) {
        const current = await getCurrentCount(tenantId);
        if (current >= limit) {
          return next(
            new ForbiddenError(
              `You have reached the ${feature} limit (${limit}) on your current plan. Please upgrade.`
            )
          );
        }
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };

export default requireFeature;