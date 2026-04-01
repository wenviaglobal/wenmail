import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase, alphanumeric with hyphens"),
  contactEmail: z.string().email(),
  contactPhone: z.string().max(50).optional(),
  planId: z.string().uuid(),
});

export const updateClientSchema = createClientSchema.partial().extend({
  status: z.enum(["active", "suspended", "cancelled"]).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
