import type { FastifyInstance } from "fastify";
import { authGuard } from "../auth/auth.guard.js";
import { createClientSchema, updateClientSchema } from "./client.schema.js";
import * as clientService from "./client.service.js";

export async function clientRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  // GET /api/clients
  app.get("/", async () => {
    return clientService.listClients();
  });

  // GET /api/clients/:id
  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const client = await clientService.getClient(request.params.id);
    const stats = await clientService.getClientStats(request.params.id);
    return { ...client, stats };
  });

  // POST /api/clients
  app.post("/", async (request, reply) => {
    const body = createClientSchema.parse(request.body);
    const client = await clientService.createClient(body);
    return reply.status(201).send(client);
  });

  // PUT /api/clients/:id
  app.put<{ Params: { id: string } }>("/:id", async (request) => {
    const body = updateClientSchema.parse(request.body);
    return clientService.updateClient(request.params.id, body);
  });

  // DELETE /api/clients/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    return clientService.deleteClient(request.params.id);
  });
}
