/**
 * Permission keys used throughout the store-scoped API. Each key maps to a
 * `role_permissions` row per store (owner-editable, R4.4). DEFAULT_ROLE_PERMISSIONS
 * below is the seed applied when a store is approved; owners may subsequently grant or
 * revoke any of these per role.
 */
export const PERMISSIONS = {
  POS_SELL: "pos.sell",
  POS_HOLD: "pos.hold",
  POS_RETURN: "pos.return",
  POS_DISCOUNT: "pos.discount",
  SHIFT_OPEN_CLOSE: "shift.open_close",

  INVENTORY_VIEW: "inventory.view",
  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_TRANSFER: "inventory.transfer",
  INVENTORY_COUNT: "inventory.count",
  INVENTORY_COUNT_APPROVE: "inventory.count_approve",
  PRODUCTS_MANAGE: "products.manage",
  PRODUCTS_IMPORT_EXPORT: "products.import_export",

  PURCHASING_MANAGE: "purchasing.manage",
  PURCHASING_RECEIVE: "purchasing.receive",

  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_MANAGE: "customers.manage",
  CUSTOMERS_EXPORT_DELETE: "customers.export_delete",

  FINANCE_VIEW: "finance.view",
  FINANCE_MANAGE: "finance.manage",
  FINANCE_REVERSE: "finance.reverse",

  REPORTS_VIEW: "reports.view",
  REPORTS_EXPORT: "reports.export",

  BRANCH_MANAGE: "branch.manage",
  STAFF_MANAGE: "staff.manage",
  ROLE_PERMISSIONS_MANAGE: "role_permissions.manage",

  CLICK_CONFIGURE: "click.configure",
  CLICK_REFUND: "click.refund",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

export type StoreRole = "OWNER" | "MANAGER" | "ACCOUNTANT" | "WAREHOUSE" | "CASHIER";

/**
 * Default permission grants seeded for each role when a store is approved. OWNER
 * always implicitly has every permission (checked in code, not stored) so this map
 * does not need an OWNER entry.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<StoreRole, "OWNER">, PermissionKey[]> = {
  MANAGER: [
    PERMISSIONS.POS_SELL, PERMISSIONS.POS_HOLD, PERMISSIONS.POS_RETURN, PERMISSIONS.POS_DISCOUNT,
    PERMISSIONS.SHIFT_OPEN_CLOSE,
    PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.INVENTORY_TRANSFER,
    PERMISSIONS.INVENTORY_COUNT, PERMISSIONS.INVENTORY_COUNT_APPROVE,
    PERMISSIONS.PRODUCTS_MANAGE, PERMISSIONS.PRODUCTS_IMPORT_EXPORT,
    PERMISSIONS.PURCHASING_MANAGE, PERMISSIONS.PURCHASING_RECEIVE,
    PERMISSIONS.CUSTOMERS_VIEW, PERMISSIONS.CUSTOMERS_MANAGE,
    PERMISSIONS.FINANCE_VIEW, PERMISSIONS.FINANCE_MANAGE,
    PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.BRANCH_MANAGE, PERMISSIONS.STAFF_MANAGE,
  ],
  ACCOUNTANT: [
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.FINANCE_VIEW, PERMISSIONS.FINANCE_MANAGE, PERMISSIONS.FINANCE_REVERSE,
    PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_EXPORT,
  ],
  WAREHOUSE: [
    PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.INVENTORY_TRANSFER,
    PERMISSIONS.INVENTORY_COUNT,
    PERMISSIONS.PRODUCTS_MANAGE, PERMISSIONS.PRODUCTS_IMPORT_EXPORT,
    PERMISSIONS.PURCHASING_RECEIVE,
  ],
  CASHIER: [
    PERMISSIONS.POS_SELL, PERMISSIONS.POS_HOLD,
    PERMISSIONS.SHIFT_OPEN_CLOSE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW, PERMISSIONS.CUSTOMERS_MANAGE,
  ],
};
