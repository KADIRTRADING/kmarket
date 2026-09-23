import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requirePermission } from "../../middleware/authenticate.js";
import { requireActiveStore } from "../../middleware/requireActiveStore.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { getStoreClickCredentialsSafe, saveStoreClickCredentials } from "./credentials.js";
import { getClickTransactionsForStore, handleClickComplete, handleClickPrepare, initiateClickPayment, refundClickTransaction } from "./service.js";
import { createDraftSaleForClick } from "../sales/service.js";
import { checkoutSchema } from "../sales/schemas.js";

const saveCredentialsSchema = z.object({
  merchantId: z.string().min(1),
  serviceId: z.string().min(1),
  merchantUserId: z.string().min(1),
  secretKey: z.string().min(1),
  isLive: z.boolean().default(false),
});

const initiatePaymentSchema = checkoutSchema.omit({ payments: true });

export async function registerClickRoutes(app: FastifyInstance): Promise<void> {
  // --- Store-facing config + initiation (authenticated, /v1 prefix logically but
  // registered without a global prefix in app.ts so webhook paths stay fixed) ---
  app.register(async (authApp) => {
    authApp.addHook("preHandler", authenticate);

    authApp.get("/v1/click/credentials", { preHandler: requirePermission(PERMISSIONS.CLICK_CONFIGURE) }, async (request, reply) => {
      reply.send(await getStoreClickCredentialsSafe(request.auth!.storeId!));
    });

    authApp.put("/v1/click/credentials", { preHandler: requirePermission(PERMISSIONS.CLICK_CONFIGURE) }, async (request, reply) => {
      const body = saveCredentialsSchema.parse(request.body);
      await saveStoreClickCredentials(request.auth!.storeId!, body);
      reply.status(204).send();
    });

    authApp.addHook("preHandler", requireActiveStore);

    authApp.get("/v1/click/transactions", { preHandler: requirePermission(PERMISSIONS.CLICK_CONFIGURE) }, async (request, reply) => {
      reply.send(await getClickTransactionsForStore(request.auth!.storeId!));
    });

    /**
     * Creates a DRAFT sale + PENDING click_transactions row, and returns a checkout
     * URL for the cashier to present (e.g. as a QR code) to the customer's device.
     * The sale becomes COMPLETED/PAID only once the Complete webhook is verified.
     */
    authApp.post("/v1/click/initiate", { preHandler: requirePermission(PERMISSIONS.POS_SELL) }, async (request, reply) => {
      const body = initiatePaymentSchema.parse(request.body);
      const sale = await createDraftSaleForClick(request.auth!.storeId!, request.auth!.userId, body);
      const result = await initiateClickPayment(request.auth!.storeId!, (sale as { id: string }).id, (sale as { total: number }).total);
      reply.status(201).send({ sale, ...result });
    });

    authApp.post("/v1/click/transactions/:transactionId/refund", { preHandler: requirePermission(PERMISSIONS.CLICK_REFUND) }, async (request, reply) => {
      const { transactionId } = request.params as { transactionId: string };
      const { reason } = z.object({ reason: z.string().min(1) }).parse(request.body);
      reply.send(await refundClickTransaction(request.auth!.storeId!, transactionId, reason));
    });
  });

  // --- Public Click webhooks (Click calls these directly; no user auth — verified
  // by MD5 signature per-request instead, per Click's protocol). Fixed URLs: these
  // MUST be registered with Click Business as your callback URLs (R8.3, R8.6). ---
  app.post("/webhooks/click/prepare", async (request, reply) => {
    const result = await handleClickPrepare(request.body as never);
    reply.send(result);
  });

  app.post("/webhooks/click/complete", async (request, reply) => {
    const result = await handleClickComplete(request.body as never);
    reply.send(result);
  });
}
