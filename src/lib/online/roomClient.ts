// ============================================================
// lib/online/roomClient.ts — 前端 API 呼叫封裝
// ============================================================
import type { Room, CreateRoomBody, JoinRoomBody, EndTurnBody } from "./roomTypes";
import type { GameState } from "@/types";
import { Player } from "@/types";

const BASE = "/api/room";

export async function createRoom(playerName: string): Promise<{ roomId: string; side: Player }> {
  const body: CreateRoomBody = { playerName };
  const res = await fetch(`${BASE}/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "建立房間失敗");
  return res.json();
}

export async function getRoom(roomId: string): Promise<Room> {
  const res = await fetch(`${BASE}/${roomId}`, { cache: "no-store" });
  if (!res.ok) throw new Error((await res.json()).error ?? "取得房間失敗");
  return res.json();
}

export async function joinRoom(roomId: string, playerName: string): Promise<{ side: Player; room: Room }> {
  const body: JoinRoomBody = { playerName };
  const res = await fetch(`${BASE}/${roomId}?action=join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "加入房間失敗");
  return res.json();
}

export async function endTurn(roomId: string, side: Player, gameState: GameState): Promise<void> {
  const body: EndTurnBody = { side, gameState };
  const res = await fetch(`${BASE}/${roomId}?action=endturn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "結束回合失敗");
}

export async function deleteRoom(roomId: string): Promise<void> {
  await fetch(`${BASE}/${roomId}`, { method: "DELETE" });
}
