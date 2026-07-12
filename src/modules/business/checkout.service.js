import { prisma } from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';

// Checkout service for handling delivery options and payment integration
export async function initializeCheckout(customerId, checkoutData) {
  // 1. Verify business exists for customer
  const business = await prisma.business.findUnique({
    where: { tenantId: customerId },
    select: {
      id: true,
      tenantId: true,
      displayName: true,
      deliveryStructure: true,
      deliveryPrice: true,
      expressDeliveryPrice: true,
      availableDays: true,
      email: true,
      phone: true,
      address: true,
      location: true,
    },
  });

  if (!business) {
    throw new NotFoundError('Business profile not found');
  }

  // 2. Get business settings (more detailed delivery config)
  const settings = await prisma.businessSettings.findUnique({
    where: { businessId: business.id },
    select: {
      deliveryTime: true,
      deliveryOptions: true,
      expressDeliveryTime: true,
      availableDeliveryDays: true,
      sameDayDelivery: true,
      sameDayDeliveryPrice: true,
      internationalDelivery: true,
      rushOrderHours: true,
    },
  });

  // 3. Build standardized delivery configuration
  const deliveryOptions = [
    {
      id: 'standard',
      name: 'Standard Delivery',
      time: settings?.deliveryTime || '2-3 business days',
      price: business.deliveryPrice || 0,
      description: 'Reliable delivery within business hours',
      availableDays: settings?.availableDeliveryDays || business.availableDays || ['mon', 'tue', 'wed', 'thu', 'fri'],
    },
    {
      id: 'express',
      name: 'Express Delivery',
      time: settings?.expressDeliveryTime || '1-2 business days',
      price: business.expressDeliveryPrice || business.deliveryPrice * 1.5 || 0,
      description: 'Faster delivery for urgent orders',
      availableDays: settings?.availableDeliveryDays || business.availableDays || ['mon', 'tue', 'wed', 'thu', 'fri'],
    },
    ...(settings?.sameDayDelivery ? [{
      id: 'same-day',
      name: 'Same Day Delivery',
      time: settings?.rushOrderHours || 'Within 8 hours',
      price: settings?.sameDayDeliveryPrice || business.deliveryPrice * 2 || 0,
      description: 'Delivery within 8 hours (if available)',
      availableDays: settings?.availableDeliveryDays || business.availableDays || ['mon', 'tue', 'wed', 'thu', 'fri'],
      rushOrder: true,
    }] : []),
    ...(settings?.internationalDelivery ? [{
      id: 'international',
      name: 'International Delivery',
      time: '5-10 business days',
      price: business.deliveryPrice * 3 || 0,
      description: 'Delivery to international destinations',
      availableDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
      international: true,
    }] : []),
  ];

  // 4. Calculate order totals
  const subtotal = checkoutData.items.reduce((sum, item) => sum + (item.priceMinor || 0) * item.quantity, 0);
  const deliveryFee = checkoutData.deliveryMethod ? 
    deliveryOptions.find(d => d.id === checkoutData.deliveryMethod)?.price || 0 : 0;
  const tax = Math.round(subtotal * 0.075); // 7.5% tax
  const total = subtotal + deliveryFee + tax;

  // 5. Create checkout response
  const checkoutResponse = {
    business: {
      id: business.id,
      name: business.displayName,
      email: business.email,
      phone: business.phone,
      address: business.address,
      location: business.location,
    },
    delivery: {
      options: deliveryOptions,
      selectedMethod: checkoutData.deliveryMethod ? deliveryOptions.find(d => d.id === checkoutData.deliveryMethod) : deliveryOptions[0],
      availableDays: settings?.availableDeliveryDays || business.availableDays,
    },
    payment: {
      method: checkoutData.paymentMethod || 'paystack',
      availableMethods: ['paystack', 'card', 'wallet', 'monnify'],
    },
    pricing: {
      subtotal,
      deliveryFee,
      tax,
      total,
      currency: 'NGN',
    },
    order: {
      id: generateOrderId(),
      items: checkoutData.items.map(item => ({
        id: item.id,
        name: item.name,
        price: item.priceMinor / 100,
        quantity: item.quantity,
        imageUrl: item.imageUrl || null,
      })),
      customerId,
      businessId: business.id,
    },
    metadata: {
      ipAddress: checkoutData.ipAddress || null,
      userAgent: checkoutData.userAgent || null,
      timezone: checkoutData.timezone || 'Africa/Lagos',
    },
  };

  return checkoutResponse;
}

function generateOrderId() {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

export async function processPayment(customerId, paymentData) {
  const { orderId, paymentMethod, paymentDetails } = paymentData;

  // Create payment record
  const payment = await prisma.payment.create({
    data: {
      tenantId: customerId,
      orderId,
      reference: generatePaymentReference(),
      provider: paymentMethod,
      providerReference: paymentDetails.providerReference || null,
      amountMinor: paymentDetails.amount || 0,
      currency: paymentDetails.currency || 'NGN',
      status: 'pending',
      meta: {
        paymentMethod,
        paymentDetails,
        ipAddress: paymentDetails.ipAddress || null,
        userAgent: paymentDetails.userAgent || null,
      },
    },
    select: {
      id: true,
      tenantId: true,
      orderId: true,
      reference: true,
      provider: true,
      providerReference: true,
      amountMinor: true,
      currency: true,
      status: true,
      meta: true,
      createdAt: true,
    },
  });

  // If payment method requires external gateway, redirect to payment page
  if (paymentMethod === 'paystack' || paymentMethod === 'monnify') {
    return {
      ...payment,
      redirectUrl: generatePaymentRedirectUrl(payment, paymentMethod, paymentDetails),
    };
  }

  return payment;
}

function generatePaymentReference() {
  return `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 12).toUpperCase()}`;
}

function generatePaymentRedirectUrl(payment, provider, paymentDetails) {
  switch (provider) {
    case 'paystack':
      return `https://checkout.paystack.co/${payment.amountMinor}/${payment.currency}/${payment.reference}`;
    case 'monnify':
      return `https://checkout.monnify.com/pay/${payment.amountMinor}/${payment.reference}`;
    default:
      return `/checkout/${payment.id}/success`;
  }
}

export async function completeOrder(customerId, orderId) {
  // Update order to completed status
  const order = await prisma.order.update({
    where: { id: orderId, customerId },
    data: { status: 'completed' },
    select: {
      id: true,
      tenantId: true,
      status: true,
      totalMinor: true,
      currency: true,
      createdAt: true,
    },
  });

  // Create fulfillment record
  const fulfillment = await prisma.fulfillment.create({
    data: {
      orderId,
      customerId,
      status: 'pending',
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    },
    select: {
      id: true,
      status: true,
      estimatedDelivery: true,
      createdAt: true,
    },
  });

  return {
    order,
    fulfillment,
    message: 'Order completed successfully',
  };
}
