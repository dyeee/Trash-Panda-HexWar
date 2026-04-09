"use client";
// ============================================================
// components/game/GameBoard.tsx — 墨綠撞色都市感版
// ============================================================
import { useState, useCallback, useRef } from "react";
import { useGame }   from "@/hooks/useGame";
import HexCanvas, { HexCanvasHandle } from "@/components/canvas/HexCanvas";
import { triggerAttackFlash } from "@/lib/game/canvasRenderer";
import { UnitType, Player, HexCoord, Unit, SpecialAbility, TerrainType } from "@/types";
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
  // 特殊角色：兩方共用同一張圖
  [UnitType.Catfish]:   "/img/specials/catfish.png",
  [UnitType.Snake]:     "/img/specials/snake.png",
  [UnitType.Pigeon]:    "/img/specials/pigeon.png",
  [UnitType.Cockroach]: "/img/specials/cockroach.png",
  [UnitType.Crow]:      "/img/specials/crow.png",
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
      // +1 彈出條件：
      //   1. 累積傷害（含本次）>= 有效 DEF
      //   2. 目標不是不死小強（或是但這次不會 miss，無法預知，所以不死小強不預彈）
      const defTile       = tiles.find(t => t.coord.q === coord.q && t.coord.r === coord.r);
      const isImmortal    = clickedUnit.specialAbility === SpecialAbility.Immortal;
      const aquaticBonus  = clickedUnit.specialAbility === SpecialAbility.Aquatic &&
        defTile?.terrain === TerrainType.Water ? 1 : 0;
      const defBonus      = defTile ? (TERRAIN_EFFECTS[defTile.terrain]?.defBonus ?? 0) : 0;
      const effectiveDef  = (BASE_STATS[clickedUnit.type]?.def ?? 0) + defBonus + aquaticBonus;
      const prevDmg       = state.pendingDamage?.[clickedUnit.id] ?? 0;
      const totalDmg      = prevDmg + selUnit.currentAtk;
      // 不死小強：無法預知是否 miss，不提前彈出；其他：累積傷害達閾值才彈
      if (!isImmortal && totalDmg >= effectiveDef) {
        setTimeout(() => canvasRef.current?._addPopup?.(GAME_RULES.KILL_SCORE, selUnit.owner, clickedUnit.position), 150);
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
    // 城鎮 +2 彈出（當前回合方）
    tiles.filter(t => t.terrain === "town" && t.occupiedBy).forEach(t => {
      const occ = units.find(u => u.id === t.occupiedBy);
      if (occ && occ.owner === turn.currentPlayer) {
        setTimeout(() => canvasRef.current?._addPopup?.(GAME_RULES.TOWN_SCORE_PER_TURN, occ.owner, t.coord), 100);
      }
    });
    // 烏鴉 搜集癖 +1 彈出（當前回合方的烏鴉）
    units
      .filter(u => u.owner === turn.currentPlayer && u.specialAbility === SpecialAbility.Collector)
      .forEach(u => {
        setTimeout(() => canvasRef.current?._addPopup?.(1, u.owner, u.position), 150);
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

  if (winner && onGameEnd) {
    // 只在 handleEndTurn 裡呼叫，這裡不重複
  }
  const pNames: Record<Player, string> = { [Player.Blue]: blueName, [Player.Red]: redName };

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

          {/* 左下角地形說明 */}
          <TerrainLegend />

          {/* 開局遮罩 */}
          {isSetup && (
            <div style={s.overlay}>
              <div style={{ ...s.overlayCard, maxWidth: 560, width: "90%" }}>
                <div style={{ fontSize: "2.4rem", marginBottom: 4 }}>🗺</div>
                <h2 style={s.overlayTitle}>戰場佈置</h2>
                <p style={{ color: C.muted, fontSize: "0.82rem", margin: "0 0 16px" }}>
                  城鎮固定・其他地形隨機
                </p>

                {/* 本局特殊角色展示 — 左藍右紅 */}
                <div style={{ width: "100%", marginBottom: 16 }}>
                  <div style={{ fontSize: "0.85rem", color: C.accent, fontWeight: 800,
                    letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                    本局特殊角色
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {([Player.Blue, Player.Red] as const).map(side => {
                      const sideColor = side === Player.Blue ? C.blue : C.red;
                      const sideLabel = side === Player.Blue ? "藍方" : "紅方";
                      const specials  = state.availableSpecials[side] ?? [];
                      return (
                        <div key={side} style={{
                          background: C.bg,
                          border: `1.5px solid ${sideColor}55`,
                          borderRadius: 12, padding: "10px 8px",
                        }}>
                          <div style={{
                            fontSize: "0.82rem", fontWeight: 800, color: sideColor,
                            textAlign: "center", marginBottom: 8,
                            letterSpacing: "0.08em",
                          }}>
                            {sideLabel}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {specials.map(type => {
                              const vis   = UNIT_VISUAL[type];
                              const stats = BASE_STATS[type];
                              const desc  = SPECIAL_ABILITY_DESC[stats.specialAbility!] ?? "";
                              return (
                                <div key={type} style={{
                                  background: C.card,
                                  border: `1px solid ${C.border}`,
                                  borderRadius: 10, padding: "8px",
                                  display: "flex", gap: 8, alignItems: "center",
                                }}>
                                  <img src={vis.img} alt={vis.label}
                                    style={{ width: 52, height: 52, objectFit: "contain", flexShrink: 0,
                                      filter: `drop-shadow(0 2px 6px ${vis.color}88)` }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 800, fontSize: "0.92rem", color: vis.color, marginBottom: 3 }}>
                                      {vis.label}
                                    </div>
                                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 4 }}>
                                      {[`ATK ${stats.atk}`,`DEF ${stats.def}`,`ROM ${stats.rom}`,`RNG ${stats.rng}`].map(d => (
                                        <span key={d} style={{
                                          fontSize: "0.68rem", background: `${C.accent}18`,
                                          color: C.accent, padding: "1px 5px", borderRadius: 4,
                                          border: `1px solid ${C.accent}33`,
                                        }}>{d}</span>
                                      ))}
                                    </div>
                                    <div style={{ fontSize: "0.72rem", color: C.muted, lineHeight: 1.35 }}>
                                      {desc}
                                    </div>
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
                <h2 style={{ ...s.overlayTitle, color: winner === Player.Blue ? C.blue : C.red }}>
                  {pNames[winner]} 勝利！
                </h2>
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
        <aside style={{
          ...s.panel,
          display: "flex",
          flexDirection: "column",
          // 讓 portrait 和 section 共用空間
        }}>

          {/* 棋子大圖區 — flex:1 填滿剩餘 */}
          <UnitPortrait unit={selectedUnit} tiles={tiles} />

          {/* 召喚按鈕 */}
          {isPlaying && (
            <div style={{ ...s.section, flexShrink: 0, marginTop: 10 }}>
              <div style={s.sectionLabel}>召喚兵種</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {/* 普通兵種 */}
                {([UnitType.Warrior, UnitType.Archer, UnitType.Cavalry] as UnitType[]).map(type => {
                  const stats     = BASE_STATS[type];
                  const onField   = units.filter(u => u.owner === turn.currentPlayer && u.type === type).length;
                  const canAfford = scores[turn.currentPlayer] >= stats.summonCost;
                  const atLimit   = onField >= stats.maxCount;
                  return (
                    <SummonBtn key={type}
                      label={UNIT_VISUAL[type].label}
                      cost={stats.summonCost}
                      count={`${onField}/${stats.maxCount}`}
                      selected={pendingSummon === type}
                      disabled={!canAfford || atLimit}
                      onClick={() => handleSummonSelect(type)}
                    />
                  );
                })}
                {/* 特殊角色（當前行動方自己的） */}
                {(state.availableSpecials[turn.currentPlayer] ?? []).map(type => {
                  const stats     = BASE_STATS[type];
                  const vis       = UNIT_VISUAL[type];
                  const onField   = units.filter(u => u.owner === turn.currentPlayer && u.type === type).length;
                  const canAfford = scores[turn.currentPlayer] >= stats.summonCost;
                  const atLimit   = onField >= stats.maxCount;
                  return (
                    <SummonBtn key={type}
                      label={vis.label}
                      cost={stats.summonCost}
                      count={`${onField}/${stats.maxCount}`}
                      selected={pendingSummon === type}
                      disabled={!canAfford || atLimit}
                      onClick={() => handleSummonSelect(type)}
                      accent={vis.color}
                      tag="特殊"
                    />
                  );
                })}
              </div>
            </div>
          )}

        </aside>
      </div>

      {/* ── Footer ── */}
      <footer style={s.footer}>
        <button style={s.btnGhost} onClick={handleCancel} disabled={!isPlaying}>✕ 取消</button>
        <button
          style={{ ...s.btnPrimary, opacity: (!isPlaying || !!winner) ? 0.35 : 1 }}
          onClick={handleEndTurn} disabled={!isPlaying || !!winner}
        >
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

// ── 角色對白 ─────────────────────────────────────────────────
const UNIT_QUOTES: Record<string, Record<Player, string[]>> = {
  [UnitType.Warrior]: {
    [Player.Blue]: [
      "別擋路，骨頭很貴的！",
      "靠近一步你試試！",
      "我站這就是為了打架。",
      "有膽就衝過來！",
    ],
    [Player.Red]: [
      "不要搶我的垃圾！",
      "這條街是我的地盤！",
      "你剛才看我什麼眼神？",
      "魚骨頭也是我的！",
    ],
  },
  [UnitType.Archer]: {
    [Player.Blue]: [
      "安靜……我在瞄準。",
      "毒霧範圍很廣，小心點。",
      "射程夠遠，你逃不掉。",
      "嘿嘿，吃我這一罐！",
    ],
    [Player.Red]: [
      "誰偷了我的魚罐頭！",
      "老子連狙擊都懂！",
      "遠遠地就能幹掉你！",
      "這一罐送你免費的。",
    ],
  },
  [UnitType.Cavalry]: {
    [Player.Blue]: [
      "衝啊！屁股噴到你！",
      "沒人擋得住我的速度！",
      "全速前進，別廢話！",
      "盔甲戴好了，出發！",
    ],
    [Player.Red]: [
      "讓開讓開！購物車失控！",
      "斗篷飛起來就是帥！",
      "這速度連警察追不上！",
      "衝進去搶完再說！",
    ],
  },
  [UnitType.Catfish]: {
    [Player.Blue]: ["下水道是我家。","水裡我最硬！","你聞到什麼了嗎？","我吐的是藝術。"],
    [Player.Red]:  ["這條水溝是我的！","臭？你才臭！","誰敢攔我的水？","水底的事少管閒事。"],
  },
  [UnitType.Snake]: {
    [Player.Blue]: ["噓……別亂動。","我這一圈，沒人進得來。","你的膽子呢？","怕了吧，慢慢怕。"],
    [Player.Red]:  ["這塊地我罩的。","你再靠近試試？","嘶……識相就閃開。","沒有我點頭誰都別動。"],
  },
  [UnitType.Pigeon]: {
    [Player.Blue]: ["從天而降！","看我投彈！","哦哦哦～～～","飛得高打得準！"],
    [Player.Red]:  ["哈哈哈俯衝攻擊！","地形？什麼地形？","誰都擋不住我！","轟炸開始！"],
  },
  [UnitType.Cockroach]: {
    [Player.Blue]: ["打不死我的！","哈！又躲過了！","我已經死過一百次了。","核爆都沒用！"],
    [Player.Red]:  ["嘿嘿沒打到！","我永遠不會死！","再來！再來！","你打得到算我輸！"],
  },
  [UnitType.Crow]: {
    [Player.Blue]: ["閃亮的東西都是我的。","又多了一枚金幣。","財富就是力量！","哈哈哈哈哈！"],
    [Player.Red]:  ["拿到啦！","這個也要！那個也要！","再給我一枚！","Bling bling！"],
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
function UnitPortrait({ unit, tiles }: {
  unit: Unit | null;
  tiles: ReturnType<typeof useGame>["state"]["tiles"];
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

  const imgSrc = getUnitImg(unit.type, unit.owner);
  const pColor = unit.owner === Player.Blue ? C.blue : C.red;
  const done   = unit.hasMoved && unit.hasAttacked;
  const quote  = getQuote(unit);

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
          background: done ? C.bg : `${C.accent}22`,
          color: done ? C.muted : C.accent,
          border: `1px solid ${done ? C.border : C.accent}66`,
          zIndex: 2,
        }}>
          {done ? "已行動" : "可行動"}
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
                [SpecialAbility.Aquatic]:   "#3b82f6",
                [SpecialAbility.Aerial]:    "#8b5cf6",
                [SpecialAbility.Intimidate]:"#ef4444",
                [SpecialAbility.Immortal]:  "#f59e0b",
                [SpecialAbility.Collector]: "#eab308",
              };
              const abilityIcon: Record<string, string> = {
                [SpecialAbility.Aquatic]:   "💧",
                [SpecialAbility.Aerial]:    "🕊",
                [SpecialAbility.Intimidate]:"⚠️",
                [SpecialAbility.Immortal]:  "💀",
                [SpecialAbility.Collector]: "🪙",
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
