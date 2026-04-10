"use client";
// ============================================================
// components/game/GameBoard.tsx — 墨綠撞色都市感版
// ============================================================
import { useState, useCallback, useRef, useEffect } from "react";
import { useGame }   from "@/hooks/useGame";
import HexCanvas, { HexCanvasHandle } from "@/components/canvas/HexCanvas";
import { triggerAttackFlash } from "@/lib/game/canvasRenderer";
import { hexDistance } from "@/lib/utils/hex";
import { UnitType, Player, HexCoord, Unit, SpecialAbility, TerrainType, UnitStatus } from "@/types";
import {
  BASE_STATS, UNIT_VISUAL, PLAYER_VISUAL,
  GAME_RULES, TERRAIN_EFFECTS, TERRAIN_VISUAL, SPAWN_ZONES,
  ALL_SPECIALS, SPECIAL_ABILITY_DESC, getAbilitiesDesc,
} from "@/constants";
import { hasAbility } from "@/types";

// ── 配色：墨綠撞色都市感（稍淺） ────────────────────────────
const C = {
  bg:      "#2A3830",   // 主背景：稍淺墨綠
  panel:   "#324038",   // 右側面板：比背景亮一階
  header:  "#243028",   // 頭部：略深
  border:  "#4A6458",   // 邊框：明顯可見
  accent:  "#C8F542",   // 撞色螢光黃綠
  accentD: "#A3CC1E",   // 深螢光
  blue:    "#5DB8FF",   // 藍方
  red:     "#FF5B5B",   // 紅方
  text:    "#E8F0E0",   // 淡綠白文字
  muted:   "#7A9488",   // 灰綠
  card:    "#3A4E44",   // 卡片背景
  sep:     "#3E5248",   // 分隔線
};

// 兵種圖片（透明背景 PNG）
const UNIT_IMG: Record<string, Record<Player, string> | string> = {
  [UnitType.Warrior]:   { [Player.Blue]: "/img/units/blue_warrior.png", [Player.Red]: "/img/units/red_warrior.png" },
  [UnitType.Archer]:    { [Player.Blue]: "/img/units/blue_archer.png",  [Player.Red]: "/img/units/red_archer.png"  },
  [UnitType.Cavalry]:   { [Player.Blue]: "/img/units/blue_knight.png",  [Player.Red]: "/img/units/red_knight.png"  },
  [UnitType.Catfish]:   "/img/specials/catfish.png",
  [UnitType.Snake]:     "/img/specials/snake.png",
  [UnitType.Pigeon]:    "/img/specials/pigeon.png",
  [UnitType.Cockroach]: "/img/specials/cockroach.png",
  [UnitType.Crow]:      "/img/specials/crow.png",
  [UnitType.Possum]:    "/img/specials/possum.png",
  [UnitType.Rat]:       "/img/specials/rat.png",
  [UnitType.Rooster]:   "/img/specials/rooster.png",
  [UnitType.Worm]:      "/img/specials/worm.png",
  [UnitType.Chiwawa]:   "/img/specials/chiwawa.png",
  [UnitType.Cat]:       "/img/specials/cat.png",
  [UnitType.Frog]:      "/img/specials/frog.png",
};

function getUnitImg(type: UnitType, owner: Player): string {
  const entry = UNIT_IMG[type];
  if (typeof entry === "string") return entry;
  return entry?.[owner] ?? "";
}

interface GameBoardProps {
  blueName?: string;
  redName?:  string;
  onGameEnd?: (winner: Player, scores: Record<Player, number>) => void;
}

export default function GameBoard({
  blueName = "藍方", redName = "紅方", onGameEnd,
}: GameBoardProps) {
  const {
    state, highlightedCoords, reshuffle, confirmMap,
    endTurn, selectUnit, summonUnit, handleTileClick,
  } = useGame();

  const canvasRef = useRef<HexCanvasHandle>(null);
  const [pendingSummon, setPendingSummon] = useState<UnitType | null>(null);
  const [log, setLog]   = useState("選擇兵種後點擊格子召喚，或點擊己方兵種移動 / 攻擊");
  const [isMobile, setIsMobile] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const { turn, scores, winner, phase, units, selectedUnitId, tiles } = state;
  const isPlaying = phase === "playing";
  const isSetup   = phase === "setup";
  const selectedUnit = units.find(u => u.id === selectedUnitId) ?? null;

  // ── 召喚 ─────────────────────────────────────────────────
  const handleSummonSelect = useCallback((type: UnitType) => {
    if (!isPlaying) return;
    if (turn.ap <= 0)                                              { setLog("AP 不足，無法召喚"); return; }
    if (turn.summonedThisTurn >= GAME_RULES.MAX_SUMMONS_PER_TURN) { setLog("本回合已召喚 2 隻"); return; }
    const cost    = BASE_STATS[type].summonCost;
    const onField = units.filter(u => u.owner === turn.currentPlayer && u.type === type).length;
    if (scores[turn.currentPlayer] < cost)    { setLog(`積分不足（需要 ${cost} 分）`); return; }
    if (onField >= BASE_STATS[type].maxCount) { setLog(`${UNIT_VISUAL[type].label} 已達上限`); return; }
    setPendingSummon(prev => prev === type ? null : type);
    selectUnit(null);
    setLog(`點擊召喚區放置 ${UNIT_VISUAL[type].label}（−${cost}pt）`);
  }, [isPlaying, turn, scores, units, selectUnit]);

  // ── Canvas 點擊 ───────────────────────────────────────────
  const handleCanvasClick = useCallback((coord: HexCoord) => {
    if (!isPlaying) return;
    if (pendingSummon) {
      const inZone   = SPAWN_ZONES[turn.currentPlayer].some(c => c.q === coord.q && c.r === coord.r);
      if (!inZone)   { setLog("請在己方召喚區召喚"); return; }
      const occupied = units.some(u => u.position.q === coord.q && u.position.r === coord.r);
      if (occupied)  { setLog("此格已有棋子"); return; }
      summonUnit(pendingSummon, coord);
      setLog(`${UNIT_VISUAL[pendingSummon].label} 成功入場！`);
      setPendingSummon(null);
      return;
    }
    const selUnit     = units.find(u => u.id === selectedUnitId);
    const clickedUnit = units.find(u => u.position.q === coord.q && u.position.r === coord.r);
    if (selUnit && clickedUnit && clickedUnit.owner !== selUnit.owner) {
      triggerAttackFlash(selUnit.id);
      // +1 彈出條件：攻擊者尚未攻擊、在射程內、不是不死小強、累積傷害達閾值
      if (!selUnit.hasAttacked) {
        const myTile   = tiles.find(t => t.coord.q === selUnit.position.q && t.coord.r === selUnit.position.r);
        const myEffect = myTile ? TERRAIN_EFFECTS[myTile.terrain] : null;
        const isAerial  = selUnit.specialAbilities?.includes(SpecialAbility.Aerial);
        const isAquatic = selUnit.specialAbilities?.includes(SpecialAbility.Aquatic);
        // 計算有效射程
        let effectiveRng = selUnit.baseStats.rng;
        if (!isAerial) {
          if (myEffect?.meleeOnly) effectiveRng = 1;
          if (isAquatic && myTile?.terrain !== TerrainType.Water) effectiveRng = 0; // 陸地水中不能攻
          if (!isAquatic && myTile?.terrain === TerrainType.Water) effectiveRng = 0; // 普通在水域不能攻
          if (myTile?.terrain === TerrainType.Mountain && selUnit.type === UnitType.Cavalry) effectiveRng = 0;
        }
        const dist = hexDistance(selUnit.position, coord);
        // 在射程內才處理
        if (dist <= effectiveRng && effectiveRng > 0) {
          const defTile      = tiles.find(t => t.coord.q === coord.q && t.coord.r === coord.r);
          const isImmortal   = clickedUnit.specialAbilities?.includes(SpecialAbility.Immortal) ?? false;
          const aquaticBonus = (clickedUnit.specialAbilities?.includes(SpecialAbility.Aquatic) && defTile?.terrain === TerrainType.Water) ? 1 : 0;
          const defBonus     = defTile ? (TERRAIN_EFFECTS[defTile.terrain]?.defBonus ?? 0) : 0;
          const blessingBonus = units.some(u =>
            u.owner === clickedUnit.owner && u.id !== clickedUnit.id &&
            u.specialAbilities?.includes(SpecialAbility.Blessing) &&
            hexDistance(u.position, clickedUnit.position) <= 1
          ) ? 2 : 0;
          const hasWildBark = units.some(u =>
            u.owner !== clickedUnit.owner &&
            u.specialAbilities?.includes(SpecialAbility.WildBark) &&
            hexDistance(u.position, clickedUnit.position) <= 1
          );
          let effectiveDef = (BASE_STATS[clickedUnit.type]?.def ?? 0) + defBonus + aquaticBonus + blessingBonus;
          if (hasWildBark) effectiveDef = Math.ceil(effectiveDef / 2);
          const prevDmg  = state.pendingDamage?.[clickedUnit.id] ?? 0;
          const totalDmg = prevDmg + selUnit.currentAtk;
          if (!isImmortal && totalDmg >= effectiveDef) {
            setTimeout(() => canvasRef.current?._addPopup?.(GAME_RULES.KILL_SCORE, selUnit.owner, clickedUnit.position), 150);
          }
        }
      }
    }
    handleTileClick(coord);
    setLog("點擊己方棋子選取，或點擊高亮格移動 / 攻擊");
  }, [isPlaying, pendingSummon, turn.currentPlayer, units, selectedUnitId, tiles, summonUnit, handleTileClick]);

  const handleCancel = useCallback(() => {
    setPendingSummon(null); selectUnit(null); setLog("已取消選擇");
  }, [selectUnit]);

  const handleEndTurn = useCallback(() => {
    if (winner) return;
    const cur   = turn.currentPlayer;
    const enemy = cur === Player.Blue ? Player.Red : Player.Blue;

    // 城鎮 +2 彈出（哲學家在城鎮時，城鎮加分彈出只算一般 +2，哲學家額外加分另外彈）
    tiles.filter(t => t.terrain === "town" && t.occupiedBy).forEach(t => {
      const occ = units.find(u => u.id === t.occupiedBy);
      if (occ && occ.owner === cur) {
        // 哲學家：城鎮基本 +2 不重複彈，只靠下方 TownBonus 處理兩次
        if (!occ.specialAbilities.includes(SpecialAbility.TownBonus)) {
          setTimeout(() => canvasRef.current?._addPopup?.(GAME_RULES.TOWN_SCORE_PER_TURN, occ.owner, t.coord), 100);
        }
      }
    });
    // 搜集癖（烏鴉）+1
    units.filter(u => u.owner === cur && u.specialAbilities.includes(SpecialAbility.Collector))
      .forEach(u => setTimeout(() => canvasRef.current?._addPopup?.(1, u.owner, u.position), 150));
    // 垃圾哲學家在城鎮：reducer 給 +2（城鎮本身）+ 額外 +2，前端顯示三次... 
    // 實際分數：城鎮+2 + 哲學家TownBonus+2 = +4，顯示兩次 +2
    units.filter(u => u.owner === cur && u.specialAbilities.includes(SpecialAbility.TownBonus))
      .forEach(u => {
        const onTown = tiles.some(t => t.terrain === "town" && t.coord.q === u.position.q && t.coord.r === u.position.r);
        if (onTown) {
          // 城鎮自身 +2（哲學家本身也佔城鎮，所以要顯示一次）
          setTimeout(() => canvasRef.current?._addPopup?.(2, u.owner, u.position), 100);
          // 額外哲學家加成 +2
          setTimeout(() => canvasRef.current?._addPopup?.(2, u.owner, u.position), 400);
        }
      });
    // 摸金（負鼠）：週邊有敵 → +1
    units.filter(u => u.owner === cur && u.specialAbilities.includes(SpecialAbility.Pickpocket))
      .forEach(u => {
        const hasEnemy = units.some(e => e.owner === enemy && hexDistance(e.position, u.position) <= 1);
        if (hasEnemy) setTimeout(() => canvasRef.current?._addPopup?.(1, u.owner, u.position), 300);
      });

    endTurn();
    setPendingSummon(null);
    setLog("回合結束，換對手行動");
    if (winner) onGameEnd?.(winner, scores);
  }, [winner, endTurn, scores, tiles, units, turn.currentPlayer, onGameEnd]);

  const spawnHL: HexCoord[] = pendingSummon
    ? SPAWN_ZONES[turn.currentPlayer].filter(c => !units.some(u => u.position.q === c.q && u.position.r === c.r))
    : [];
  const allHighlights = pendingSummon ? spawnHL : highlightedCoords;
  const pNames: Record<Player, string> = { [Player.Blue]: blueName, [Player.Red]: redName };

  // 召喚按鈕內容（桌機/手機共用）
  const SummonPanel = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {([UnitType.Warrior, UnitType.Archer, UnitType.Cavalry] as UnitType[]).map(type => {
        const stats   = BASE_STATS[type];
        const onField = units.filter(u => u.owner === turn.currentPlayer && u.type === type).length;
        return (
          <SummonBtn key={type}
            label={UNIT_VISUAL[type].label} cost={stats.summonCost}
            count={`${onField}/${stats.maxCount}`}
            selected={pendingSummon === type}
            disabled={scores[turn.currentPlayer] < stats.summonCost || onField >= stats.maxCount}
            onClick={() => handleSummonSelect(type)}
          />
        );
      })}
      {(state.availableSpecials[turn.currentPlayer] ?? []).map(type => {
        const stats   = BASE_STATS[type];
        const vis     = UNIT_VISUAL[type];
        const onField = units.filter(u => u.owner === turn.currentPlayer && u.type === type).length;
        return (
          <SummonBtn key={type}
            label={vis.label} cost={stats.summonCost}
            count={`${onField}/${stats.maxCount}`}
            selected={pendingSummon === type}
            disabled={scores[turn.currentPlayer] < stats.summonCost || onField >= stats.maxCount}
            onClick={() => handleSummonSelect(type)}
            accent={vis.color} tag="特殊"
          />
        );
      })}
    </div>
  );

  if (isMobile) {
    // ── 手機版佈局 ────────────────────────────────────────────
    return (
      <div style={{
        display: "flex", flexDirection: "column", height: "100dvh",
        background: C.bg, fontFamily: "'Noto Sans TC','Microsoft JhengHei',sans-serif",
        color: C.text, overflow: "hidden",
      }}>
        {/* Header 手機版 — 緊湊 */}
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 10px", height: 48, flexShrink: 0,
          background: C.header, borderBottom: `1.5px solid ${C.border}`,
        }}>
          <MobileChip name={blueName} score={scores[Player.Blue]} color={C.blue}
            active={turn.currentPlayer === Player.Blue && isPlaying} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.7rem", color: C.muted, background: C.card,
              borderRadius: 6, padding: "2px 6px", border: `1px solid ${C.border}` }}>
              R{turn.round}
            </span>
            <div style={{ display: "flex", gap: 3 }}>
              {Array.from({ length: GAME_RULES.AP_PER_TURN }, (_, i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: i < turn.ap ? C.accent : "#2E3E36",
                  border: `1.5px solid ${i < turn.ap ? C.accentD : "#3A4E44"}`,
                }} />
              ))}
            </div>
          </div>
          <MobileChip name={redName} score={scores[Player.Red]} color={C.red}
            active={turn.currentPlayer === Player.Red && isPlaying} reverse />
        </header>

        {/* Canvas — 佔大部分空間 */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#243028" }}>
          <HexCanvas ref={canvasRef} state={state} highlights={allHighlights} onTileClick={handleCanvasClick} />
          <TerrainLegend />

          {/* 開局遮罩 */}
          {isSetup && (
            <div style={s.overlay}>
              <div style={{
                background: C.card, border: `1.5px solid ${C.border}`,
                borderRadius: 16, padding: "20px 16px",
                textAlign: "center", width: "92vw", maxWidth: 480,
                display: "flex", flexDirection: "column", alignItems: "center",
                maxHeight: "90dvh", overflow: "auto",
              }}>
                <h2 style={{ ...s.overlayTitle, fontSize: "1.1rem", margin: "0 0 6px" }}>🗺 戰場佈置</h2>
                <p style={{ color: C.muted, fontSize: "0.75rem", margin: "0 0 12px" }}>城鎮固定・其他地形隨機</p>
                <div style={{ width: "100%", marginBottom: 12 }}>
                  <div style={{ fontSize: "0.75rem", color: C.accent, fontWeight: 800, marginBottom: 8 }}>本局特殊角色</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {([Player.Blue, Player.Red] as const).map(side => {
                      const sideColor = side === Player.Blue ? C.blue : C.red;
                      const specials  = state.availableSpecials[side] ?? [];
                      return (
                        <div key={side} style={{ background: C.bg, border: `1.5px solid ${sideColor}55`, borderRadius: 10, padding: "8px 6px" }}>
                          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: sideColor, textAlign: "center", marginBottom: 6 }}>
                            {side === Player.Blue ? "藍方" : "紅方"}
                          </div>
                          {specials.map(type => {
                            const vis   = UNIT_VISUAL[type];
                            const stats = BASE_STATS[type];
                            const desc  = SPECIAL_ABILITY_DESC[stats.specialAbility!] ?? "";
                            return (
                              <div key={type} style={{ background: C.card, borderRadius: 8, padding: "6px", marginBottom: 6, display: "flex", gap: 6 }}>
                                <img src={vis.img} alt={vis.label} style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 800, fontSize: "0.78rem", color: vis.color }}>{vis.label}</div>
                                  <div style={{ fontSize: "0.6rem", color: C.muted, lineHeight: 1.3, marginTop: 2 }}>{desc}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={{ ...s.btnGhost, padding: "8px 14px", fontSize: "0.82rem" }} onClick={reshuffle}>↺ 重抽</button>
                  <button style={{ ...s.btnPrimary, padding: "8px 16px", fontSize: "0.82rem" }} onClick={confirmMap}>確認開局 →</button>
                </div>
              </div>
            </div>
          )}
          {winner && (
            <div style={s.overlay}>
              <div style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 16, padding: "28px 24px", textAlign: "center" }}>
                <div style={{ fontSize: "2.5rem" }}>🏆</div>
                <h2 style={{ ...s.overlayTitle, color: winner === Player.Blue ? C.blue : C.red }}>{pNames[winner]} 勝利！</h2>
                <div style={{ display: "flex", gap: 16, fontSize: "0.9rem", fontWeight: 700 }}>
                  <span style={{ color: C.blue }}>{blueName} {scores[Player.Blue]}pt</span>
                  <span style={{ color: C.muted }}>vs</span>
                  <span style={{ color: C.red }}>{redName} {scores[Player.Red]}pt</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部面板：行動列 + 折疊召喚區 */}
        <div style={{ background: C.panel, borderTop: `1.5px solid ${C.border}`, flexShrink: 0 }}>
          {/* 主行動列 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
            <button style={{ ...s.btnGhost, padding: "7px 12px", fontSize: "0.78rem" }}
              onClick={handleCancel} disabled={!isPlaying}>✕</button>
            <button
              style={{ ...s.btnPrimary, flex: 1, padding: "9px 12px", fontSize: "0.82rem",
                opacity: (!isPlaying || !!winner) ? 0.35 : 1 }}
              onClick={handleEndTurn} disabled={!isPlaying || !!winner}>
              結束回合 →
            </button>
            {isPlaying && (
              <button
                style={{
                  padding: "7px 14px", borderRadius: 10, fontFamily: "inherit",
                  fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
                  border: `1.5px solid ${panelOpen ? C.accent : C.border}`,
                  background: panelOpen ? `${C.accent}22` : C.card,
                  color: panelOpen ? C.accent : C.muted,
                }}
                onClick={() => setPanelOpen(o => !o)}>
                ⚔️ {panelOpen ? "▼" : "▲"}
              </button>
            )}
          </div>
          {/* 狀態 log */}
          <div style={{ padding: "0 10px 6px", fontSize: "0.7rem", color: C.muted,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {log}
          </div>
          {/* 折疊召喚區 */}
          {isPlaying && panelOpen && (
            <div style={{
              borderTop: `1px solid ${C.border}`,
              padding: "10px",
              maxHeight: "38dvh", overflow: "auto",
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[UnitType.Warrior, UnitType.Archer, UnitType.Cavalry, ...(state.availableSpecials[turn.currentPlayer] ?? [])].map(type => {
                  const stats   = BASE_STATS[type];
                  const vis     = UNIT_VISUAL[type];
                  const isSpec  = stats.isSpecial;
                  const onField = units.filter(u => u.owner === turn.currentPlayer && u.type === type).length;
                  const canAff  = scores[turn.currentPlayer] >= stats.summonCost;
                  const atLim   = onField >= stats.maxCount;
                  const ac      = isSpec ? vis.color : C.accent;
                  return (
                    <button key={type} onClick={() => { handleSummonSelect(type); setPanelOpen(false); }}
                      disabled={!canAff || atLim}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                        padding: "8px 6px", borderRadius: 10, fontFamily: "inherit",
                        border: `1.5px solid ${pendingSummon === type ? ac : C.border}`,
                        background: pendingSummon === type ? `${ac}22` : C.card,
                        cursor: (!canAff || atLim) ? "not-allowed" : "pointer",
                        opacity: (!canAff || atLim) ? 0.35 : 1,
                      }}>
                      {isSpec && vis.img
                        ? <img src={vis.img} style={{ width: 36, height: 36, objectFit: "contain" }} alt={vis.label} />
                        : <span style={{ fontSize: "1.4rem" }}>
                            {type === UnitType.Warrior ? "⚔️" : type === UnitType.Archer ? "🎯" : "🐴"}
                          </span>
                      }
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, color: isSpec ? ac : C.text }}>{vis.label}</span>
                      <span style={{ fontSize: "0.62rem", color: ac, fontWeight: 800 }}>−{stats.summonCost}pt</span>
                      <span style={{ fontSize: "0.6rem", color: C.muted }}>{onField}/{stats.maxCount}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 桌機版佈局 ───────────────────────────────────────────────
  return (
    <div style={s.root}>

      {/* ── Header ── */}
      <header style={s.header}>
        <PlayerChip name={blueName} score={scores[Player.Blue]} color={C.blue}
          active={turn.currentPlayer === Player.Blue && isPlaying} />

        <div style={s.turnBlock}>
          <span style={s.roundTag}>R{turn.round}</span>
          <div style={s.apRow}>
            {Array.from({ length: GAME_RULES.AP_PER_TURN }, (_, i) => (
              <div key={i} style={{
                width: 11, height: 11, borderRadius: "50%",
                background: i < turn.ap ? C.accent : "#2E3E36",
                border: `2px solid ${i < turn.ap ? C.accentD : "#3A4E44"}`,
                boxShadow: i < turn.ap ? `0 0 6px ${C.accent}88` : "none",
                transition: "all 0.2s",
              }} />
            ))}
          </div>
          <span style={{
            ...s.curTag,
            color: turn.currentPlayer === Player.Blue ? C.blue : C.red,
            borderColor: turn.currentPlayer === Player.Blue ? `${C.blue}55` : `${C.red}55`,
            background:  turn.currentPlayer === Player.Blue ? `${C.blue}15` : `${C.red}15`,
          }}>
            {isSetup ? "佈置地圖" : isPlaying ? `${pNames[turn.currentPlayer]} 回合` : "結束"}
          </span>
        </div>

        <PlayerChip name={redName} score={scores[Player.Red]} color={C.red}
          active={turn.currentPlayer === Player.Red && isPlaying} reverse />
      </header>

      {/* ── 主體 ── */}
      <div style={s.body}>

        {/* Canvas + 左下角地形說明 */}
        <div style={s.canvasWrap}>
          <HexCanvas ref={canvasRef} state={state} highlights={allHighlights} onTileClick={handleCanvasClick} />
          <TerrainLegend />

          {/* 開局遮罩 */}
          {isSetup && (
            <div style={s.overlay}>
              <div style={{ ...s.overlayCard, maxWidth: 560, width: "90%" }}>
                <div style={{ fontSize: "2.4rem", marginBottom: 4 }}>🗺</div>
                <h2 style={s.overlayTitle}>戰場佈置</h2>
                <p style={{ color: C.muted, fontSize: "0.82rem", margin: "0 0 16px" }}>城鎮固定・其他地形隨機</p>
                <div style={{ width: "100%", marginBottom: 16 }}>
                  <div style={{ fontSize: "0.85rem", color: C.accent, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>本局特殊角色</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {([Player.Blue, Player.Red] as const).map(side => {
                      const sideColor = side === Player.Blue ? C.blue : C.red;
                      const sideLabel = side === Player.Blue ? "藍方" : "紅方";
                      const specials  = state.availableSpecials[side] ?? [];
                      return (
                        <div key={side} style={{ background: C.bg, border: `1.5px solid ${sideColor}55`, borderRadius: 12, padding: "10px 8px" }}>
                          <div style={{ fontSize: "0.82rem", fontWeight: 800, color: sideColor, textAlign: "center", marginBottom: 8, letterSpacing: "0.08em" }}>
                            {sideLabel}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {specials.map(type => {
                              const vis   = UNIT_VISUAL[type];
                              const stats = BASE_STATS[type];
                              const desc  = SPECIAL_ABILITY_DESC[stats.specialAbility!] ?? "";
                              return (
                                <div key={type} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px", display: "flex", gap: 8, alignItems: "center" }}>
                                  <img src={vis.img} alt={vis.label} style={{ width: 52, height: 52, objectFit: "contain", flexShrink: 0, filter: `drop-shadow(0 2px 6px ${vis.color}88)` }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 800, fontSize: "0.92rem", color: vis.color, marginBottom: 3 }}>{vis.label}</div>
                                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 4 }}>
                                      {[`ATK ${stats.atk}`,`DEF ${stats.def}`,`ROM ${stats.rom}`,`RNG ${stats.rng}`].map(d => (
                                        <span key={d} style={{ fontSize: "0.68rem", background: `${C.accent}18`, color: C.accent, padding: "1px 5px", borderRadius: 4, border: `1px solid ${C.accent}33` }}>{d}</span>
                                      ))}
                                    </div>
                                    <div style={{ fontSize: "0.72rem", color: C.muted, lineHeight: 1.35 }}>{desc}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button style={s.btnGhost} onClick={reshuffle}>↺ 重新抽卡</button>
                  <button style={s.btnPrimary} onClick={confirmMap}>確認開局 →</button>
                </div>
              </div>
            </div>
          )}

          {/* 勝利遮罩 */}
          {winner && (
            <div style={s.overlay}>
              <div style={s.overlayCard}>
                <div style={{ fontSize: "3.5rem", marginBottom: 4 }}>🏆</div>
                <h2 style={{ ...s.overlayTitle, color: winner === Player.Blue ? C.blue : C.red }}>{pNames[winner]} 勝利！</h2>
                <div style={{ display: "flex", gap: 20, margin: "12px 0", fontSize: "1rem", fontWeight: 700 }}>
                  <span style={{ color: C.blue }}>{blueName} {scores[Player.Blue]}pt</span>
                  <span style={{ color: C.muted }}>vs</span>
                  <span style={{ color: C.red }}>{redName} {scores[Player.Red]}pt</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 右側面板 ── */}
        <aside style={{ ...s.panel, display: "flex", flexDirection: "column" }}>
          <UnitPortrait unit={selectedUnit} state={state} />
          {isPlaying && (
            <div style={{ ...s.section, flexShrink: 0, marginTop: 10 }}>
              <div style={s.sectionLabel}>召喚兵種</div>
              <SummonPanel />
            </div>
          )}
        </aside>
      </div>

      {/* ── Footer ── */}
      <footer style={s.footer}>
        <button style={s.btnGhost} onClick={handleCancel} disabled={!isPlaying}>✕ 取消</button>
        <button style={{ ...s.btnPrimary, opacity: (!isPlaying || !!winner) ? 0.35 : 1 }}
          onClick={handleEndTurn} disabled={!isPlaying || !!winner}>
          結束回合 →
        </button>
        <span style={s.logText}>{log}</span>
      </footer>

    </div>
  );
}

// ── PlayerChip ────────────────────────────────────────────────
function PlayerChip({ name, score, color, active, reverse = false }: {
  name: string; score: number; color: string; active: boolean; reverse?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      flexDirection: reverse ? "row-reverse" : "row",
      gap: 8, minWidth: 130,
      padding: "5px 16px", borderRadius: 999,
      border: `1.5px solid ${active ? color : C.border}`,
      background: active ? `${color}18` : "transparent",
      boxShadow: active ? `0 0 14px ${color}44` : "none",
      transition: "all 0.3s",
    }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: "0.82rem", color: C.muted }}>{name}</span>
      <span style={{ fontWeight: 900, fontSize: "1.2rem", color, marginLeft: 2 }}>{score}</span>
    </div>
  );
}

// ── MobileChip：手機版緊湊分數顯示 ──────────────────────────
function MobileChip({ name, score, color, active, reverse = false }: {
  name: string; score: number; color: string; active: boolean; reverse?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      flexDirection: reverse ? "row-reverse" : "row",
      gap: 5,
      padding: "3px 10px", borderRadius: 999,
      border: `1.5px solid ${active ? color : C.border}`,
      background: active ? `${color}18` : "transparent",
      transition: "all 0.3s",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: "0.7rem", color: C.muted, maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      <span style={{ fontWeight: 900, fontSize: "1rem", color }}>{score}</span>
    </div>
  );
}

// ── 角色對白 ─────────────────────────────────────────────────
const UNIT_QUOTES: Record<string, Record<Player, string[]>> = {
  // ── 藍隊臭鼬 ──────────────────────────────────────────────
  [UnitType.Warrior]: {
    [Player.Blue]: [
      "別擋路，骨頭很貴的！",
      "靠近一步你試試！",
      "我站這就是為了打架。",
      "有膽就衝過來！",
      "臭鼬幫不歡迎外人！",
      "這條垃圾場我守了三年！",
    ],
    [Player.Red]: [
      "不要搶我的垃圾！",
      "這條街是我的地盤！",
      "你剛才看我什麼眼神？",
      "魚骨頭也是我的！",
      "浣熊幫天下無敵！",
      "你知道我今天有多餓嗎？！",
    ],
  },
  [UnitType.Archer]: {
    [Player.Blue]: [
      "安靜……我在瞄準。",
      "毒霧範圍很廣，小心點。",
      "射程夠遠，你逃不掉。",
      "嘿嘿，吃我這一罐！",
      "從這裡噴到那裡，正中目標。",
      "聞到了嗎？那是我的攻擊。",
    ],
    [Player.Red]: [
      "誰偷了我的魚罐頭！",
      "老子連狙擊都懂！",
      "遠遠地就能幹掉你！",
      "這一罐送你免費的。",
      "浣熊也會遠程！吃驚嗎？",
      "垃圾桶旁邊練出來的準度！",
    ],
  },
  [UnitType.Cavalry]: {
    [Player.Blue]: [
      "衝啊！屁股噴到你！",
      "沒人擋得住我的速度！",
      "全速前進，別廢話！",
      "盔甲戴好了，出發！",
      "臭鼬騎兵！聽起來就帥！",
      "快跑！我比你想像的快！",
    ],
    [Player.Red]: [
      "讓開讓開！購物車失控！",
      "斗篷飛起來就是帥！",
      "這速度連警察追不上！",
      "衝進去搶完再說！",
      "浣熊的腿比你以為的還長！",
      "嗚嗚嗚！搶了就跑！",
    ],
  },
  // ── 特殊角色 ──────────────────────────────────────────────
  [UnitType.Catfish]: {
    [Player.Blue]: [
      "下水道是我家。",
      "水裡我最硬！",
      "你聞到什麼了嗎？",
      "我吐的是藝術。",
      "污水？那是我的浴缸。",
      "沒有我，下水道誰管？",
    ],
    [Player.Red]: [
      "這條水溝是我的！",
      "臭？你才臭！",
      "誰敢攔我的水？",
      "水底的事少管閒事。",
      "浣熊也愛水！",
      "嘎！竟然跟我搶水域！",
    ],
  },
  [UnitType.Snake]: {
    [Player.Blue]: [
      "噓……別亂動。",
      "我這一圈，沒人進得來。",
      "你的膽子呢？",
      "怕了吧，慢慢怕。",
      "靠近我試試，我讓你動彈不得。",
      "嘶嘶嘶……滾開。",
    ],
    [Player.Red]: [
      "這塊地我罩的。",
      "你再靠近試試？",
      "嘶……識相就閃開。",
      "沒有我點頭誰都別動。",
      "我盤踞在此，你要怎樣？",
      "想過來？先看我臉色。",
    ],
  },
  [UnitType.Pigeon]: {
    [Player.Blue]: [
      "從天而降！",
      "看我投彈！",
      "哦哦哦～～～",
      "飛得高打得準！",
      "地形？從空中看都一樣！",
      "呱！（這是鴿子的聲音嗎？）",
    ],
    [Player.Red]: [
      "哈哈哈俯衝攻擊！",
      "地形？什麼地形？",
      "誰都擋不住我！",
      "轟炸開始！",
      "垃圾場的制空權是我的！",
      "翱翔在垃圾堆上方，真爽！",
    ],
  },
  [UnitType.Cockroach]: {
    [Player.Blue]: [
      "打不死我的！",
      "哈！又躲過了！",
      "我已經死過一百次了。",
      "核爆都沒用！",
      "你的攻擊？不好意思，沒感覺。",
      "強哥從來不認輸！",
    ],
    [Player.Red]: [
      "嘿嘿沒打到！",
      "我永遠不會死！",
      "再來！再來！",
      "你打得到算我輸！",
      "浣熊幫的不死先鋒！",
      "我存在了三億年，怕你？",
    ],
  },
  [UnitType.Crow]: {
    [Player.Blue]: [
      "閃亮的東西都是我的。",
      "又多了一枚金幣。",
      "財富就是力量！",
      "哈哈哈哈哈！",
      "從天而降再撿一枚！",
      "哥飛得高，看得遠，賺得多。",
    ],
    [Player.Red]: [
      "拿到啦！",
      "這個也要！那個也要！",
      "再給我一枚！",
      "Bling bling！",
      "勉強施捨你一枚！",
      "每回合都是收穫！",
    ],
  },
  [UnitType.Possum]: {
    [Player.Blue]: [
      "到手！到手！",
      "你的錢是我的錢。",
      "看到敵人就知道——到手。",
      "我只是借過來而已。",
      "靠近我就是給我送錢！",
      "摸！金！到！手！",
    ],
    [Player.Red]: [
      "借錢要還，誰還要借？！",
      "嘿嘿，順走了。",
      "你再靠近，我就再拿一次。",
      "摸了就走，溜了。",
      "浣熊幫的財務大臣！",
      "鄰居嘛，借個一分不過分吧？",
    ],
  },
  [UnitType.Rat]: {
    [Player.Blue]: [
      "願主保佑你……的DEF。",
      "阿門，臭臭們加油！",
      "我用禱告守護你。",
      "上帝說：+2 DEF。",
      "在垃圾堆裡也要有信仰！",
      "祝福！防禦力上升！",
    ],
    [Player.Red]: [
      "讓我為你祈禱。",
      "信仰使我們強大！",
      "願主保護我們。",
      "阿門阿門阿門！",
      "浣熊幫也有神職人員的！",
      "打架前先禱告，這很重要。",
    ],
  },
  [UnitType.Rooster]: {
    [Player.Blue]: [
      "還有人敢上嗎？",
      "屁股大了不起？",
      "就這點ATK？",
      "哥只是來散步的。",
      "ATK7！我只是不想動！",
      "你看我眼神就知道快跑。",
    ],
    [Player.Red]: [
      "我就站這，怎樣？",
      "來打我啊！",
      "ATK7 DEF7，你呢？",
      "沒廢話，開幹。",
      "浣熊幫最強打手！",
      "我一個頂你三個！",
    ],
  },
  [UnitType.Worm]: {
    [Player.Blue]: [
      "世界是垃圾……但城鎮是我的。",
      "哲學嘛，就是垃圾堆中的黃金。",
      "存在即是收費。",
      "這塊地，我罩。",
      "我的ATK是0，但我的智慧無限。",
      "哲學家從不出手，只等收益。",
    ],
    [Player.Red]: [
      "The world is trash，但分數不是。",
      "待在城鎮什麼都不用做。",
      "哲♂學",
      "哲學家的智慧：佔地。",
      "浣熊幫的精神領袖。",
      "我連攻擊都懶，但我最賺。",
    ],
  },
  [UnitType.Chiwawa]: {
    [Player.Blue]: [
      "汪汪汪！！！！",
      "你敢靠近？！",
      "嗯？！！嗯？！！",
      "吠爆你！",
      "我小我兇！防禦減半！",
      "汪汪汪汪汪汪汪！！",
    ],
    [Player.Red]: [
      "靠過來試試！",
      "汪！汪！汪汪汪！",
      "破防了嗎？嘿！",
      "我很小但我很兇！",
      "浣熊幫的噪音武器！",
      "你的盾牌？被我吠碎了！",
    ],
  },
  [UnitType.Cat]: {
    [Player.Blue]: [
      "噠噠噠噠——",
      "射程三格，怕了嗎？",
      "你在哪？我看得見！",
      "嗖——中了！",
      "瘦不代表弱！看這準度！",
      "我的食物，我用槍保護！",
    ],
    [Player.Red]: [
      "這是我的！誰搶我打誰！",
      "噠！噠！噠！噠！",
      "遠遠地保護我的垃圾！",
      "只是BB彈，但很爽！",
      "浣熊幫最遠的射手！",
    ],
  },
  [UnitType.Frog]: {
    [Player.Blue]: [
      "聽說這裡有吃的……",
      "垃圾堆？跟平常吃的沒兩樣。",
      "塊逃～！",
      "我只是路過的，順便幫個忙。",
      "水裡水外都能混的蛙！",
      "HELP！ 我只是來領便當的...",
    ],
    [Player.Red]: [
      "呱——算了，打就打。",
      "呱！沒想到是這種垃圾堆。",
      "既然都來了就幫浣熊幫吧。",
      "流浪蛙不挑食，打架也不挑。",
      "便當到了嗎？",
      "真香！這裡的垃圾堆比我想像的好吃！",
    ],
  },
};

function getQuote(unit: Unit): string {
  const pool = UNIT_QUOTES[unit.type]?.[unit.owner];
  if (!pool) return "";
  // 用 unit.id 做確定性選擇，同一棋子每次顯示同一句
  const idx = unit.id.charCodeAt(unit.id.length - 1) % pool.length;
  return pool[idx];
}

// ── UnitPortrait：填滿上半部，hover 顯示角色對白 ─────────────
function UnitPortrait({ unit, state }: {
  unit: Unit | null;
  state: ReturnType<typeof useGame>["state"];
}) {
  const [hovering, setHovering] = useState(false);

  if (!unit) {
    return (
      <div style={{
        flex: 1, minHeight: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        borderRadius: 16, border: `1.5px dashed ${C.border}`,
        background: C.card, gap: 8,
      }}>
        <span style={{ fontSize: "2.5rem", opacity: 0.3 }}>⚔️</span>
        <span style={{ fontSize: "0.75rem", color: C.muted }}>點擊棋子查看</span>
      </div>
    );
  }

  const imgSrc  = getUnitImg(unit.type, unit.owner);
  const pColor  = unit.owner === Player.Blue ? C.blue : C.red;
  const done    = unit.hasMoved && unit.hasAttacked;
  const quote   = getQuote(unit);

  // 精確計算「可否行動」：移動 or 攻擊任一可做就算可動
  const canMove = !unit.hasMoved && !state.turn.attackPhaseStarted && unit.status !== UnitStatus.Summoned;
  const myTile  = state.tiles.find(t => t.coord.q === unit.position.q && t.coord.r === unit.position.r);

  // 攻擊能力判斷
  let canAttack = !unit.hasAttacked;
  if (canAttack) {
    // 被威嚇
    const intimidated = state.units.some(u =>
      u.owner !== unit.owner &&
      u.specialAbilities?.includes(SpecialAbility.Intimidate) &&
      hexDistance(u.position, unit.position) <= 1
    );
    if (intimidated) canAttack = false;
    // 水域限制（非水中單位 or 陸地水中單位）
    if (canAttack && myTile) {
      const isAquatic = unit.specialAbilities?.includes(SpecialAbility.Aquatic);
      const isAerial  = unit.specialAbilities?.includes(SpecialAbility.Aerial);
      if (!isAerial) {
        if (isAquatic && myTile.terrain !== TerrainType.Water) canAttack = false;
        else if (!isAquatic && myTile.terrain === TerrainType.Water) canAttack = false;
        // 山區騎兵
        if (myTile.terrain === TerrainType.Mountain && unit.type === UnitType.Cavalry) canAttack = false;
      }
    }
  }

  const canAct    = canMove || canAttack;
  const statusStr = done ? "已行動" : canAct ? "可行動" : "不可動";
  const statusBg  = done ? C.bg     : canAct ? `${C.accent}22`  : `${C.red}22`;
  const statusCol = done ? C.muted  : canAct ? C.accent          : C.red;
  const statusBd  = done ? C.border : canAct ? `${C.accent}66`   : `${C.red}66`;

  return (
    <div
      style={{ flex: 1, minHeight: 0, position: "relative" }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div style={{
        height: "100%",
        background: `radial-gradient(ellipse at 50% 90%, ${pColor}30 0%, ${C.card} 60%)`,
        borderRadius: 16,
        border: `1.5px solid ${pColor}44`,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <img
          src={imgSrc}
          alt={UNIT_VISUAL[unit.type].label}
          style={{
            maxHeight: "100%",
            width: "auto",
            objectFit: "contain",
            objectPosition: "bottom center",
            filter: `drop-shadow(0 6px 20px ${pColor}99)`,
            opacity: done ? 0.5 : 1,
            transition: "opacity 0.3s",
            marginBottom: -8,
          }}
        />

        {/* 狀態 badge */}
        <div style={{
          position: "absolute", top: 10, left: 10,
          fontSize: "0.66rem", fontWeight: 700,
          padding: "2px 10px", borderRadius: 999,
          background: statusBg,
          color: statusCol,
          border: `1px solid ${statusBd}`,
          zIndex: 2,
        }}>
          {statusStr}
        </div>

        {/* 玩家方 badge */}
        <div style={{
          position: "absolute", top: 10, right: 10,
          fontSize: "0.66rem", fontWeight: 700,
          padding: "2px 10px", borderRadius: 999,
          background: `${pColor}22`, color: pColor,
          border: `1px solid ${pColor}55`,
          zIndex: 2,
        }}>
          {unit.owner === Player.Blue ? "藍方" : "紅方"}
        </div>

        {/* 底部名稱漸層 */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "24px 14px 12px",
          background: `linear-gradient(transparent, ${C.card}ee)`,
          borderRadius: "0 0 14px 14px",
          textAlign: "center",
          zIndex: 2,
        }}>
          <span style={{ fontWeight: 800, fontSize: "1rem", color: pColor }}>
            {UNIT_VISUAL[unit.type].label}
          </span>
        </div>

        {/* Hover 對白泡泡 */}
        {hovering && quote && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "16px 14px",
            background: `${C.card}D8`,
            backdropFilter: "blur(4px)",
            borderRadius: 14,
            zIndex: 10,
            pointerEvents: "none",
          }}>
            {/* 對話泡泡 */}
            <div style={{
              background: "#FFFFFF",
              borderRadius: 14,
              padding: "10px 16px",
              maxWidth: "90%",
              position: "relative",
              boxShadow: `0 4px 20px rgba(0,0,0,0.3)`,
            }}>
              <span style={{
                fontSize: "0.88rem",
                fontWeight: 700,
                color: "#1a1a1a",
                lineHeight: 1.5,
                display: "block",
                textAlign: "center",
              }}>
                {quote}
              </span>
              {/* 泡泡尾巴 */}
              <div style={{
                position: "absolute",
                bottom: -10, left: "50%",
                transform: "translateX(-50%)",
                width: 0, height: 0,
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderTop: "10px solid #FFFFFF",
              }} />
            </div>

            {/* 名稱標籤 */}
            <div style={{
              marginTop: 18,
              fontSize: "0.72rem",
              color: pColor,
              fontWeight: 700,
              letterSpacing: "0.06em",
              background: `${pColor}22`,
              padding: "3px 12px",
              borderRadius: 999,
              border: `1px solid ${pColor}44`,
            }}>
              {unit.owner === Player.Blue ? "藍方" : "紅方"} {UNIT_VISUAL[unit.type].label}
            </div>

            {/* 特殊技能備注（僅特殊角色顯示，列出所有能力） */}
            {unit.specialAbilities.length > 0 && (() => {
              const abilityColor: Record<string, string> = {
                [SpecialAbility.Aquatic]:    "#3b82f6",
                [SpecialAbility.Aerial]:     "#8b5cf6",
                [SpecialAbility.Intimidate]: "#ef4444",
                [SpecialAbility.Immortal]:   "#f59e0b",
                [SpecialAbility.Collector]:  "#eab308",
                [SpecialAbility.Pickpocket]: "#10b981",
                [SpecialAbility.Blessing]:   "#f0abfc",
                [SpecialAbility.NoAbility]:  "#6b7280",
                [SpecialAbility.TownBonus]:  "#a78bfa",
                [SpecialAbility.WildBark]:   "#fb923c",
                [SpecialAbility.ToyGun]:     "#60a5fa",
              };
              const abilityIcon: Record<string, string> = {
                [SpecialAbility.Aquatic]:    "💧",
                [SpecialAbility.Aerial]:     "🕊",
                [SpecialAbility.Intimidate]: "⚠️",
                [SpecialAbility.Immortal]:   "💀",
                [SpecialAbility.Collector]:  "🪙",
                [SpecialAbility.Pickpocket]: "🤏",
                [SpecialAbility.Blessing]:   "✝️",
                [SpecialAbility.NoAbility]:  "💪",
                [SpecialAbility.TownBonus]:  "🗑",
                [SpecialAbility.WildBark]:   "🐕",
                [SpecialAbility.ToyGun]:     "🔫",
              };
              return unit.specialAbilities.map(ability => {
                const col = abilityColor[ability] ?? C.accent;
                const ico = abilityIcon[ability] ?? "✦";
                return (
                  <div key={ability} style={{
                    marginTop: 8,
                    maxWidth: "92%",
                    background: `${col}18`,
                    border: `1px solid ${col}44`,
                    borderRadius: 10,
                    padding: "6px 12px",
                    display: "flex", alignItems: "flex-start", gap: 6,
                  }}>
                    <span style={{ fontSize: "0.85rem", flexShrink: 0, marginTop: 1 }}>{ico}</span>
                    <span style={{
                      fontSize: "0.78rem",
                      color: col,
                      fontWeight: 600,
                      lineHeight: 1.45,
                      textAlign: "left",
                    }}>
                      {SPECIAL_ABILITY_DESC[ability]}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SummonBtn：文字按鈕，不含圖片 ────────────────────────────
function SummonBtn({ label, cost, count, selected, disabled, onClick, accent, tag }: {
  label: string; cost: number; count: string;
  selected: boolean; disabled: boolean; onClick: () => void;
  accent?: string; tag?: string;
}) {
  const ac = accent ?? C.accent;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", display: "flex", alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px", borderRadius: 10, fontFamily: "inherit",
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "all 0.15s",
      border:     selected ? `1.5px solid ${ac}` : `1.5px solid ${C.border}`,
      background: selected ? `${ac}20` : C.card,
      boxShadow:  selected ? `0 0 0 2px ${ac}33` : "none",
      opacity:    disabled ? 0.35 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: "0.88rem", color: C.text }}>{label}</span>
        {tag && (
          <span style={{
            fontSize: "0.58rem", fontWeight: 800, color: ac,
            background: `${ac}22`, borderRadius: 4,
            padding: "1px 5px", border: `1px solid ${ac}44`,
          }}>{tag}</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: "0.7rem", color: C.muted }}>{count}</span>
        <span style={{
          fontSize: "0.73rem", fontWeight: 800,
          color: selected ? C.bg : ac,
          background: selected ? ac : `${ac}22`,
          borderRadius: 6, padding: "1px 7px",
          border: `1px solid ${ac}55`,
        }}>−{cost}pt</span>
      </div>
    </button>
  );
}

// ── TerrainLegend：左下角浮動面板 ────────────────────────────
function TerrainLegend() {
  const [open, setOpen] = useState(false);
  const items = [
    { key: "town"     as const, notes: ["+2分", "DEF+1"] },
    { key: "plain"    as const, notes: ["無效果"] },
    { key: "forest"   as const, notes: ["近戰限定", "DEF+1"] },
    { key: "water"    as const, notes: ["移動限制(1格)", "不可攻擊"] },
    { key: "mountain" as const, notes: ["移動限制(1格)", "DEF+2", "騎士不可進攻"] },
  ];

  return (
    <div style={{
      position: "absolute", bottom: 14, left: 14,
      zIndex: 15, userSelect: "none",
    }}>
      {/* 展開面板 */}
      {open && (
        <div style={{
          marginBottom: 8,
          background: `${C.panel}F5`,
          backdropFilter: "blur(8px)",
          border: `1.5px solid ${C.border}`,
          borderRadius: 14,
          padding: "12px 14px",
          display: "flex", flexDirection: "column", gap: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          minWidth: 220,
        }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 800, color: C.accent,
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
            地形效果
          </div>
          {items.map(({ key, notes }) => {
            const vis = TERRAIN_VISUAL[key as keyof typeof TERRAIN_VISUAL];
            return (
              <div key={key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <img src={`/img/terrain/${key}.png`} alt={vis.label}
                  style={{ width: 30, height: 30, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: C.text }}>{vis.label}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 4px", marginTop: 2 }}>
                    {notes.map(n => (
                      <span key={n} style={{
                        fontSize: "0.62rem", color: C.accent,
                        background: `${C.accent}18`, borderRadius: 4,
                        padding: "1px 5px", border: `1px solid ${C.accent}33`,
                      }}>{n}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* 切換按鈕 */}
      <button onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "7px 14px", borderRadius: 10,
        border: `1.5px solid ${open ? C.accent : C.border}`,
        background: open ? `${C.accent}22` : `${C.panel}CC`,
        backdropFilter: "blur(6px)",
        color: open ? C.accent : C.muted,
        fontSize: "0.78rem", fontWeight: 700,
        cursor: "pointer", fontFamily: "inherit",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        transition: "all 0.2s",
      }}>
        🗺 地形效果 {open ? "▲" : "▼"}
      </button>
    </div>
  );
}

// ── 樣式 ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: {
    display: "grid", gridTemplateRows: "58px 1fr 56px",
    height: "100vh",
    background: C.bg,
    fontFamily: "'Noto Sans TC','Microsoft JhengHei',sans-serif",
    color: C.text, overflow: "hidden",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 20px",
    background: C.header,
    borderBottom: `1.5px solid ${C.border}`,
    gap: 12,
  },
  turnBlock: {
    display: "flex", alignItems: "center", gap: 14, flex: 1, justifyContent: "center",
  },
  roundTag: {
    fontSize: "0.8rem", fontWeight: 800, color: C.muted,
    background: C.card, borderRadius: 6,
    padding: "2px 10px", border: `1px solid ${C.border}`,
    letterSpacing: "0.05em",
  },
  apRow: { display: "flex", gap: 5 },
  curTag: {
    fontSize: "0.85rem", fontWeight: 700,
    padding: "3px 14px", borderRadius: 999,
    border: "1.5px solid", transition: "all 0.3s",
    letterSpacing: "0.02em",
  },
  body: {
    display: "grid",
    gridTemplateColumns: "1fr 280px",
    overflow: "hidden",
  },
  canvasWrap: {
    position: "relative", overflow: "hidden",
    background: "#243028",   // 地圖區：比面板深，製造層次
  },
  overlay: {
    position: "absolute", inset: 0,
    background: "rgba(21,26,23,0.88)",
    backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 20,
  },
  overlayCard: {
    background: C.card,
    border: `1.5px solid ${C.border}`,
    borderRadius: 20,
    padding: "36px 48px",
    textAlign: "center",
    boxShadow: `0 0 60px ${C.accent}22`,
    display: "flex", flexDirection: "column", alignItems: "center",
  },
  overlayTitle: {
    fontFamily: "'Cinzel','Georgia',serif",
    color: C.accent,
    fontSize: "1.5rem", fontWeight: 700,
    margin: "0 0 8px", letterSpacing: "0.08em",
  },
  panel: {
    background: "#324038",   // 面板：比 canvas 稍亮
    borderLeft: `1.5px solid ${C.border}`,
    padding: "14px 12px",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  section: {
    display: "flex", flexDirection: "column", gap: 8,
  },
  sectionLabel: {
    fontSize: "0.68rem", fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em", color: C.muted,
    paddingBottom: 4, borderBottom: `1px solid ${C.sep}`,
  },
  footer: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "0 20px",
    background: C.header,
    borderTop: `1.5px solid ${C.border}`,
  },
  logText: {
    marginLeft: "auto", fontSize: "0.78rem", color: C.muted,
    overflow: "hidden", textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const, maxWidth: 380,
  },
  btnPrimary: {
    padding: "9px 22px", borderRadius: 10, border: "none",
    background: C.accent,
    color: C.bg, fontFamily: "inherit", fontWeight: 900,
    fontSize: "0.9rem", cursor: "pointer",
    boxShadow: `0 4px 16px ${C.accent}44`,
    transition: "all 0.15s", flexShrink: 0, letterSpacing: "0.04em",
  },
  btnGhost: {
    padding: "9px 18px", borderRadius: 10,
    border: `1.5px solid ${C.border}`,
    background: "transparent",
    color: C.muted, fontFamily: "inherit",
    fontSize: "0.88rem", cursor: "pointer",
    transition: "all 0.15s", flexShrink: 0,
  },
};
