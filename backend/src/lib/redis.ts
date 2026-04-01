import Redis from "ioredis";
import { env } from "../config/env.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  lazyConnect: true,
});

// Prevent unhandled error crashes from Redis
redis.on("error", (err) => {
  // Silently handle in dev — Redis is optional for API to work
  if (env.NODE_ENV !== "development") {
    console.error("[Redis]", err.message);
  }
});

// Try to connect but don't crash if it fails
redis.connect().catch(() => {});
