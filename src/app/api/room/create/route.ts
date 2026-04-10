import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/online/supabase";
import type { CreateRoomBody } from "@/lib/online/roomTypes";
import { Player } from "@/types";

function genRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateRoomBody = await req.json();
    if (!body.playerName?.trim())
      return NextResponse.json({ error: "需要玩家名稱" }, { status: 400 });

    // 先驗證環境變數
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supaUrl || !supaKey) {
      return NextResponse.json(
        { error: "伺服器設定錯誤：Supabase 環境變數未設定", detail: { hasUrl: !!supaUrl, hasKey: !!supaKey } },
        { status: 500 }
      );
    }

    const roomId = genRoomId();
    const now    = Date.now();
    const room   = {
      roomId, status: "waiting",
      players: { [Player.Blue]: { name: body.playerName.trim(), side: Player.Blue, joinedAt: now } },
      gameState: null, createdAt: now, updatedAt: now,
    };

    const { error } = await getSupabase()
      .from("game_rooms")
      .insert({ room_id: roomId, room_data: room, expires_at: new Date(now + 7200000).toISOString() });

    if (error) {
      console.error("supabase insert error:", error);
      return NextResponse.json({ error: "建立房間失敗", detail: error.message, code: error.code }, { status: 500 });
    }

    return NextResponse.json({ roomId, side: Player.Blue });
  } catch (err: any) {
    console.error("create room error:", err);
    return NextResponse.json({ error: "建立房間失敗", detail: err?.message ?? String(err) }, { status: 500 });
  }
}
