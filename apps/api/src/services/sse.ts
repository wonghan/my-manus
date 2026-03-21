import type { Response } from "express";
import type { AgUiEvent } from "@my-manus/shared";

export function prepareSse(response: Response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });
}

export function writeSseEvent(response: Response, event: AgUiEvent) {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}
