import type { FastifyInstance } from "fastify";
import { loginSchema, refreshSchema } from "./schemas.js";
import { loginPlatformUser, loginStoreUser, refreshSession, revokeSession } from "./service.js";

/**
 * Auth endpoints. Rate-limited to reduce credential-stuffing risk (R4.5).
 * Store users authenticate with `phone`; platform staff authenticate with `email`.
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const rateLimitConfig = { rateLimit: { max: 10, timeWindow: "1 minute" } };

  app.post("/login", { config: rateLimitConfig }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const meta = { userAgent: request.headers["user-agent"], ipAddress: request.ip };

    const result = body.email
      ? await loginPlatformUser(body.email, body.password, meta)
      : await loginStoreUser({ phone: body.phone }, body.password, meta);

    reply.send(result);
  });

  app.post("/refresh", { config: rateLimitConfig }, async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const meta = { userAgent: request.headers["user-agent"], ipAddress: request.ip };
    const result = await refreshSession(body.refreshToken, meta);
    reply.send(result);
  });

  app.post("/logout", async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    await revokeSession(body.refreshToken);
    reply.status(204).send();
  });
}
