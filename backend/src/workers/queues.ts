import { Queue } from "bullmq";
import { redis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

const connection = { connection: redis };

let _dnsCheckQueue: Queue | null = null;
let _quotaSyncQueue: Queue | null = null;
let _logCleanupQueue: Queue | null = null;
let _domainSetupQueue: Queue | null = null;
let _dkimRotationQueue: Queue | null = null;
let _mailLogQueue: Queue | null = null;
let _scheduledSendQueue: Queue | null = null;

function createQueue(name: string): Queue | null {
  try {
    const q = new Queue(name, connection);
    q.on("error", (err) => {
      logger.warn({ queue: name, err: err.message }, "Queue error (non-fatal)");
    });
    return q;
  } catch (err) {
    logger.warn({ queue: name }, "Failed to create queue — Redis may be too old");
    return null;
  }
}

export function initQueues() {
  _dnsCheckQueue = createQueue("dns-check");
  _quotaSyncQueue = createQueue("quota-sync");
  _logCleanupQueue = createQueue("log-cleanup");
  _domainSetupQueue = createQueue("domain-setup");
  _dkimRotationQueue = createQueue("dkim-rotation");
  _mailLogQueue = createQueue("mail-log-sync");
  _scheduledSendQueue = createQueue("scheduled-send");
}

export function getDnsCheckQueue() { return _dnsCheckQueue; }
export function getQuotaSyncQueue() { return _quotaSyncQueue; }
export function getLogCleanupQueue() { return _logCleanupQueue; }
export function getDomainSetupQueue() { return _domainSetupQueue; }
export function getDkimRotationQueue() { return _dkimRotationQueue; }
export function getMailLogQueue() { return _mailLogQueue; }
export function getScheduledSendQueue() { return _scheduledSendQueue; }
