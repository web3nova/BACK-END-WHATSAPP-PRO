import { prisma } from '../../../config/prisma.js';

// Tool: fetch the business's payment details so the AI can tell customers how to pay.
export const getPaymentDetails = {
  name: 'get_payment_details',
  description:
    'Get the business payment details (bank account for transfer, or online payment options). Call this when the customer asks how to pay, or after they confirm an order and need payment instructions.',
  parameters: {
    type: 'object',
    properties: {},
  },
  async handler(_input, ctx) {
    const config = await prisma.paymentConfig.findUnique({ where: { tenantId: ctx.tenantId } });
    const data = config?.data;
    if (!data) {
      return { configured: false, message: 'No payment method has been set up by the business yet. Ask the customer to hold on while a staff member shares payment details.' };
    }

    const methods = [];

    if (data.manual?.isActive && data.manual.bankAccount) {
      const acct = data.manual.bankAccount;
      methods.push({
        type: 'bank_transfer',
        bankName: acct.bankName,
        accountNumber: acct.accountNumber,
        accountName: acct.accountName,
      });
    }

    if (data.paystack?.isActive) methods.push({ type: 'paystack', note: 'Online card payment available via Paystack checkout link (staff can generate one).' });
    if (data.monnify?.isActive) methods.push({ type: 'monnify', note: 'Online payment available via Monnify (staff can generate a link).' });

    if (!methods.length) {
      return { configured: false, message: 'No active payment method. Tell the customer a staff member will share payment details shortly.' };
    }

    // The business chooses its preferred provider — present that one to the
    // customer first; others are alternatives only if the customer asks.
    const preferred = data.preferredProvider === 'manual' ? 'bank_transfer' : data.preferredProvider;
    methods.sort((a, b) => (a.type === preferred ? -1 : b.type === preferred ? 1 : 0));

    return {
      configured: true,
      preferredMethod: preferred,
      methods,
      instruction: 'Share the FIRST method (the business preferred option) with the customer. Only mention alternatives if the customer asks.',
    };
  },
};

export const paymentTools = [getPaymentDetails];

export default paymentTools;
