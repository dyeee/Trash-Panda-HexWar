// ============================================================
// lib/game/canvasRenderer.ts — Canvas 繪製引擎
// ============================================================
import { GameState, Unit, Player, TerrainType, ScorePopup } from "@/types";
import { UNIT_VISUAL, PLAYER_VISUAL, DEFAULT_CANVAS_CONFIG, TERRAIN_EFFECTS } from "@/constants";
import { hexToPixel, hexCorners, coordKey } from "@/lib/utils/hex";

// ── PNG 快取（改用 PNG，不再旋轉） ───────────────────────────
const imgCache = new Map<TerrainType, HTMLImageElement>();

function getTerrainImage(terrain: TerrainType): HTMLImageElement | null {
  if (imgCache.has(terrain)) return imgCache.get(terrain)!;
  const names: Record<TerrainType, string> = {
    [TerrainType.Town]:     "town",
    [TerrainType.Plain]:    "plain",
    [TerrainType.Water]:    "water",
    [TerrainType.Forest]:   "forest",
    [TerrainType.Mountain]: "mountain",
  };
  const img = new Image();
  img.src   = `/img/terrain/${names[terrain]}.png`;   // PNG 路徑
  imgCache.set(terrain, img);
  return img;
}

const FB: Record<TerrainType, { bg: string; border: string; label: string }> = {
  [TerrainType.Town]:     { bg: "#FFF0F0", border: "#c0392b", label: "城鎮" },
  [TerrainType.Plain]:    { bg: "#FFFBF0", border: "#b7860b", label: "平原" },
  [TerrainType.Water]:    { bg: "#EBF5FB", border: "#1a5fa8", label: "水域" },
  [TerrainType.Forest]:   { bg: "#EAFAF1", border: "#1a7a3c", label: "森林" },
  [TerrainType.Mountain]: { bg: "#F5F0EB", border: "#6b5344", label: "山區" },
};

// ── 攻擊閃爍 ─────────────────────────────────────────────────
export const attackFlash = { unitId: "", startTime: 0, duration: 420 };
export function triggerAttackFlash(unitId: string) {
  attackFlash.unitId    = unitId;
  attackFlash.startTime = Date.now();
}

// ── 主入口 ────────────────────────────────────────────────────
export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number,
  config: import("@/types").CanvasConfig = DEFAULT_CANVAS_CONFIG,
  popups: ScorePopup[] = [],
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#243028";   // 比面板深一點，讓地圖區有層次
  ctx.fillRect(0, 0, width, height);

  const ox  = config.offsetX || width  / 2;
  const oy  = config.offsetY || height / 2;
  const cfg = config;
  const now = Date.now();

  const selectedUnit = state.units.find(u => u.id === state.selectedUnitId);
  const enemyPosKeys = new Set(
    state.units
      .filter(u => selectedUnit && u.owner !== selectedUnit.owner)
      .map(u => coordKey(u.position))
  );

  // 1. 地形
  state.tiles.forEach(tile => {
    const { x, y } = hexToPixel(tile.coord.q, tile.coord.r, cfg.hexSize, ox, oy);
    const corners   = hexCorners(x, y, cfg.hexSize - 1);
    const fb        = FB[tile.terrain];
    const img       = getTerrainImage(tile.terrain);

    ctx.beginPath();
    corners.forEach(([cx, cy], i) => (i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy)));
    ctx.closePath();

    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.clip();
      // PNG 已是六角形外框，直接填滿不旋轉
      const s = cfg.hexSize * 2.1;
      ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
      ctx.restore();
    } else {
      ctx.fillStyle = fb.bg;
      ctx.fill();
    }

    // 邊框
    ctx.beginPath();
    corners.forEach(([cx, cy], i) => (i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy)));
    ctx.closePath();
    ctx.strokeStyle = tile.isFixed ? fb.border : `${fb.border}88`;
    ctx.lineWidth   = tile.isFixed ? 2.5 : 1;
    ctx.stroke();

    if (tile.isFixed) {
      const outer = hexCorners(x, y, cfg.hexSize + 3);
      ctx.save();
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      outer.forEach(([cx, cy], i) => (i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy)));
      ctx.closePath();
      ctx.strokeStyle = `${fb.border}55`;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  });

  // 2. 高亮
  state.highlightedCoords.forEach(coord => {
    const isAtk     = enemyPosKeys.has(coordKey(coord));
    const { x, y }  = hexToPixel(coord.q, coord.r, cfg.hexSize, ox, oy);
    const corners    = hexCorners(x, y, cfg.hexSize - 1);

    ctx.beginPath();
    corners.forEach(([cx, cy], i) => (i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy)));
    ctx.closePath();
    ctx.fillStyle = isAtk ? "rgba(220,38,38,0.25)" : "rgba(34,197,94,0.25)";
    ctx.fill();

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    corners.forEach(([cx, cy], i) => (i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy)));
    ctx.closePath();
    ctx.strokeStyle = isAtk ? "#ef4444" : "#22c55e";
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();
  });

  // 3. 兵種（含累積傷害顯示）
  state.units.forEach(unit => {
    const { x, y }  = hexToPixel(unit.position.q, unit.position.r, cfg.hexSize, ox, oy);
    const vis        = UNIT_VISUAL[unit.type];
    const pVis       = PLAYER_VISUAL[unit.owner];
    const r          = cfg.hexSize * 0.31;
    const fullyDone  = unit.hasMoved && unit.hasAttacked;
    const isFlashing = unit.id === attackFlash.unitId && now - attackFlash.startTime < attackFlash.duration;

    if (isFlashing) {
      const prog  = (now - attackFlash.startTime) / attackFlash.duration;
      const alpha = 1 - prog;
      const fr    = r + 14 * prog;
      ctx.beginPath();
      ctx.arc(x, y, fr, 0, Math.PI * 2);
      ctx.strokeStyle = unit.owner === Player.Blue
        ? `rgba(93,184,255,${alpha})`
        : `rgba(255,91,91,${alpha})`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // 半透明深色底
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = unit.owner === Player.Blue
      ? "rgba(30,58,95,0.78)"
      : "rgba(95,30,30,0.78)";
    ctx.fill();

    // 玩家色粗邊框
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = pVis.color;
    ctx.lineWidth   = 3;
    ctx.stroke();

    // 已行動：半透黑遮罩
    if (fullyDone) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.48)";
      ctx.fill();
    }

    // 符號
    ctx.font         = `700 ${r * 1.1}px sans-serif`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle    = fullyDone ? "#777" : "#fff";
    ctx.fillText(vis.symbol, x, y);

    // 行動狀態點（右上角）
    const dotC = fullyDone ? "#444"
      : (unit.hasMoved || unit.hasAttacked) ? "#fbbf24"
      : unit.owner === Player.Blue ? "#5DB8FF" : "#FF5B5B";
    ctx.beginPath();
    ctx.arc(x + r * 0.72, y - r * 0.72, 4, 0, Math.PI * 2);
    ctx.fillStyle   = dotC;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth   = 1;
    ctx.stroke();

    // ── 累積傷害條（被圍攻時顯示） ──────────────────────────
    const dmg = state.pendingDamage?.[unit.id] ?? 0;
    if (dmg > 0) {
      // 取得防守方有效 DEF（含地形加成）
      const defTile   = state.tiles.find(t => coordKey(t.coord) === coordKey(unit.position));
      const defBonus  = defTile ? (TERRAIN_EFFECTS[defTile.terrain]?.defBonus ?? 0) : 0;
      const effDef    = unit.baseStats.def + defBonus;
      const ratio     = Math.min(dmg / effDef, 1);

      const bw = r * 2.2;
      const bh = 5;
      const bx = x - bw / 2;
      const by = y + r + 5;

      // 底色
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.roundRect?.(bx, by, bw, bh, 3);
      ctx.fill();

      // 傷害填充：黃→橘→紅
      const barColor = ratio < 0.5 ? "#facc15"
        : ratio < 0.85 ? "#f97316"
        : "#ef4444";
      ctx.fillStyle = barColor;
      ctx.beginPath();
      ctx.roundRect?.(bx, by, bw * ratio, bh, 3);
      ctx.fill();

      // 傷害數字：顯示 累積/DEF
      ctx.font         = `700 ${r * 0.55}px sans-serif`;
      ctx.textAlign    = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle    = barColor;
      ctx.fillText(`${dmg}/${effDef}`, x, by + bh + 2);
    }
  });

  // 4. 選中光暈
  if (state.selectedUnitId) {
    const u = state.units.find(u => u.id === state.selectedUnitId);
    if (u) {
      const { x, y } = hexToPixel(u.position.q, u.position.r, cfg.hexSize, ox, oy);
      const corners   = hexCorners(x, y, cfg.hexSize - 1);
      ctx.beginPath();
      corners.forEach(([cx, cy], i) => (i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy)));
      ctx.closePath();
      ctx.fillStyle = "rgba(59,130,246,0.18)";
      ctx.fill();
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth   = 2.5;
      ctx.stroke();
    }
  }

  // 5. 積分彈出
  popups.forEach(p => {
    const DURATION = 1400;
    const elapsed  = now - p.createdAt;
    if (elapsed > DURATION) return;
    const prog  = elapsed / DURATION;
    const alpha = prog < 0.7 ? 1 : 1 - (prog - 0.7) / 0.3;
    const rise  = prog * cfg.hexSize * 2.4;
    const { x, y } = hexToPixel(p.coord.q, p.coord.r, cfg.hexSize, ox, oy);
    const color     = p.owner === Player.Blue ? "#2563eb" : "#dc2626";
    const label     = `+${p.amount}`;

    ctx.save();
    ctx.globalAlpha = alpha;
    const fs = cfg.hexSize * 0.4;
    ctx.font = `800 ${fs}px 'Noto Sans TC',sans-serif`;
    const tw  = ctx.measureText(label).width;
    const pad = 10, rh = fs + 10;
    const rw  = tw + pad * 2;
    const rx  = x - rw / 2, ry = y - rise - rh / 2;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect?.(rx, ry, rw, rh, rh / 2); ctx.fill();
    ctx.fillStyle    = "#fff";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y - rise);
    ctx.restore();
  });

  // 6. Miss! 特效（不死小強）
  const missEffect = state.missEffect ?? {};
  Object.entries(missEffect).forEach(([unitId, startTime]) => {
    const MISS_DUR = 900;
    const elapsed  = now - startTime;
    if (elapsed > MISS_DUR) return;
    const unit = state.units.find(u => u.id === unitId);
    if (!unit) return;
    const prog  = elapsed / MISS_DUR;
    const alpha = prog < 0.5 ? 1 : 1 - (prog - 0.5) / 0.5;
    const rise  = prog * cfg.hexSize * 1.6;
    const wobble = Math.sin(prog * Math.PI * 6) * 8; // 左右晃動
    const { x, y } = hexToPixel(unit.position.q, unit.position.r, cfg.hexSize, ox, oy);

    ctx.save();
    ctx.globalAlpha = alpha;
    const fs = cfg.hexSize * 0.45;
    ctx.font = `900 ${fs}px 'Noto Sans TC',sans-serif`;
    const label = "Miss!";
    const tw = ctx.measureText(label).width;
    const pad = 8, rh = fs + 8, rw = tw + pad * 2;
    const rx  = x + wobble - rw / 2, ry = y - rise - rh / 2;
    // 紫色背景
    ctx.fillStyle = "#9333ea";
    ctx.beginPath(); ctx.roundRect?.(rx, ry, rw, rh, rh / 2); ctx.fill();
    // 白色文字
    ctx.fillStyle    = "#fff";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + wobble, y - rise);
    ctx.restore();
  });
}
