import { Queue, Worker, type Job } from "bullmq";
import type { RunJobData } from "@my-manus/shared";

export const runQueueName = "my-manus-run-jobs";

export function createRunQueue(redisUrl: string) {
  return new Queue<RunJobData>(runQueueName, {
    connection: connectionFromUrl(redisUrl)
  });
}

export function createRunWorker(
  redisUrl: string,
  processor: (job: Job<RunJobData>) => Promise<void>
) {
  return new Worker<RunJobData>(runQueueName, processor, {
    connection: connectionFromUrl(redisUrl)
  });
}

function connectionFromUrl(redisUrl: string) {
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname ? Number(url.pathname.replace("/", "") || 0) : 0,
    maxRetriesPerRequest: null
  };
}
