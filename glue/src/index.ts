import { consume, consumeDeadLetters, handle, scheduleMeetings, type Env } from "./app";
import type { Job } from "./jobs";

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
  queue: (batch: MessageBatch<Job>, env: Env) => (batch.queue.endsWith("-dlq") ? consumeDeadLetters(batch, env) : consume(batch, env)),
  scheduled: async (_c: ScheduledController, env: Env, ctx: ExecutionContext) => ctx.waitUntil(scheduleMeetings(env).then(() => undefined)),
} satisfies ExportedHandler<Env, Job>;
