// ============================================================
// components/canvas/HexCanvas.tsx
// ============================================================
"use client";
import { useRef, useEffect, useCallback, useState, useMemo, forwardRef, useImperativeHandle } from "react";
import { GameState, HexCoord, CanvasConfig, ScorePopup, Player, UnitStatus } from "@/types";
import { TERRAIN_VISUAL, DEFAULT_CANVAS_CONFIG, BASE_STATS, UNIT_VISUAL, TERRAIN_EFFECTS } from "@/constants";
import { renderGame, triggerAttackFlash } from "@/lib/game/canvasRenderer";
import { pixelToHex, coordKey, hexDistance } from "@/lib/utils/hex";
import { calcMoveRange } from "@/lib/game/units";

interface HexCanvasProps {
  state: GameState;
  highlights: HexCoord[];
  onTileClick: (coord: HexCoord) => void;
  onUnitInfo?: (unit: import("@/types").Unit | null) => void;  // 手機版：點到單位時通知
  config?: Partial<Omit<CanvasConfig, "offsetX" | "offsetY">>;
  className?: string;
}

export interface HexCanvasHandle {
  _addPopup: (amount: number, owner: Player, coord: HexCoord) => void;
}

interface TooltipState {
  visible: boolean;
  x: number; y: number;
  lines: { label: string; value: string; color?: string }[];
  title: string;
  titleColor?: string;
}

type CursorMode = "default" | "pointer" | "move" | "crosshair";

const HexCanvas = forwardRef<HexCanvasHandle, HexCanvasProps>(function HexCanvas(
  { state, highlights, onTileClick, onUnitInfo, config: configOverride, className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const sizeRef   = useRef({ w: 600, h: 520 });
  const [size,    setSize]    = useState({ w: 600, h: 520 });
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, lines: [], title: "" });
  const [cursor,  setCursor]  = useState<CursorMode>("default");
  const [popups,  setPopups]  = useState<ScorePopup[]>([]);

  // flat-top 地圖實際像素範圍（size=1 時）：
  //   X span = 9.0  → 加上左右各1格邊距 = 11
  //   Y span = 7.794 → 加上上下各 √3/2 邊距 ≈ 9.528
  // hexSize = min(w / 11, h / 9.53)，並留 10% margin
  const hexSize = useMemo(() => {
    const w = size.w;
    const h = size.h;
    const byW = (w * 0.92) / 11;
    const byH = (h * 0.92) / 9.53;
    return Math.max(24, Math.min(80, Math.min(byW, byH)));
  }, [size]);

  const config  = useMemo<CanvasConfig>(() => ({
    ...DEFAULT_CANVAS_CONFIG,
    ...configOverride,
    hexSize,
    offsetX: sizeRef.current.w / 2,
    offsetY: sizeRef.current.h / 2,
  }), [hexSize, size, configOverride]);

  // ── PNG 預載 ────────────────────────────────────────────
  useEffect(() => {
    const names = ["water","mountain","forest","plain","town"];
    let n = 0;
    names.forEach(name => {
      const img = new Image();
      img.src   = `/img/terrain/${name}.png`;
      img.onload = () => { n++; if (n === names.length) setSize(p => ({ ...p })); };
    });
  }, []);

  // ── ResizeObserver ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        const dpr = window.devicePixelRatio ?? 1;
        canvas.width  = Math.floor(width  * dpr);
        canvas.height = Math.floor(height * dpr);
        const ctx = canvas.getContext("2d");
        if (ctx) { ctx.resetTransform(); ctx.scale(dpr, dpr); }
        sizeRef.current = { w: width, h: height };
        setSize({ w: width, h: height });
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Render loop（含積分彈出動畫） ────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx)  return;
    cancelAnimationFrame(rafRef.current);

    const renderState: GameState = { ...state, highlightedCoords: highlights };

    // 有動畫中的彈出或 miss 效果時持續 rAF
    const now = Date.now();
    const hasActivePopups  = popups.some(p => now - p.createdAt < 1400);
    const hasActiveMiss    = Object.values(state.missEffect ?? {}).some(t => now - t < 1000);

    if (hasActivePopups || hasActiveMiss) {
      const loop = () => {
        renderGame(ctx, renderState, size.w, size.h, config, popups);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } else {
      rafRef.current = requestAnimationFrame(() => {
        renderGame(ctx, renderState, size.w, size.h, config, popups);
      });
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [state, highlights, size, config, popups]);

  // ── 公開：觸發積分彈出 ───────────────────────────────────
  const addPopup = useCallback((amount: number, owner: Player, coord: HexCoord) => {
    const popup: ScorePopup = {
      id:        `popup_${Date.now()}_${Math.random()}`,
      amount, owner, coord,
      createdAt: Date.now(),
    };
    setPopups(prev => [...prev, popup]);
    setTimeout(() => setPopups(prev => prev.filter(p => p.id !== popup.id)), 1600);
  }, []);

  // 暴露給父元件（forwardRef）
  useImperativeHandle(ref, () => ({ _addPopup: addPopup }), [addPopup]);

  // ── Touch：手機點擊支援 ──────────────────────────────────
  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0];
    const rect  = canvas.getBoundingClientRect();
    const coord = pixelToHex(
      touch.clientX - rect.left,
      touch.clientY - rect.top,
      config.hexSize, config.offsetX, config.offsetY
    );
    const inMap = state.tiles.some(t => t.coord.q === coord.q && t.coord.r === coord.r);
    if (!inMap) return;

    // 通知父層點了哪個單位（供手機資訊卡顯示）
    const tappedUnit = state.units.find(u => u.position.q === coord.q && u.position.r === coord.r);
    onUnitInfo?.(tappedUnit ?? null);

    onTileClick(coord);
  }, [state.tiles, state.units, config, onTileClick, onUnitInfo]);

  // ── 點擊 ────────────────────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect  = canvas.getBoundingClientRect();
    const coord = pixelToHex(e.clientX - rect.left, e.clientY - rect.top,
      config.hexSize, config.offsetX, config.offsetY);
    const inMap = state.tiles.some(t => t.coord.q === coord.q && t.coord.r === coord.r);
    if (inMap) onTileClick(coord);
  }, [state.tiles, config, onTileClick]);

  // ── Hover：tooltip + cursor ──────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect  = canvas.getBoundingClientRect();
    const px    = e.clientX - rect.left;
    const py    = e.clientY - rect.top;
    const coord = pixelToHex(px, py, config.hexSize, config.offsetX, config.offsetY);
    const tile  = state.tiles.find(t => t.coord.q === coord.q && t.coord.r === coord.r);

    if (!tile) { setTooltip(t => ({ ...t, visible: false })); setCursor("default"); return; }

    const vis      = TERRAIN_VISUAL[tile.terrain];
    const hoverUnit = state.units.find(u => u.position.q === coord.q && u.position.r === coord.r);
    const selUnit   = state.units.find(u => u.id === state.selectedUnitId);

    // ── cursor 邏輯 ──
    let newCursor: CursorMode = "pointer";
    if (selUnit) {
      const isHighlight = highlights.some(h => h.q === coord.q && h.r === coord.r);
      const isEnemy     = hoverUnit && hoverUnit.owner !== selUnit.owner;
      if (isHighlight && !isEnemy) newCursor = "move";
      else if (isEnemy && !selUnit.hasAttacked) {
        const dist = hexDistance(selUnit.position, coord);
        const eff  = TERRAIN_EFFECTS[tile.terrain];
        const rng  = eff.rngOverride !== undefined ? eff.rngOverride : selUnit.baseStats.rng;
        if (dist <= rng) newCursor = "crosshair";
      }
    }
    setCursor(newCursor);

    // ── tooltip ──
    const lines: TooltipState["lines"] = [];
    const effect = TERRAIN_EFFECTS[tile.terrain];
    if (effect.defBonus > 0)   lines.push({ label: "DEF 加成", value: `+${effect.defBonus}` });
    if (effect.meleeOnly)       lines.push({ label: "限制", value: "僅近戰" });
    if (effect.cannotAttack)    lines.push({ label: "限制", value: "水域不可攻擊" });

    // 滑鼠在單位上：顯示單位數值（含 Blessing / WildBark 動態 DEF）
    if (hoverUnit) {
      const uStats   = BASE_STATS[hoverUnit.type];
      const baseDef  = uStats.def + effect.defBonus;

      // 鼠修女 Blessing：週邊1格友方有修女 → DEF+2
      const blessingBonus = state.units.some(u =>
        u.owner === hoverUnit.owner &&
        u.id !== hoverUnit.id &&
        u.specialAbilities?.includes("blessing" as any) &&
        hexDistance(u.position, hoverUnit.position) <= 1
      ) ? 2 : 0;

      // 看門狗 WildBark：週邊1格有敵方看門狗 → DEF÷2
      const hasWildBark = state.units.some(u =>
        u.owner !== hoverUnit.owner &&
        u.specialAbilities?.includes("wildbark" as any) &&
        hexDistance(u.position, hoverUnit.position) <= 1
      );

      // 水中單位在水域 DEF+1
      const aquaticBonus =
        hoverUnit.specialAbilities?.includes("aquatic" as any) &&
        tile.terrain === "water" ? 1 : 0;

      let effDef = baseDef + blessingBonus + aquaticBonus;
      if (hasWildBark) effDef = Math.ceil(effDef / 2);

      const defParts: string[] = [];
      if (effect.defBonus)   defParts.push(`地形+${effect.defBonus}`);
      if (blessingBonus)     defParts.push(`修女+${blessingBonus}`);
      if (aquaticBonus)      defParts.push(`水中+${aquaticBonus}`);
      if (hasWildBark)       defParts.push(`吠叫÷2`);

      const defStr = defParts.length
        ? `${effDef} (${defParts.join(" ")})`
        : String(effDef);

      lines.push({ label: "ATK", value: String(uStats.atk) });
      lines.push({ label: "DEF", value: defStr });
      lines.push({ label: "移動", value: String(uStats.rom) });
      lines.push({ label: "射程", value: String(uStats.rng) });
    }

    const titleColor = hoverUnit
      ? (hoverUnit.owner === Player.Blue ? "#2563eb" : "#dc2626")
      : undefined;

    setTooltip({
      visible:    true,
      x:          px + 16,
      y:          py - 10,
      title:      hoverUnit
        ? `${hoverUnit.owner === Player.Blue ? "藍方" : "紅方"} ${UNIT_VISUAL[hoverUnit.type].label}`
        : `${vis.emoji} ${vis.label}`,
      titleColor,
      lines,
    });
  }, [state, highlights, config]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(t => ({ ...t, visible: false }));
    setCursor("default");
  }, []);

  // ── cursor CSS ───────────────────────────────────────────
  const cursorStyle: Record<CursorMode, string> = {
    default:   "default",
    pointer:   "pointer",
    move:      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ctext y='20' font-size='20'%3E🚶%3C/text%3E%3C/svg%3E\") 12 12, move",
    crosshair: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ctext y='20' font-size='20'%3E⚔️%3C/text%3E%3C/svg%3E\") 12 12, crosshair",
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onTouchEnd={handleTouchEnd}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={className}
        style={{ display: "block", width: "100%", height: "100%", cursor: cursorStyle[cursor], touchAction: "none" }}
      />

      {/* Tooltip */}
      {tooltip.visible && (
        <div style={{
          position: "absolute", left: tooltip.x, top: tooltip.y,
          pointerEvents: "none",
          background: "rgba(253,252,250,0.97)",
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 10, padding: "10px 14px",
          fontSize: "0.85rem", color: "#1a1a2e",
          whiteSpace: "nowrap", lineHeight: 1.7, zIndex: 20,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          minWidth: 130,
        }}>
          <div style={{ fontWeight: 800, marginBottom: 4, color: tooltip.titleColor ?? "#3d2b1f", fontSize: "0.92rem" }}>
            {tooltip.title}
          </div>
          {tooltip.lines.map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span style={{ color: "#6b7280" }}>{l.label}</span>
              <span style={{ fontWeight: 600, color: l.color ?? "#1a1a2e" }}>{l.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default HexCanvas;
