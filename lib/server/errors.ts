// lib/server/errors.ts
// Exhaustive error catalog for /api/v1 (plan.md §9.2).
// New codes require an ADR — do not invent ad-hoc strings.

export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  AUTH_OTP_INVALID: 401,
  AUTH_OTP_EXPIRED: 401,
  FORBIDDEN_TENANT: 403,
  NOT_FOUND: 404,
  CAMPUS_REQUIRED: 409,
  CAMPUS_MISMATCH: 409,
  SHOP_CLOSED: 409,
  SHOP_DELIVERY_DISABLED: 409,
  CART_CONFLICT_SINGLE_SHOP: 409,
  CART_EMPTY: 409,
  CART_ITEM_UNAVAILABLE: 409,
  MIN_ORDER_NOT_MET: 409,
  ORDER_INVALID_STATE: 409,
  PAYMENT_FAILED: 402,
  PAYMENT_PENDING: 202,
  PIN_MISMATCH: 422,
  PIN_LOCKED: 423,
  AUTH_OTP_LOCKED: 423,
  RATE_LIMITED: 429,
  AUTH_OTP_COOLDOWN: 429,
  DEPENDENCY_DOWN: 503,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly httpStatus: number;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.httpStatus = ERROR_CODES[code];
  }
}

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'The request payload failed validation.',
  UNAUTHORIZED: 'You must sign in to continue.',
  AUTH_OTP_INVALID: 'That verification code is not correct.',
  AUTH_OTP_EXPIRED: 'This verification code has expired. Request a new one.',
  FORBIDDEN_TENANT: 'Your account does not have access to this resource.',
  NOT_FOUND: 'The requested resource was not found.',
  CAMPUS_REQUIRED: 'Select a campus before continuing.',
  CAMPUS_MISMATCH: 'This resource belongs to a different campus than the one selected.',
  SHOP_CLOSED: 'This merchant is currently closed and not accepting orders.',
  SHOP_DELIVERY_DISABLED: 'This merchant does not offer delivery.',
  CART_CONFLICT_SINGLE_SHOP: 'Your cart contains items from another merchant.',
  CART_EMPTY: 'Your cart is empty.',
  CART_ITEM_UNAVAILABLE: 'One or more items in your cart are no longer available.',
  MIN_ORDER_NOT_MET: 'Your order is below this merchant\u2019s minimum order value.',
  ORDER_INVALID_STATE: 'This order cannot move to that status.',
  PAYMENT_FAILED: 'The payment could not be completed.',
  PAYMENT_PENDING: 'The payment is still awaiting confirmation.',
  PIN_MISMATCH: 'That delivery PIN is incorrect.',
  PIN_LOCKED: 'Too many incorrect PIN attempts. This order needs support review.',
  AUTH_OTP_LOCKED: 'Too many attempts. Try again later.',
  RATE_LIMITED: 'Too many requests. Please slow down.',
  AUTH_OTP_COOLDOWN: 'Please wait before requesting another code.',
  DEPENDENCY_DOWN: 'A required service is temporarily unavailable.',
  INTERNAL: 'Something went wrong on our side.',
};

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
