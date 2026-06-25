// Flat string permissions — resource:action pattern
export const PERMISSIONS = {
  // Users
  USERS_READ:   'users:read',
  USERS_WRITE:  'users:write',
  USERS_DELETE: 'users:delete',

  // Roles
  ROLES_READ:   'roles:read',
  ROLES_WRITE:  'roles:write',
  ROLES_DELETE: 'roles:delete',

  // Products / Catalog
  PRODUCTS_READ:   'products:read',
  PRODUCTS_WRITE:  'products:write',
  PRODUCTS_DELETE: 'products:delete',
  CATALOG_READ:    'catalog:read',
  CATALOG_WRITE:   'catalog:write',

  // Orders / Quotes
  ORDERS_READ:   'orders:read',
  ORDERS_WRITE:  'orders:write',
  QUOTES_READ:   'quotes:read',
  QUOTES_WRITE:  'quotes:write',

  // Conversations
  CONVERSATIONS_READ:   'conversations:read',
  CONVERSATIONS_WRITE:  'conversations:write',

  // Billing
  BILLING_READ:  'billing:read',
  BILLING_WRITE: 'billing:write',

  // Knowledge
  KNOWLEDGE_READ:  'knowledge:read',
  KNOWLEDGE_WRITE: 'knowledge:write',
};

// Preset bundles for seeding default roles
export const ROLE_PRESETS = {
  ADMIN: Object.values(PERMISSIONS), // all permissions
  MANAGER: [
    'users:read',
    'products:read', 'products:write',
    'catalog:read',  'catalog:write',
    'orders:read',   'orders:write',
    'quotes:read',   'quotes:write',
    'conversations:read', 'conversations:write',
    'knowledge:read', 'knowledge:write',
  ],
  STAFF: [
    'products:read',
    'catalog:read',
    'orders:read',
    'quotes:read',
    'conversations:read', 'conversations:write',
  ],
};