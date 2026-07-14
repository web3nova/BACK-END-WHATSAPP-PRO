import { Router } from 'express';
import * as checkoutController from './checkout.controller.js';
import { customerAuthMiddleware } from '../../middleware/customer-auth.middleware.js';

const router = Router();

router.post('/',
  customerAuthMiddleware,
  checkoutController.initializeCheckout
);

router.post('/place-order',
  customerAuthMiddleware,
  checkoutController.placeOrder
);

router.post('/validate-coupon',
  customerAuthMiddleware,
  checkoutController.validateCoupon
);

router.get('/customer/orders',
  customerAuthMiddleware,
  checkoutController.getCustomerOrders
);

router.get('/orders/:id',
  customerAuthMiddleware,
  checkoutController.getCustomerOrder
);

router.post('/orders/:id/claim-payment',
  customerAuthMiddleware,
  checkoutController.claimPayment
);

router.post('/webhook/paystack', checkoutController.paystackWebhook);

router.get('/providers', checkoutController.getPaymentProviders);

router.post('/test-payment', checkoutController.testPayment);

export default router;
