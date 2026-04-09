"use client";
// ============================================================
// src/app/page.tsx — 首頁（輕量版：只輸入名稱）
// ============================================================
import { useRouter } from "next/navigation";
import { useState }  from "react";
import { Player }    from "@/types";

const C = {
  bg:      "#2A3830",
  card:    "#3A4E44",
  border:  "#4A6458",
  accent:  "#C8F542",
  accentD: "#A3CC1E",
  blue:    "#5DB8FF",
  red:     "#FF5B5B",
  text:    "#E8F0E0",
  muted:   "#7A9488",
};

type Screen = "home" | "setup";

export default function HomePage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("home");

  const handleReady = (blueName: string, redName: string) => {
    sessionStorage.setItem("hexwar:session", JSON.stringify({ blueName, redName }));
    router.push("/game");
  };

  if (screen === "setup") {
    return (
      <div style={{ position: "relative" }}>
        <BackBtn onClick={() => setScreen("home")} />
        <SetupScreen onReady={handleReady} />
      </div>
    );
  }

  return <HomeScreen onStart={() => setScreen("setup")} />;
}

// ── 首頁畫面 ─────────────────────────────────────────────────
function HomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <main style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", alignItems: "stretch",
      fontFamily: "'Noto Sans TC','Microsoft JhengHei',sans-serif",
      overflow: "hidden", position: "relative",
    }}>
      <HexBg />

      {/* 左側藍方角色 */}
      <div style={{ position: "absolute", left: 0, bottom: 0, width: "28%", maxWidth: 380, zIndex: 1, pointerEvents: "none" }}>
        <img src="/img/units/blue_warrior.png" alt="藍方"
          style={{ width: "100%", objectFit: "contain", filter: `drop-shadow(0 0 32px ${C.blue}88)`, transform: "scaleX(-1)" }} />
        <div style={{ position: "absolute", bottom: -20, left: "10%", width: "80%", height: 60,
          background: `radial-gradient(ellipse, ${C.blue}44 0%, transparent 70%)`, borderRadius: "50%" }} />
      </div>

      {/* 右側紅方角色 */}
      <div style={{ position: "absolute", right: 0, bottom: 0, width: "28%", maxWidth: 380, zIndex: 1, pointerEvents: "none" }}>
        <img src="/img/units/red_warrior.png" alt="紅方"
          style={{ width: "100%", objectFit: "contain", filter: `drop-shadow(0 0 32px ${C.red}88)` }} />
        <div style={{ position: "absolute", bottom: -20, right: "10%", width: "80%", height: 60,
          background: `radial-gradient(ellipse, ${C.red}44 0%, transparent 70%)`, borderRadius: "50%" }} />
      </div>

      {/* 中央 */}
      <div style={{ position: "relative", zIndex: 2, width: "100%",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 36, padding: "60px 0" }}>

        {/* LOGO */}
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 20, opacity: 0.5 }}>
            {["🌲","🏰","⛰","💧","🌾"].map((e,i) => <span key={i} style={{ fontSize: "1.4rem" }}>{e}</span>)}
          </div>
          <h1 style={{
            fontFamily: "'Cinzel','Georgia',serif",
            fontSize: "clamp(3rem,9vw,5.5rem)", fontWeight: 900, color: C.accent,
            letterSpacing: "0.18em", lineHeight: 1, margin: "0 0 10px",
            textShadow: `0 0 80px ${C.accent}55, 0 4px 0 ${C.accentD}`,
          }}>HEXWAR</h1>
          <p style={{ color: C.muted, fontSize: "0.9rem", letterSpacing: "0.3em", margin: 0, textTransform: "uppercase" }}>
            六角格回合制策略遊戲
          </p>
        </div>

        {/* 開始按鈕 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 240 }}>
          <HomeBtn primary onClick={onStart}>▶ 開始遊戲</HomeBtn>
        </div>

        {/* 規則快覽 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {[["⚡","每回合 4 AP"],["🏰","城鎮 +2 分"],["⚔️","擊殺 +1 分"],["🎯","先達 31 分勝利"]].map(([icon, label]) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 999,
              border: `1px solid ${C.border}`, background: `${C.card}88`,
              fontSize: "0.75rem", color: C.muted, backdropFilter: "blur(4px)",
            }}>
              <span>{icon}</span><span>{label}</span>
            </div>
          ))}
        </div>

        {/* VS 橫幅 */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "10px 32px", background: `${C.card}CC`,
          border: `1.5px solid ${C.border}`, borderRadius: 999, backdropFilter: "blur(8px)",
        }}>
          <span style={{ fontWeight: 900, color: C.blue, fontSize: "1rem" }}>藍方</span>
          <span style={{
            fontFamily: "'Cinzel',serif", fontWeight: 900, fontSize: "1.1rem", color: C.accent,
            padding: "2px 16px", background: `${C.accent}18`,
            border: `1px solid ${C.accent}44`, borderRadius: 8, letterSpacing: "0.1em",
          }}>VS</span>
          <span style={{ fontWeight: 900, color: C.red, fontSize: "1rem" }}>紅方</span>
        </div>
      </div>
    </main>
  );
}

// ── 玩家設定畫面（輕量版：只輸入名稱） ─────────────────────
const ACCENT: Record<Player, { color: string; label: string; unit: string }> = {
  [Player.Blue]: { color: "#5DB8FF", label: "藍方", unit: "/img/units/blue_warrior.png" },
  [Player.Red]:  { color: "#FF5B5B", label: "紅方", unit: "/img/units/red_warrior.png"  },
};

function SetupScreen({ onReady }: { onReady: (blue: string, red: string) => void }) {
  const [names, setNames] = useState<Record<Player, string>>({ [Player.Blue]: "", [Player.Red]: "" });
  const [error, setError] = useState("");

  const handleStart = () => {
    const blue = names[Player.Blue].trim();
    const red  = names[Player.Red].trim();
    if (!blue)       { setError("請輸入藍方玩家名稱"); return; }
    if (!red)        { setError("請輸入紅方玩家名稱"); return; }
    if (blue === red) { setError("兩位玩家名稱不能相同"); return; }
    onReady(blue, red);
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 32, padding: 36,
      fontFamily: "'Noto Sans TC','Microsoft JhengHei',sans-serif",
      color: C.text, position: "relative",
    }}>
      <HexBg />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 32, width: "100%" }}>
        <h2 style={{ fontSize: "1.8rem", fontWeight: 900, color: C.accent, margin: 0, letterSpacing: "0.08em",
          textShadow: `0 0 24px ${C.accent}44` }}>
          ⚔️ 玩家設定
        </h2>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
          {([Player.Blue, Player.Red] as const).map(player => {
            const acc = ACCENT[player];
            return (
              <div key={player} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
                background: "#324038", borderRadius: 20,
                border: `2px solid ${acc.color}55`,
                padding: "0 28px 28px", width: 240,
                boxShadow: `0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px ${acc.color}22`,
              }}>
                {/* 標題帶 */}
                <div style={{
                  width: "calc(100% + 56px)", textAlign: "center", padding: "12px 0",
                  background: acc.color, color: "#1C2420",
                  fontWeight: 800, fontSize: "1rem", letterSpacing: "0.08em",
                  borderRadius: "16px 16px 0 0", margin: "0 -28px", marginBottom: 4,
                }}>
                  {acc.label}
                </div>

                {/* 角色圖 */}
                <div style={{ width: 100, height: 100, position: "relative" }}>
                  <img src={acc.unit} alt={acc.label} style={{
                    width: "100%", height: "100%", objectFit: "contain",
                    filter: `drop-shadow(0 4px 12px ${acc.color}88)`,
                  }} />
                </div>

                {/* 名稱輸入 */}
                <input
                  placeholder={`${acc.label}玩家名稱`}
                  maxLength={16}
                  value={names[player]}
                  onChange={e => setNames(n => ({ ...n, [player]: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleStart()}
                  style={{
                    width: "100%", padding: "11px 14px", borderRadius: 10,
                    border: `1.5px solid ${names[player] ? acc.color + "88" : "#4A6458"}`,
                    background: "#2A3830", color: C.text,
                    fontSize: "1rem", outline: "none",
                    boxSizing: "border-box" as const,
                    transition: "border-color 0.2s",
                  }}
                />
              </div>
            );
          })}
        </div>

        {error && (
          <p style={{ color: C.red, fontSize: "0.95rem", margin: 0, fontWeight: 600 }}>{error}</p>
        )}

        <button onClick={handleStart} style={{
          padding: "14px 56px", borderRadius: 14, border: "none",
          background: C.accent, color: "#1C2420",
          fontSize: "1.1rem", fontWeight: 900,
          cursor: "pointer", letterSpacing: "0.05em",
          boxShadow: `0 4px 20px ${C.accent}55`,
          transition: "all 0.15s",
        }}>
          開始對戰 →
        </button>
      </div>
    </div>
  );
}

// ── 共用子元件 ────────────────────────────────────────────────
function HomeBtn({ children, onClick, primary = false }: {
  children: React.ReactNode; onClick: () => void; primary?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: "100%", padding: "14px 0", borderRadius: 12,
        fontFamily: "inherit", fontWeight: 800, fontSize: "1rem",
        cursor: "pointer", letterSpacing: "0.04em", transition: "all 0.18s",
        border: primary ? "none" : `1.5px solid ${C.border}`,
        background: primary ? (hov ? C.accentD : C.accent) : (hov ? C.card : `${C.card}CC`),
        color: primary ? "#1C2420" : (hov ? C.text : C.muted),
        boxShadow: primary && hov ? `0 6px 24px ${C.accent}55` : "none",
      }}>
      {children}
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      position: "fixed", top: 20, left: 20, zIndex: 100,
      background: "#324038", border: "1.5px solid #4A6458",
      borderRadius: 8, color: "#7A9488",
      padding: "8px 16px", fontSize: "0.85rem",
      cursor: "pointer", fontFamily: "inherit",
    }}>← 返回</button>
  );
}

function HexBg() {
  const SIZE = 52;
  const items: { x: number; y: number; o: number; filled: boolean }[] = [];
  for (let row = 0; row < 12; row++)
    for (let col = 0; col < 18; col++) {
      const x = col * SIZE * Math.sqrt(3) + (row % 2) * SIZE * (Math.sqrt(3) / 2) - 40;
      const y = row * SIZE * 1.5 - 40;
      const o = 0.02 + (col * 3 + row * 7) % 11 * 0.007;
      items.push({ x, y, o, filled: (col * 5 + row * 3) % 19 === 0 });
    }
  const pts = (cx: number, cy: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return `${cx + (SIZE - 4) * Math.cos(a)},${cy + (SIZE - 4) * Math.sin(a)}`;
    }).join(" ");
  return (
    <svg style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}>
      {items.map((h, i) => (
        <polygon key={i} points={pts(h.x, h.y)}
          fill={h.filled ? `rgba(200,245,66,${h.o * 0.8})` : "none"}
          stroke="#C8F542" strokeWidth={h.filled ? 0 : 0.6} opacity={h.o} />
      ))}
    </svg>
  );
}
