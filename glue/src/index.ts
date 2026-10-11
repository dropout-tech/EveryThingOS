import { consume, consumeDeadLetters, handle, scheduled, type Env } from "./app";
import type { Job } from "./jobs";
import { errorText, log } from "./log";

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
  queue: (batch: MessageBatch<Job>, env: Env) => (batch.queue.endsWith("-dlq") ? consumeDeadLetters(batch, env) : consume(batch, env)),
  scheduled: async (_c: ScheduledController, env: Env, ctx: ExecutionContext) =>
    ctx.waitUntil(
      scheduled(env).then(
        () => undefined,
        (e) => {
          log("error", "scheduled.failed", { error: errorText(e) });
          throw e;
        },
      ),
    ),
} satisfies ExportedHandler<Env, Job>;
