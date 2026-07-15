import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { ProcessRunner } from "./runner.js";
import type { ProcessOutputEvent } from "../types/index.js";

export function attachWsBridge(httpServer: HttpServer, runner: ProcessRunner): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/run-output" });

  const clients = new Set<WebSocket>();

  wss.on("connection", (socket) => {
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
  });

  runner.onEvent((event: ProcessOutputEvent) => {
    const payload = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  });
}
