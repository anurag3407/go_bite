// lib/auth.ts - Better Auth configuration and RBAC Permissions
import { UserRole } from './types';

export type Permission = 
  | 'platform:manage'
  | 'campus:manage'
  | 'config:change'
  | 'tickets:resolve'
  | 'orders:refund'
  | 'menu:manage'
  | 'shop:open_close'
  | 'orders:accept'
  | 'delivery:verify_pin'
  | 'order:place'
  | 'ticket:create';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: [
    'platform:manage',
    'campus:manage',
    'config:change',
    'tickets:resolve',
    'orders:refund',
    'menu:manage',
    'shop:open_close',
    'orders:accept',
    'delivery:verify_pin',
    'order:place',
    'ticket:create',
  ],
  CAMPUS_ADMIN: [
    'campus:manage',
    'config:change',
    'tickets:resolve',
    'orders:refund',
    'menu:manage',
    'shop:open_close',
    'orders:accept',
    'delivery:verify_pin',
  ],
  CONFIG_CHANGER: [
    'config:change',
  ],
  QUERY_RESOLVER: [
    'tickets:resolve',
    'orders:refund',
  ],
  SHOP_OWNER: [
    'menu:manage',
    'shop:open_close',
    'orders:accept',
    'delivery:verify_pin',
  ],
  SHOP_STAFF: [
    'orders:accept',
    'delivery:verify_pin',
  ],
  CUSTOMER: [
    'order:place',
    'ticket:create',
  ],
};

export function can(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}
