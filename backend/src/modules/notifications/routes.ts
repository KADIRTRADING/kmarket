import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/authenticate.js";
import { listNotifications, markNotificationRead } from "./service.js";

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/notifications", async (request, reply) => {
    const since = request.query && (request.query as { since?: string }).since
      ? new Date((request.query as { since: string }).since)
      : undefined;
    const target = request.auth!.actorType === "PLATFORM"
      ? { platformUserId: request.auth!.userId }
      : { storeUserId: request.auth!.userId };
    reply.send(await listNotifications(target, since));
  });

  app.post("/notifications/:id/read", async (request, reply) => {
    const { id } = request.params as { id: string };
    await markNotificationRead(id);
    reply.status(204).send();
  });
}
