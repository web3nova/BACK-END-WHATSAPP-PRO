// Plan definitions — feature limits per plan
// All modules check against these via subscription.middleware.js

// TEMPORARY: free plan is unrestricted (matches enterprise) until we have a
// real mechanism for tuning per-plan limits without a code change/deploy.
export const PLANS = {
  free: {
    maxUsers:         Infinity,
    maxProducts:      Infinity,
    maxOrders:        Infinity,
    aiReplies:        Infinity,
    knowledgeDocs:    Infinity,
    whatsappAccounts: Infinity,
    websiteBuilder:   true,
  },
  starter: {
    maxUsers:         5,
    maxProducts:      100,
    maxOrders:        500,
    aiReplies:        1000,
    knowledgeDocs:    10,
    whatsappAccounts: 1,
    websiteBuilder:   true,
  },
  pro: {
    maxUsers:         20,
    maxProducts:      1000,
    maxOrders:        5000,
    aiReplies:        10000,
    knowledgeDocs:    50,
    whatsappAccounts: 3,
    websiteBuilder:   true,
  },
  enterprise: {
    maxUsers:         Infinity,
    maxProducts:      Infinity,
    maxOrders:        Infinity,
    aiReplies:        Infinity,
    knowledgeDocs:    Infinity,
    whatsappAccounts: Infinity,
    websiteBuilder:   true,
  },
};

export const getPlanLimits = (plan) => PLANS[plan] ?? PLANS.free;