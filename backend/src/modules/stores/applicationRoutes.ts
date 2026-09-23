import type { FastifyInstance } from "fastify";
import { createStoreApplicationSchema } from "./schemas.js";
import { createStoreApplication } from "./applicationService.js";

/**
 * Public (unauthenticated) endpoint for a prospective store owner to submit a
 * registration. Satisfies R3.1. No store/inventory/sales access is granted here —
 * the resulting store is PENDING until a Super Admin approves it (see
 * modules/platform/routes.ts).
 */
export async function registerStoreApplicationRoutes(app: FastifyInstance): Promise<void> {
  app.post("/", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const body = createStoreApplicationSchema.parse(request.body);
    const { storeId } = await createStoreApplication(body);
    reply.status(201).send({
      storeId,
      status: "PENDING",
      message: "Ariza qabul qilindi. Do'kon platforma tomonidan tasdiqlangandan so'ng tizimga kirishingiz mumkin.",
    });
  });
}
