import type { SimConfig } from "./store";

const WS_PATH = "/api/simulation/stream";

// WebSocket URL resolution mirrors apiBaseUrl():
//  1. NEXT_PUBLIC_WS_URL (explicit override)
//  2. dev: the local backend on :8000
//  3. production: derive from the page origin → wss:// on https, same host
//     (single-service deploy). window is only touched at connect-time (browser).
function wsUrl(): string {
  const override = process.env.NEXT_PUBLIC_WS_URL;
  if (override) return override;
  if (process.env.NODE_ENV === "development") return `ws://localhost:8000${WS_PATH}`;
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${WS_PATH}`;
  }
  return `ws://localhost:8000${WS_PATH}`; // SSR/prerender fallback (never used at runtime)
}

export type ServerMessage = Record<string, unknown> & { type?: string; state?: string };

type Handlers = {
  onConnection: (s: "connecting" | "connected" | "disconnected" | "error") => void;
  onMessage: (msg: ServerMessage) => void;
};

export type SimSocket = {
  send: (msg: Record<string, unknown>) => void;
  close: () => void;
};

export function connectSimulation(handlers: Handlers): SimSocket {
  let socket: WebSocket | null = null;
  let reconnect: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let stopped = false;
  const queue: Record<string, unknown>[] = [];

  const flush = () => {
    if (socket?.readyState === WebSocket.OPEN) {
      while (queue.length) socket.send(JSON.stringify(queue.shift()));
    }
  };

  const open = () => {
    if (stopped) return;
    handlers.onConnection("connecting");
    socket = new WebSocket(wsUrl());
    socket.onopen = () => {
      attempt = 0;
      handlers.onConnection("connected");
      flush();
    };
    socket.onmessage = (event) => {
      try {
        handlers.onMessage(JSON.parse(event.data) as ServerMessage);
      } catch {
        /* ignore malformed frame */
      }
    };
    socket.onerror = () => handlers.onConnection("error");
    socket.onclose = () => {
      socket = null;
      if (stopped) return;
      handlers.onConnection("disconnected");
      const delay = Math.min(1000 * 2 ** attempt, 10000);
      attempt += 1;
      reconnect = setTimeout(open, delay);
    };
  };

  open();

  return {
    send: (msg) => {
      queue.push(msg);
      flush();
    },
    close: () => {
      stopped = true;
      if (reconnect) clearTimeout(reconnect);
      socket?.close(1000, "client closed");
    },
  };
}

export function configMessage(config: SimConfig): Record<string, unknown> {
  return {
    type: "config",
    symbol: config.symbol,
    timeframe: config.timeframe,
    seed: config.seed,
    strategies: config.strategies,
    regime_filter: config.regime_filter,
    difficulty: config.difficulty,
  };
}
