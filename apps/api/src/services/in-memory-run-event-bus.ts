import { EventEmitter } from "node:events";
import type { AgUiEvent, RunEventBus } from "@my-manus/shared";

export class InMemoryRunEventBus implements RunEventBus {
  private readonly emitter = new EventEmitter();

  async publish(runId: string, event: AgUiEvent): Promise<void> {
    this.emitter.emit(runId, event);
  }

  subscribeToRun(runId: string, listener: (event: AgUiEvent) => void) {
    this.emitter.on(runId, listener);

    return () => {
      this.emitter.off(runId, listener);
    };
  }
}
