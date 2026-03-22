import IORedis from "ioredis";
import type { AgUiEvent, RunEventBus } from "@my-manus/shared";

export class RedisRunEventBus implements RunEventBus {
  private readonly publisher: IORedis;

  constructor(
    private readonly redisUrl: string,
    private readonly namespace = "my-manus"
  ) {
    this.publisher = new IORedis(redisUrl, {
      maxRetriesPerRequest: null
    });
  }

  async publish(runId: string, event: AgUiEvent): Promise<void> {
    await this.publisher.publish(
      this.channelName(runId),
      JSON.stringify(event)
    );
  }

  async subscribeToRun(
    runId: string,
    listener: (event: AgUiEvent) => void
  ) {
    const subscriber = new IORedis(this.redisUrl, {
      maxRetriesPerRequest: null
    });
    const channel = this.channelName(runId);

    const onMessage = (messageChannel: string, payload: string) => {
      if (messageChannel !== channel) {
        return;
      }

      listener(JSON.parse(payload) as AgUiEvent);
    };

    subscriber.on("message", onMessage);
    await subscriber.subscribe(channel);

    return async () => {
      subscriber.off("message", onMessage);
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    };
  }

  async close(): Promise<void> {
    await this.publisher.quit();
  }

  private channelName(runId: string) {
    return `${this.namespace}:run:${runId}`;
  }
}
