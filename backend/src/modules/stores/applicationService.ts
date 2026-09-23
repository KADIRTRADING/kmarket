import { withTransaction } from "../../db/pool.js";
import { hashPassword } from "../auth/service.js";
import { DEFAULT_ROLE_PERMISSIONS } from "../../lib/permissions.js";
import type { z } from "zod";
import type { createStoreApplicationSchema } from "./schemas.js";

type CreateStoreApplicationInput = z.infer<typeof createStoreApplicationSchema>;

/**
 * Creates a new store in PENDING status plus its owner user account, all inside one
 * transaction. Does NOT seed role_permissions yet (that happens at approval time —
 * see platform/service.ts approveStore — because a store with no active status
 * cannot use permission-gated endpoints anyway, and it keeps "who configured this
 * store's permissions" traceable to the approval event).
 *
 * Satisfies R3.1: new store starts PENDING and cannot access inventory/sales/Click.
 */
export async function createStoreApplication(input: CreateStoreApplicationInput): Promise<{ storeId: string; ownerId: string }> {
  return withTransaction(async (client) => {
    const storeResult = await client.query<{ id: string }>(
      `INSERT INTO stores (name, legal_name, tax_id, contact_phone, contact_email, address, region, business_details, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
       RETURNING id`,
      [
        input.storeName,
        input.legalName ?? null,
        input.taxId ?? null,
        input.contactPhone,
        input.contactEmail ?? null,
        input.address,
        input.region ?? null,
        input.businessDetails ?? null,
      ],
    );
    const storeId = storeResult.rows[0]!.id;

    if (input.documentUrls?.length) {
      for (const url of input.documentUrls) {
        await client.query(
          `INSERT INTO store_documents (store_id, file_name, file_url) VALUES ($1, $2, $3)`,
          [storeId, url.split("/").pop() ?? "document", url],
        );
      }
    }

    const passwordHash = await hashPassword(input.ownerPassword);
    const ownerResult = await client.query<{ id: string }>(
      `INSERT INTO store_users (store_id, full_name, phone, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'OWNER')
       RETURNING id`,
      [storeId, input.ownerFullName, input.contactPhone, input.contactEmail ?? null, passwordHash],
    );

    return { storeId, ownerId: ownerResult.rows[0]!.id };
  });
}

/** Seeds default role_permissions rows for a store — called once, at approval time. */
export async function seedDefaultRolePermissions(storeId: string): Promise<void> {
  await withTransaction(async (client) => {
    for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const key of keys) {
        await client.query(
          `INSERT INTO role_permissions (store_id, role, permission_key, allowed)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (store_id, role, permission_key) DO NOTHING`,
          [storeId, role, key],
        );
      }
    }
  });
}
