// lib/server/config.ts
// Platform parameters that CONFIG_CHANGER roles tune. In a full deployment these
// are read from a `platform_config` table with a 60s cache (plan.md §9.7); the
// pilot keeps them as typed constants so behaviour is deterministic and testable.

export const PLATFORM_CONFIG = {
  /** Cash on delivery is refused above this amount, limiting fraud exposure. */
  codMaxRupees: 1000,
  /** Maximum live (non-terminal) orders a customer may hold at once. */
  maxActiveOrdersPerCustomer: 3,
  /** Maximum live orders a merchant may be working through before auto-snooze. */
  maxActiveOrdersPerShop: 15,
  /** COD orders are collected by merchant staff; platform fee is still charged. */
  platformFeeRupees: 5,
} as const;
