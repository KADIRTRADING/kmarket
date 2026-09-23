import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requirePermission } from "../../middleware/authenticate.js";
import { requireActiveStore } from "../../middleware/requireActiveStore.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { ValidationError } from "../../lib/errors.js";
import {
  cancelDraftSale,
  cancelHeldCart,
  checkout,
  getSale,
  holdCart,
  listHeldCarts,
  listSales,
  resumeHeldCart,
  returnSale,
} from "./service.js";
import { checkoutSchema, holdCartSchema, returnSaleSchema } from "./schemas.js";
import { generateReceiptPdf } from "./receipt.js";
import { pool } from "../../db/pool.js";

/**
 * POS sales routes. All require an ACTIVE store (R3.2) — a suspended/pending store's
 * cashiers cannot create sales at all, enforced here on the backend regardless of
 * client state.
 */
export async function registerSalesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireActiveStore);

  app.get("/sales", { preHandler: requirePermission(PERMISSIONS.POS_SELL) }, async (request, reply) => {
    const query = z.object({
      branchId: z.string().uuid().optional(),
      cashierId: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(request.query);
    reply.send(await listSales(request.auth!.storeId!, query));
  });

  app.get("/sales/:saleId", { preHandler: requirePermission(PERMISSIONS.POS_SELL) }, async (request, reply) => {
    const { saleId } = request.params as { saleId: string };
    reply.send(await getSale(request.auth!.storeId!, saleId));
  });

  /**
   * Checkout. Requires an `Idempotency-Key` header (R7.8) — a client MUST generate
   * one UUID per logical checkout attempt at cart-build time and reuse it across
   * retries caused by network reconnection; it must NOT generate a new key per retry.
   */
  app.post("/sales", { preHandler: requirePermission(PERMISSIONS.POS_SELL) }, async (request, reply) => {
    const idempotencyKey = request.headers["idempotency-key"];
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      throw new ValidationError("Idempotency-Key header majburiy");
    }
    const body = checkoutSchema.parse(request.body);
    const sale = await checkout(request.auth!.storeId!, request.auth!.userId, idempotencyKey, body);
    reply.status(201).send(sale);
  });

  app.get("/sales/:saleId/receipt.pdf", { preHandler: requirePermission(PERMISSIONS.POS_SELL) }, async (request, reply) => {
    const { saleId } = request.params as { saleId: string };
    const sale = await getSale(request.auth!.storeId!, saleId);
    const { rows } = await pool.query<{ name: string; default_language: "uz" | "ru" }>(`SELECT name, default_language FROM stores WHERE id = $1`, [request.auth!.storeId]);
    const store = rows[0]!;
    const stream = generateReceiptPdf(store.name, sale as never, store.default_language);
    reply.header("Content-Type", "application/pdf").header("Content-Disposition", `inline; filename=receipt-${sale.sale_number}.pdf`);
    reply.send(stream);
  });

  app.post("/sales/:saleId/cancel", { preHandler: requirePermission(PERMISSIONS.POS_SELL) }, async (request, reply) => {
    const { saleId } = request.params as { saleId: string };
    await cancelDraftSale(request.auth!.storeId!, saleId);
    reply.status(204).send();
  });

  app.post("/sales/:saleId/return", { preHandler: requirePermission(PERMISSIONS.POS_RETURN) }, async (request, reply) => {
    const { saleId } = request.params as { saleId: string };
    const body = returnSaleSchema.parse(request.body);
    reply.status(201).send(await returnSale(request.auth!.storeId!, saleId, request.auth!.userId, body));
  });

  // --- Held carts (R7.4) ---
  app.get("/held-carts", { preHandler: requirePermission(PERMISSIONS.POS_HOLD) }, async (request, reply) => {
    const { branchId } = z.object({ branchId: z.string().uuid() }).parse(request.query);
    reply.send(await listHeldCarts(request.auth!.storeId!, branchId));
  });

  app.post("/held-carts", { preHandler: requirePermission(PERMISSIONS.POS_HOLD) }, async (request, reply) => {
    const body = holdCartSchema.parse(request.body);
    reply.status(201).send(await holdCart(request.auth!.storeId!, body.branchId, request.auth!.userId, body.label, body.cart));
  });

  app.get("/held-carts/:cartId", { preHandler: requirePermission(PERMISSIONS.POS_HOLD) }, async (request, reply) => {
    const { cartId } = request.params as { cartId: string };
    reply.send(await resumeHeldCart(request.auth!.storeId!, cartId));
  });

  app.delete("/held-carts/:cartId", { preHandler: requirePermission(PERMISSIONS.POS_HOLD) }, async (request, reply) => {
    const { cartId } = request.params as { cartId: string };
    await cancelHeldCart(request.auth!.storeId!, cartId);
    reply.status(204).send();
  });
}
