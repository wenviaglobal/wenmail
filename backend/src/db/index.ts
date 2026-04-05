import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { env } from "../config/env.js";

const client = postgres(env.DATABASE_URL, { max: 50 });
export const db = drizzle(client, { schema });

export type Database = typeof db;
