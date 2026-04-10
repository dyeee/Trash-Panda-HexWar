// ============================================================
// lib/online/roomTypes.ts — 連線對戰房間型別
// ============================================================
import type { GameState } from "@/types";
import { Player } from "@/types";

export interface RoomPlayer {
  name: string;
  side: Player;
  joinedAt: number;
}

export type RoomStatus = "waiting" | "playing" | "ended";

export interface Room {
  roomId:    string;
  status:    RoomStatus;
  players:   Partial<Record<Player, RoomPlayer>>;
  gameState: GameState | null;
  createdAt: number;
  updatedAt: number;
  /** 上一次結束回合的玩家（防重複提交） */
  lastEndedBy?: Player;
}

export interface CreateRoomBody {
  playerName: string;
}

export interface JoinRoomBody {
  playerName: string;
}

export interface EndTurnBody {
  side:      Player;
  gameState: GameState;
}

// 房間 TTL：2小時（秒）
export const ROOM_TTL_SECONDS = 60 * 60 * 2;
