export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PAID: 'paid',
  FULFILLED: 'fulfilled',
  CANCELLED: 'cancelled',
};

export const QUOTE_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
};

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export default { ORDER_STATUS, QUOTE_STATUS, PAYMENT_STATUS };
