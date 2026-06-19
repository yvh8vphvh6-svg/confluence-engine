"use client";

import { connectSimulation, configMessage, type SimSocket, type ServerMessage } from "./ws";
import { useStore, type SimConfig, type StreamMeta, type SimulationTick } from "./store";

let socket: SimSocket | null = null;
let started = false;

function handle(msg: ServerMessage) {
  const store = useStore.getState();
  const type = msg.type as string | undefined;
  if (type === "meta") {
    store.setMeta(msg as unknown as StreamMeta);
    return;
  }
  if (type === "status") {
    const state = msg.state as string;
    if (state === "building") store.setStream("building");
    else if (state === "ready") store.setStream("ready");
    else if (state === "error") store.setStream("error", String(msg.message ?? "stream error"));
    return;
  }
  if (type === "teach") {
    store.setTeach({ setup: String(msg.setup), bar: Number(msg.bar_index) });
    return;
  }
  if (type === "frame") {
    store.receiveFrame(msg as unknown as SimulationTick);
    return;
  }
  if (type === "tick") {
    store.receiveTick(msg as unknown as SimulationTick);
  }
}

function clearTeach() {
  if (useStore.getState().teach) useStore.getState().setTeach(null);
}

export function startStream(): () => void {
  if (started) return () => undefined;
  started = true;
  const store = useStore.getState();
  socket = connectSimulation({
    onConnection: store.setConnection,
    onMessage: handle,
  });
  return () => {
    socket?.close();
    socket = null;
    started = false;
  };
}

export function sendControl(msg: Record<string, unknown>): void {
  socket?.send(msg);
}

export function applyConfig(config: SimConfig): void {
  clearTeach();
  sendControl(configMessage(config));
}

export const play = () => {
  clearTeach();
  sendControl({ type: "play" });
};
export const pause = () => sendControl({ type: "pause" });
export const step = () => {
  clearTeach();
  sendControl({ type: "step" });
};
export const stepBack = () => {
  clearTeach();
  sendControl({ type: "step_back" });
};
export const reset = () => {
  clearTeach();
  sendControl({ type: "reset" });
};
export const setSpeed = (value: number) => sendControl({ type: "speed", value });
export const seek = (index: number) => {
  clearTeach();
  sendControl({ type: "seek", index });
};
export const setAutoPause = (value: boolean) => sendControl({ type: "autopause", value });
