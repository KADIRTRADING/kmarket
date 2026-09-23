import type { FastifyInstance } from "fastify";
import { AppError } from "../lib/errors.js";
import { ZodError } from "zod";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details ?? null },
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(422).send({
        error: { code: "VALIDATION_ERROR", message: "Validation failed", details: error.flatten() },
      });
      return;
    }

    // Fastify's own validation errors (JSON schema) come with a statusCode already.
    if ((error as { statusCode?: number }).statusCode && (error as { statusCode: number }).statusCode < 500) {
      reply.status((error as { statusCode: number }).statusCode).send({
        error: { code: "BAD_REQUEST", message: error.message },
      });
      return;
    }

    request.log.error({ err: error }, "Unhandled error");
    reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
}
