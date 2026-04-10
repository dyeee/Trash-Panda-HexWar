"use client";
// ============================================================
// app/room/[roomId]/page.tsx — 連線對戰房間頁
// ============================================================
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams }   from "next/navigation";
import { Player }      from "@/types";
import { getRoom, joinRoom } from "@/lib/online/roomClient";
import type { Room }   from "@/lib/online/roomTypes";
import OnlineGameBoard from "@/components/game/OnlineGameBoard";

const C = {
  bg:     "#2A3830", panel:  "#324038", border: "#4A6458",
  accent: "#C8F542", blue:   "#5DB8FF", red:    "#FF5B5B",
  text:   "#E8F0E0", muted:  "#7A9488", card:   "#3A4E44",
};

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId?.toUpperCase();

  const [phase, setPhase]       = useState<"loading" | "lobby" | "game" | "error">("loading");
  const [room,  setRoom]        = useState<Room | null>(null);
  const [mySide, setMySide]     = useState<Player | null>(null);
  const [myName, setMyName]     = useState("");
  const [nameInput, setNameInput] = useState("");
  const [errMsg, setErrMsg]     = useState("");
  const [copied, setCopied]     = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ── 初始載入房間 ────────────────────────────────────────
  useEffect(() => {
    if (!roomId) { setPhase("error"); setErrMsg("無效的房間號"); return; }

    // 從 sessionStorage 恢復身份
    const saved = sessionStorage.getItem(`hexwar:room:${roomId}`);
    if (saved) {
      try {
        const { side, name } = JSON.parse(saved);
        setMySide(side);
        setMyName(name);
      } catch {}
    }

    getRoom(roomId).then(r => {
      setRoom(r);
      setPhase("lobby");
    }).catch(() => {
      setPhase("error");
      setErrMsg("房間不存在或已過期");
    });
  }, [roomId]);

  // ── Lobby 輪詢等待對手 ──────────────────────────────────
  useEffect(() => {
    if (phase !== "lobby" || !mySide) return;
    if (room?.status === "playing") { setPhase("game"); return; }

    pollRef.current = setInterval(async () => {
      try {
        const r = await getRoom(roomId);
        setRoom(r);
        if (r.status === "playing") {
          setPhase("game");
          clearInterval(pollRef.current!);
        }
      } catch {}
    }, 2000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase, mySide, room?.status, roomId]);

  // ── 加入房間（紅方）────────────────────────────────────
  const handleJoin = useCallback(async () => {
    if (!nameInput.trim()) { setErrMsg("請輸入你的名稱"); return; }
    setErrMsg("");
    try {
      const res = await joinRoom(roomId, nameInput.trim());
      setMySide(Player.Red);
      setMyName(nameInput.trim());
      setRoom(res.room);
      sessionStorage.setItem(`hexwar:room:${roomId}`, JSON.stringify({ side: Player.Red, name: nameInput.trim() }));
      setPhase("game");
    } catch (e: any) {
      setErrMsg(e.message ?? "加入失敗");
    }
  }, [roomId, nameInput]);

  // ── 複製連結 ────────────────────────────────────────────
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── 頁面 ────────────────────────────────────────────────
  const bg: React.CSSProperties = {
    minHeight: "100dvh", background: C.bg, display: "flex",
    alignItems: "center", justifyContent: "center",
    fontFamily: "'Noto Sans TC','Microsoft JhengHei',sans-serif", color: C.text,
  };

  if (phase === "loading") return (
    <div style={bg}>
      <div style={{ textAlign: "center", color: C.muted }}>載入中…</div>
    </div>
  );

  if (phase === "error") return (
    <div style={bg}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>❌</div>
        <div style={{ color: C.red, fontWeight: 700 }}>{errMsg}</div>
        <a href="/" style={{ color: C.accent, marginTop: 16, display: "block" }}>← 回首頁</a>
      </div>
    </div>
  );

  if (phase === "game" && room && mySide) {
    const blueName = room.players[Player.Blue]?.name ?? "藍方";
    const redName  = room.players[Player.Red]?.name  ?? "紅方";
    const opponentName = mySide === Player.Blue ? redName : blueName;
    return (
      <OnlineGameBoard
        roomId={roomId}
        mySide={mySide}
        myName={myName}
        opponentName={opponentName}
        initialRoom={room}
      />
    );
  }

  // ── Lobby ────────────────────────────────────────────────
  const isHost  = mySide === Player.Blue;
  const waiting = !room?.players[Player.Red];

  return (
    <div style={bg}>
      <div style={{
        background: C.card, border: `1.5px solid ${C.border}`,
        borderRadius: 20, padding: "32px 28px",
        maxWidth: 420, width: "90vw", textAlign: "center",
        boxShadow: `0 0 40px ${C.accent}18`,
      }}>
        <div style={{ fontSize: "2rem", marginBottom: 4 }}>⚔️</div>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 900, color: C.accent, margin: "0 0 4px" }}>
          HexWar 連線對戰
        </h1>
        <div style={{ fontSize: "0.82rem", color: C.muted, marginBottom: 20 }}>
          房間號：<span style={{ color: C.text, fontWeight: 800, letterSpacing: "0.15em" }}>{roomId}</span>
        </div>

        {/* 房主等待畫面 */}
        {isHost && waiting && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: "0.78rem", color: C.muted, marginBottom: 10 }}>
                分享以下連結給朋友，等他加入：
              </div>
              <div style={{
                background: C.panel, borderRadius: 10, padding: "10px 14px",
                fontSize: "0.75rem", color: C.text, wordBreak: "break-all",
                border: `1px solid ${C.border}`, marginBottom: 8,
              }}>
                {typeof window !== "undefined" ? window.location.href : ""}
              </div>
              <button onClick={copyLink} style={{
                width: "100%", padding: "10px", borderRadius: 10, border: "none",
                background: copied ? `${C.accent}33` : C.accent,
                color: copied ? C.accent : C.bg,
                fontFamily: "inherit", fontWeight: 800, fontSize: "0.9rem",
                cursor: "pointer", transition: "all 0.2s",
              }}>
                {copied ? "✅ 已複製！" : "📋 複製連結"}
              </button>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              color: C.muted, fontSize: "0.82rem", justifyContent: "center",
            }}>
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                background: C.accent, animation: "pulse 1.2s infinite",
              }} />
              等待對手加入…
            </div>
          </>
        )}

        {/* 客方加入畫面 */}
        {!isHost && !mySide && (
          <>
            <div style={{ fontSize: "0.82rem", color: C.muted, marginBottom: 16 }}>
              {room?.players[Player.Blue]?.name ?? "玩家A"} 正在等你！
            </div>
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleJoin()}
              placeholder="輸入你的名稱"
              maxLength={12}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 10,
                border: `1.5px solid ${C.border}`, background: C.panel,
                color: C.text, fontFamily: "inherit", fontSize: "0.95rem",
                marginBottom: 10, boxSizing: "border-box",
              }}
            />
            {errMsg && <div style={{ color: C.red, fontSize: "0.8rem", marginBottom: 8 }}>{errMsg}</div>}
            <button onClick={handleJoin} style={{
              width: "100%", padding: "11px", borderRadius: 10, border: "none",
              background: C.accent, color: C.bg,
              fontFamily: "inherit", fontWeight: 900, fontSize: "0.95rem",
              cursor: "pointer",
            }}>
              加入對戰 →
            </button>
          </>
        )}

        {/* 雙方已入場 */}
        {isHost && !waiting && (
          <div style={{ color: C.accent, fontWeight: 700 }}>
            對手已加入！準備開始…
          </div>
        )}

        <a href="/" style={{ display: "block", marginTop: 20, color: C.muted, fontSize: "0.78rem" }}>
          ← 回首頁
        </a>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
