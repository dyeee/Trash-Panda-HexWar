import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/online/supabase";
import type { Room, JoinRoomBody, EndTurnBody } from "@/lib/online/roomTypes";
import { Player } from "@/types";

type Ctx = { params: { roomId: string } };

async function fetchRoom(roomId: string): Promise<Room | null> {
  const { data, error } = await getSupabase()
    .from("game_rooms").select("room_data").eq("room_id", roomId).single();
  if (error || !data) return null;
  return data.room_data as Room;
}

async function saveRoom(roomId: string, room: Room) {
  const { error } = await getSupabase()
    .from("game_rooms")
    .update({ room_data: room, updated_at: new Date().toISOString() })
    .eq("room_id", roomId);
  if (error) throw error;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const room = await fetchRoom(params.roomId);
    if (!room) return NextResponse.json({ error: "房間不存在" }, { status: 404 });
    return NextResponse.json(room);
  } catch {
    return NextResponse.json({ error: "取得房間失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const room = await fetchRoom(params.roomId);
    if (!room) return NextResponse.json({ error: "房間不存在" }, { status: 404 });

    const action = new URL(req.url).searchParams.get("action");
    const now    = Date.now();

    if (action === "join") {
      if (room.status !== "waiting")
        return NextResponse.json({ error: "房間已滿或已結束" }, { status: 409 });
      const body: JoinRoomBody = await req.json();
      if (!body.playerName?.trim())
        return NextResponse.json({ error: "需要玩家名稱" }, { status: 400 });
      room.players[Player.Red] = { name: body.playerName.trim(), side: Player.Red, joinedAt: now };
      room.status = "playing"; room.updatedAt = now;
      await saveRoom(params.roomId, room);
      return NextResponse.json({ roomId: params.roomId, side: Player.Red, room });
    }

    if (action === "endturn") {
      const body: EndTurnBody = await req.json();
      if (!body.gameState || !body.side)
        return NextResponse.json({ error: "缺少遊戲狀態" }, { status: 400 });
      room.gameState = body.gameState; room.updatedAt = now; room.lastEndedBy = body.side;
      if (body.gameState.winner) room.status = "ended";
      await saveRoom(params.roomId, room);
      return NextResponse.json({ ok: true, room });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "操作失敗" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    await getSupabase().from("game_rooms").delete().eq("room_id", params.roomId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "刪除失敗" }, { status: 500 });
  }
}
