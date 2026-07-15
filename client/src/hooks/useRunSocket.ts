import { useEffect, useRef, useState } from "react";
import type { ProcessOutputEvent } from "../types";

export function useRunSocket(onEvent: (event: ProcessOutputEvent) => void): {
  connected: boolean;
} {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws/run-output`);

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as ProcessOutputEvent;
        handlerRef.current(parsed);
      } catch {
        return;
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  return { connected };
}
