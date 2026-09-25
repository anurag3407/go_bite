// lib/server/validation.ts
// Zod schemas for every /api/v1 request body (plan.md §9). Route handlers never
// touch raw input. Validation failures surface as VALIDATION_ERROR with field
// details, so the client can render inline errors.

import { z } from 'zod';
import { MAX_LINE_QUANTITY } from './pricing';

/** Accepts common Indian phone formats; normalisation happens server-side. */
export const phoneSchema = z
  .string()
  .trim()
  .min(10, 'Enter a 10-digit mobile number.')
  .max(16, 'Enter a valid mobile number.')
  .regex(/^(\+?91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number.');

export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code.');

export const otpRequestSchema = z.object({ phone: phoneSchema });

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  otp: otpSchema,
  campusId: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(80).optional(),
});

export const selectCampusSchema = z.object({
  campusId: z.string().trim().min(1).max(64),
});

export const cartUpsertSchema = z.object({
  shopId: z.string().trim().min(1).max(64),
  itemId: z.string().trim().min(1).max(64),
  quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY),
});

export const paymentMethodSchema = z.enum(['UPI_INTENT', 'GATEWAY_ONLINE', 'CASH_ON_DELIVERY', 'CAMPUS_WALLET']);

export const createOrderSchema = z.object({
  campusLocationId: z.string().trim().min(1).max(64),
  roomOrFlat: z.string().trim().min(1, 'Enter your room or block.').max(50),
  landmark: z.string().trim().max(200).optional(),
  alternatePhone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit number.')
    .optional(),
  paymentMethod: paymentMethodSchema,
  specialInstructions: z.string().trim().max(300).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3, 'Tell us why you are cancelling.').max(300),
});

export const shopStatusSchema = z
  .object({
    isOpen: z.boolean().optional(),
    snoozeMinutes: z.number().int().min(1).max(24 * 60).optional(),
  })
  .refine((v) => v.isOpen !== undefined || v.snoozeMinutes !== undefined, {
    message: 'Provide isOpen and/or snoozeMinutes.',
  });

export const shopProfileSchema = z.object({
  deliveryFee: z.number().min(0).max(500).optional(),
  minOrderForFreeDelivery: z.number().min(0).max(5000).nullable().optional(),
  prepTimeMinutes: z.number().int().min(1).max(240).optional(),
  upiVpa: z.string().trim().max(100).optional(),
});

export const setItemAvailabilitySchema = z.object({ isAvailable: z.boolean() });

export const rejectOrderSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export const orderStatusSchema = z.enum([
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'DISPUTED',
]);

export const shopOrderStatusSchema = z.object({ toStatus: orderStatusSchema });

export const verifyPinSchema = z.object({
  pin: z.string().trim().regex(/^\d{4}$/, 'Enter the 4-digit PIN.'),
});

/** Customer-initiated order actions. */
export const orderActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('cancel'),
    reason: z.string().trim().min(3, 'Tell us why you are cancelling.').max(300),
  }),
  z.object({
    action: z.literal('dispute'),
    note: z.string().trim().min(3, 'Describe the problem.').max(500),
  }),
  z.object({
    action: z.literal('rotate-pin'),
  }),
]);

/** Merchant-initiated order actions. */
export const shopOrderActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }),
  z.object({
    action: z.literal('reject'),
    reason: z.string().trim().min(3, 'Give the student a reason.').max(300),
  }),
  z.object({ action: z.literal('status'), toStatus: orderStatusSchema }),
  z.object({ action: z.literal('verify-pin'), pin: z.string().trim().regex(/^\d{4}$/, 'Enter the 4-digit PIN.') }),
]);

export const supportOverrideSchema = z.object({
  note: z.string().trim().min(3, 'Record why this delivery is being completed.').max(500),
});

export const deviceSchema = z.object({
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
  expoPushToken: z.string().trim().min(8).max(400),
});

export const createTicketSchema = z.object({
  orderId: z.string().trim().min(1).max(64).optional(),
  subject: z.string().trim().min(3, 'Give your issue a subject.').max(200),
  body: z.string().trim().min(3, 'Describe the problem.').max(2000),
});

export const resolveTicketSchema = z.object({
  status: z.enum(['INVESTIGATING', 'RESOLVED', 'REJECTED']),
  resolution: z.string().trim().max(2000).optional(),
});

export const shopProfileUpdateSchema = z.object({
  deliveryFee: z.number().min(0).max(500).optional(),
  minOrderForFreeDelivery: z.number().min(0).max(5000).nullable().optional(),
  prepTimeMinutes: z.number().int().min(1).max(240).optional(),
  upiVpa: z.string().trim().max(100).optional(),
});
