"use client";
// ============================================================
// components/game/OnlineGameBoard.tsx
// 連線對戰版 GameBoard：用 useOnlineGame 替換 useGame
// ============================================================
import { useState, useCallback, useRef, useEffect } from "react";
import { useOnlineGame } from "@/hooks/useOnlineGame";
import HexCanvas, { HexCanvasHandle } from "@/components/canvas/HexCanvas";
import { triggerAttackFlash } from "@/lib/game/canvasRenderer";
import { hexDistance } from "@/lib/utils/hex";
import { UnitType, Player, HexCoord, Unit, SpecialAbility, TerrainType, UnitStatus } from "@/types";
import {
  BASE_STATS, UNIT_VISUAL, GAME_RULES, TERRAIN_EFFECTS,
  TERRAIN_VISUAL, SPAWN_ZONES, SPECIAL_ABILITY_DESC,
} from "@/constants";
import type { Room } from "@/lib/online/roomTypes";

// ── 配色（與 GameBoard 相同）────────────────────────────────
const C = {
  bg:      "#2A3830", panel:   "#324038", header:  "#243028",
  border:  "#4A6458", accent:  "#C8F542", accentD: "#A3CC1E",
  blue:    "#5DB8FF", red:     "#FF5B5B", text:    "#E8F0E0",
  muted:   "#7A9488", card:    "#3A4E44", sep:     "#3E5248",
};

interface Props {
  roomId:       string;
  mySide:       Player;
  myName:       string;
  opponentName: string;
  initialRoom:  Room;
}

// 圖片 map（特殊角色用 string，普通兵種用雙方各自的 URL）
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
  const e = UNIT_IMG[type];
  return typeof e === "string" ? e : (e?.[owner] ?? "");
}

// ── 角色對白 ─────────────────────────────────────────────────
const UNIT_QUOTES: Record<string, Record<Player, string[]>> = {
  [UnitType.Warrior]: {
    [Player.Blue]: ["別擋路，骨頭很貴的！","靠近一步你試試！","我站這就是為了打架。","有膽就衝過來！","臭鼬幫不歡迎外人！","這條垃圾場我守了三年！"],
    [Player.Red]:  ["不要搶我的垃圾！","這條街是我的地盤！","你剛才看我什麼眼神？","魚骨頭也是我的！","浣熊幫天下無敵！","你知道我今天有多餓嗎？！"],
  },
  [UnitType.Archer]: {
    [Player.Blue]: ["安靜……我在瞄準。","毒霧範圍很廣，小心點。","射程夠遠，你逃不掉。","嘿嘿，吃我這一罐！","從這裡噴到那裡，正中目標。","聞到了嗎？那是我的攻擊。"],
    [Player.Red]:  ["誰偷了我的魚罐頭！","老子連狙擊都懂！","遠遠地就能幹掉你！","這一罐送你免費的。","浣熊也會遠程！吃驚嗎？","垃圾桶旁邊練出來的準度！"],
  },
  [UnitType.Cavalry]: {
    [Player.Blue]: ["衝啊！屁股噴到你！","沒人擋得住我的速度！","全速前進，別廢話！","盔甲戴好了，出發！","臭鼬騎兵！聽起來就帥！","快跑！我比你想像的快！"],
    [Player.Red]:  ["讓開讓開！購物車失控！","斗篷飛起來就是帥！","這速度連警察追不上！","衝進去搶完再說！","浣熊的腿比你以為的還長！","嗚嗚嗚！搶了就跑！"],
  },
  [UnitType.Catfish]: {
    [Player.Blue]: ["下水道是我家。","水裡我最硬！","你聞到什麼了嗎？","我吐的是藝術。","污水？那是我的浴缸。","沒有我，下水道誰管？"],
    [Player.Red]:  ["這條水溝是我的！","臭？你才臭！","誰敢攔我的水？","水底的事少管閒事。","浣熊也愛水！","嘎！竟然跟我搶水域！"],
  },
  [UnitType.Snake]: {
    [Player.Blue]: ["噓……別亂動。","我這一圈，沒人進得來。","你的膽子呢？","怕了吧，慢慢怕。","靠近我試試，我讓你動彈不得。","嘶嘶嘶……滾開。"],
    [Player.Red]:  ["這塊地我罩的。","你再靠近試試？","嘶……識相就閃開。","沒有我點頭誰都別動。","我盤踞在此，你要怎樣？","想過來？先看我臉色。"],
  },
  [UnitType.Pigeon]: {
    [Player.Blue]: ["從天而降！","看我投彈！","哦哦哦～～～","飛得高打得準！","地形？從空中看都一樣！","呱！（這是鴿子的聲音嗎？）"],
    [Player.Red]:  ["哈哈哈俯衝攻擊！","地形？什麼地形？","誰都擋不住我！","轟炸開始！","垃圾場的制空權是我的！","翱翔在垃圾堆上方，真爽！"],
  },
  [UnitType.Cockroach]: {
    [Player.Blue]: ["打不死我的！","哈！又躲過了！","我已經死過一百次了。","核爆都沒用！","你的攻擊？不好意思，沒感覺。","強哥從來不認輸！"],
    [Player.Red]:  ["嘿嘿沒打到！","我永遠不會死！","再來！再來！","你打得到算我輸！","浣熊幫的不死先鋒！","我存在了三億年，怕你？"],
  },
  [UnitType.Crow]: {
    [Player.Blue]: ["閃亮的東西都是我的。","又多了一枚金幣。","財富就是力量！","哈哈哈哈哈！","從天而降再撿一枚！","哥飛得高，看得遠，賺得多。"],
    [Player.Red]:  ["拿到啦！","這個也要！那個也要！","再給我一枚！","Bling bling！","勉強施捨你一枚！","每回合都是收穫！"],
  },
  [UnitType.Possum]: {
    [Player.Blue]: ["到手！到手！","你的錢是我的錢。","看到敵人就知道——到手。","我只是借過來而已。","靠近我就是給我送錢！","摸！金！到！手！"],
    [Player.Red]:  ["借錢要還，誰還要借？！","嘿嘿，順走了。","你再靠近，我就再拿一次。","摸了就走，溜了。","浣熊幫的財務大臣！","鄰居嘛，借個一分不過分吧？"],
  },
  [UnitType.Rat]: {
    [Player.Blue]: ["願主保佑你……的DEF。","阿門，臭臭們加油！","我用禱告守護你。","上帝說：+2 DEF。","在垃圾堆裡也要有信仰！","祝福！防禦力上升！"],
    [Player.Red]:  ["讓我為你祈禱。","信仰使我們強大！","願主保護我們。","阿門阿門阿門！","浣熊幫也有神職人員的！","打架前先禱告，這很重要。"],
  },
  [UnitType.Rooster]: {
    [Player.Blue]: ["還有人敢上嗎？","屁股大了不起？","就這點ATK？","哥只是來散步的。","ATK7！我只是不想動！","你看我眼神就知道快跑。"],
    [Player.Red]:  ["我就站這，怎樣？","來打我啊！","ATK7 DEF7，你呢？","沒廢話，開幹。","浣熊幫最強打手！","我一個頂你三個！"],
  },
  [UnitType.Worm]: {
    [Player.Blue]: ["世界是垃圾……但城鎮是我的。","哲學嘛，就是垃圾堆中的黃金。","存在即是收費。","這塊地，我罩。","我的ATK是0，但我的智慧無限。","哲學家從不出手，只等收益。"],
    [Player.Red]:  ["The world is trash，但分數不是。","待在城鎮什麼都不用做。","哲♂學","哲學家的智慧：佔地。","浣熊幫的精神領袖。","我連攻擊都懶，但我最賺。"],
  },
  [UnitType.Chiwawa]: {
    [Player.Blue]: ["汪汪汪！！！！","你敢靠近？！","嗯？！！嗯？！！","吠爆你！","我小我兇！防禦減半！","汪汪汪汪汪汪汪！！"],
    [Player.Red]:  ["靠過來試試！","汪！汪！汪汪汪！","破防了嗎？嘿！","我很小但我很兇！","浣熊幫的噪音武器！","你的盾牌？被我吠碎了！"],
  },
  [UnitType.Cat]: {
    [Player.Blue]: ["噠噠噠噠——","射程三格，怕了嗎？","你在哪？我看得見！","嗖——中了！","瘦不代表弱！看這準度！","我的食物，我用槍保護！"],
    [Player.Red]:  ["這是我的！誰搶我打誰！","噠！噠！噠！噠！","遠遠地保護我的垃圾！","只是BB彈，但很爽！","浣熊幫最遠的射手！"],
  },
  [UnitType.Frog]: {
    [Player.Blue]: ["聽說這裡有吃的……","垃圾堆？跟平常吃的沒兩樣。","塊逃～！","我只是路過的，順便幫個忙。","水裡水外都能混的蛙！","HELP！ 我只是來領便當的..."],
    [Player.Red]:  ["呱——算了，打就打。","呱！沒想到是這種垃圾堆。","既然都來了就幫浣熊幫吧。","流浪蛙不挑食，打架也不挑。","便當到了嗎？","真香！這裡的垃圾堆比我想像的好吃！"],
  },
};

function getQuote(unit: Unit): string {
  const pool = UNIT_QUOTES[unit.type]?.[unit.owner];
  if (!pool) return "";
  const idx = unit.id.charCodeAt(unit.id.length - 1) % pool.length;
  return pool[idx];
}

export default function OnlineGameBoard({ roomId, mySide, myName, opponentName, initialRoom }: Props) {
  const game = useOnlineGame({ roomId, mySide, myName, opponentName, initialRoom });
  const { state, highlightedCoords, isMyTurn, syncing, syncError, endTurn,
          selectUnit, summonUnit, handleTileClick, reshuffle, confirmMap } = game;
  const { turn, scores, winner, phase, units, selectedUnitId, tiles } = state;

  const canvasRef     = useRef<HexCanvasHandle>(null);
  const [pendingSummon, setPendingSummon]   = useState<UnitType | null>(null);
  const [mobileInfo,    setMobileInfo]      = useState<Unit | null>(null);
  const [panelOpen,     setPanelOpen]       = useState(false);
  const [isMobile,      setIsMobile]        = useState(false);
  const [log, setLog] = useState("");

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (isMyTurn) setLog(`輪到你了（${mySide === Player.Blue ? "藍" : "紅"}方）`);
    else setLog(`等待 ${opponentName} 行動…`);
  }, [isMyTurn, mySide, opponentName]);

  const isPlaying   = phase === "playing";
  const isSetup     = phase === "setup";
  const blueName    = mySide === Player.Blue ? myName : opponentName;
  const redName     = mySide === Player.Red  ? myName : opponentName;
  const selectedUnit = units.find(u => u.id === selectedUnitId) ?? null;

  const spawnHL: HexCoord[] = pendingSummon
    ? SPAWN_ZONES[turn.currentPlayer].filter(c => !units.some(u => u.position.q === c.q && u.position.r === c.r))
    : [];
  const allHL = pendingSummon ? spawnHL : highlightedCoords;

  const handleSummonSelect = useCallback((type: UnitType) => {
    if (!isMyTurn || !isPlaying) return;
    const stats   = BASE_STATS[type];
    const onField = units.filter(u => u.owner === mySide && u.type === type).length;
    if (scores[mySide] < stats.summonCost) { setLog(`積分不足（需 ${stats.summonCost}pt）`); return; }
    if (onField >= stats.maxCount) { setLog(`${UNIT_VISUAL[type].label} 已達上限`); return; }
    setPendingSummon(p => p === type ? null : type);
    selectUnit(null);
  }, [isMyTurn, isPlaying, units, scores, mySide, selectUnit]);

  const handleCanvasClick = useCallback((coord: HexCoord) => {
    if (!isMyTurn) return;
    if (pendingSummon) {
      const inZone   = SPAWN_ZONES[mySide].some(c => c.q === coord.q && c.r === coord.r);
      if (!inZone) { setLog("請在己方召喚區放置"); return; }
      if (units.some(u => u.position.q === coord.q && u.position.r === coord.r)) { setLog("此格已有棋子"); return; }
      summonUnit(pendingSummon, coord);
      setPendingSummon(null);
      return;
    }

    // +1 彈出邏輯
    const selUnit     = units.find(u => u.id === selectedUnitId);
    const clickedUnit = units.find(u => u.position.q === coord.q && u.position.r === coord.r);
    if (selUnit && clickedUnit && clickedUnit.owner !== selUnit.owner && !selUnit.hasAttacked) {
      triggerAttackFlash(selUnit.id);
      const myTile  = tiles.find(t => t.coord.q === selUnit.position.q && t.coord.r === selUnit.position.r);
      const isAerial = selUnit.specialAbilities?.includes(SpecialAbility.Aerial);
      let rng = selUnit.baseStats.rng;
      if (!isAerial && myTile) {
        const eff = TERRAIN_EFFECTS[myTile.terrain];
        if (eff.meleeOnly) rng = 1;
        if (selUnit.specialAbilities?.includes(SpecialAbility.Aquatic) && myTile.terrain !== TerrainType.Water) rng = 0;
        if (!selUnit.specialAbilities?.includes(SpecialAbility.Aquatic) && myTile.terrain === TerrainType.Water) rng = 0;
        if (myTile.terrain === TerrainType.Mountain && selUnit.type === UnitType.Cavalry) rng = 0;
      }
      if (hexDistance(selUnit.position, coord) <= rng && rng > 0) {
        const defTile     = tiles.find(t => t.coord.q === coord.q && t.coord.r === coord.r);
        const isImmortal  = clickedUnit.specialAbilities?.includes(SpecialAbility.Immortal) ?? false;
        const defBonus    = defTile ? (TERRAIN_EFFECTS[defTile.terrain]?.defBonus ?? 0) : 0;
        const aquaBonus   = (clickedUnit.specialAbilities?.includes(SpecialAbility.Aquatic) && defTile?.terrain === TerrainType.Water) ? 1 : 0;
        const blessBonus  = units.some(u => u.owner === clickedUnit.owner && u.id !== clickedUnit.id &&
          u.specialAbilities?.includes(SpecialAbility.Blessing) && hexDistance(u.position, clickedUnit.position) <= 1) ? 2 : 0;
        const hasWildBark = units.some(u => u.owner !== clickedUnit.owner &&
          u.specialAbilities?.includes(SpecialAbility.WildBark) && hexDistance(u.position, clickedUnit.position) <= 1);
        let effDef = (BASE_STATS[clickedUnit.type]?.def ?? 0) + defBonus + aquaBonus + blessBonus;
        if (hasWildBark) effDef = Math.ceil(effDef / 2);
        const prevDmg = state.pendingDamage?.[clickedUnit.id] ?? 0;
        if (!isImmortal && prevDmg + selUnit.currentAtk >= effDef) {
          setTimeout(() => canvasRef.current?._addPopup?.(GAME_RULES.KILL_SCORE, selUnit.owner, clickedUnit.position), 150);
        }
      }
    }

    handleTileClick(coord);
    setLog("點擊己方棋子選取，或點擊高亮格移動 / 攻擊");
  }, [isMyTurn, pendingSummon, mySide, units, selectedUnitId, tiles, state, summonUnit, handleTileClick]);

  const handleEndTurn = useCallback(async () => {
    if (!isMyTurn || !!winner) return;

    // 城鎮 / 特殊能力彈出動畫
    const cur   = mySide;
    const enemy = cur === Player.Blue ? Player.Red : Player.Blue;
    tiles.filter(t => t.terrain === "town" && t.occupiedBy).forEach(t => {
      const occ = units.find(u => u.id === t.occupiedBy);
      if (occ && occ.owner === cur && !occ.specialAbilities.includes(SpecialAbility.TownBonus))
        setTimeout(() => canvasRef.current?._addPopup?.(GAME_RULES.TOWN_SCORE_PER_TURN, occ.owner, t.coord), 100);
    });
    units.filter(u => u.owner === cur && u.specialAbilities.includes(SpecialAbility.Collector))
      .forEach(u => setTimeout(() => canvasRef.current?._addPopup?.(1, u.owner, u.position), 150));
    units.filter(u => u.owner === cur && u.specialAbilities.includes(SpecialAbility.TownBonus))
      .forEach(u => {
        if (tiles.some(t => t.terrain === "town" && t.coord.q === u.position.q && t.coord.r === u.position.r)) {
          setTimeout(() => canvasRef.current?._addPopup?.(2, u.owner, u.position), 100);
          setTimeout(() => canvasRef.current?._addPopup?.(2, u.owner, u.position), 400);
        }
      });
    units.filter(u => u.owner === cur && u.specialAbilities.includes(SpecialAbility.Pickpocket))
      .forEach(u => {
        if (units.some(e => e.owner === enemy && hexDistance(e.position, u.position) <= 1))
          setTimeout(() => canvasRef.current?._addPopup?.(1, u.owner, u.position), 300);
      });

    setPendingSummon(null);
    setLog("同步中…");
    await endTurn();
    setLog(isMyTurn ? "已送出，等待對手" : "");
  }, [isMyTurn, winner, mySide, tiles, units, endTurn]);

  // ── 回合等待遮罩 ─────────────────────────────────────────
  const WaitOverlay = () => !isMyTurn && isPlaying ? (
    <div style={{
      position: "absolute", inset: 0, zIndex: 15,
      background: "rgba(21,26,23,0.55)", backdropFilter: "blur(2px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      pointerEvents: "none",
    }}>
      <div style={{
        background: C.card, border: `1.5px solid ${C.border}`,
        borderRadius: 14, padding: "16px 28px", textAlign: "center",
        boxShadow: "0 4px 32px rgba(0,0,0,0.4)",
      }}>
        <div style={{ fontSize: "1.6rem", marginBottom: 4 }}>⏳</div>
        <div style={{ fontWeight: 700, color: C.text }}>{opponentName} 行動中…</div>
        <div style={{ fontSize: "0.75rem", color: C.muted, marginTop: 4 }}>等待對手結束回合</div>
      </div>
    </div>
  ) : null;

  // ── 狀態橫幅 ─────────────────────────────────────────────
  const StatusBanner = () => (
    <div style={{
      position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
      zIndex: 16, pointerEvents: "none",
      display: "flex", gap: 8, alignItems: "center",
    }}>
      {syncing && (
        <div style={{
          background: `${C.accent}22`, border: `1px solid ${C.accent}66`,
          borderRadius: 8, padding: "4px 12px",
          fontSize: "0.75rem", color: C.accent, fontWeight: 700,
        }}>⟳ 同步中…</div>
      )}
      {syncError && (
        <div style={{
          background: `${C.red}22`, border: `1px solid ${C.red}66`,
          borderRadius: 8, padding: "4px 12px",
          fontSize: "0.75rem", color: C.red, fontWeight: 700,
        }}>{syncError}</div>
      )}
    </div>
  );

  // ── 召喚按鈕列表 ─────────────────────────────────────────
  const SummonList = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {([UnitType.Warrior, UnitType.Archer, UnitType.Cavalry] as UnitType[]).map(type => {
        const stats   = BASE_STATS[type];
        const onField = units.filter(u => u.owner === mySide && u.type === type).length;
        const disabled = !isMyTurn || scores[mySide] < stats.summonCost || onField >= stats.maxCount;
        const sel      = pendingSummon === type;
        return (
          <button key={type} onClick={() => handleSummonSelect(type)} disabled={disabled} style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "7px 12px", borderRadius: 10, fontFamily: "inherit",
            border: `1.5px solid ${sel ? C.accent : C.border}`,
            background: sel ? `${C.accent}20` : C.card,
            color: C.text, fontWeight: 700, fontSize: "0.85rem",
            cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.38 : 1,
          }}>
            <span>{UNIT_VISUAL[type].label}</span>
            <span style={{ fontSize: "0.7rem", color: C.accent, fontWeight: 800 }}>−{stats.summonCost}pt</span>
          </button>
        );
      })}
      {(state.availableSpecials[mySide] ?? []).map(type => {
        const stats   = BASE_STATS[type];
        const vis     = UNIT_VISUAL[type];
        const onField = units.filter(u => u.owner === mySide && u.type === type).length;
        const disabled = !isMyTurn || scores[mySide] < stats.summonCost || onField >= stats.maxCount;
        const sel      = pendingSummon === type;
        return (
          <button key={type} onClick={() => handleSummonSelect(type)} disabled={disabled} style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "7px 12px", borderRadius: 10, fontFamily: "inherit",
            border: `1.5px solid ${sel ? vis.color : C.border}`,
            background: sel ? `${vis.color}20` : C.card,
            color: C.text, fontWeight: 700, fontSize: "0.85rem",
            cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.38 : 1,
          }}>
            <span style={{ color: vis.color }}>{vis.label}</span>
            <span style={{ fontSize: "0.62rem", color: vis.color, background: `${vis.color}22`,
              padding: "1px 6px", borderRadius: 5, border: `1px solid ${vis.color}44` }}>特殊</span>
          </button>
        );
      })}
    </div>
  );

  const myColor  = mySide === Player.Blue ? C.blue : C.red;

  // ── 共用 Canvas 區塊 ─────────────────────────────────────
  const CanvasArea = () => (
    <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#243028" }}>
      <HexCanvas ref={canvasRef} state={state} highlights={allHL}
        onTileClick={handleCanvasClick}
        onUnitInfo={u => setMobileInfo(u)} />
      <StatusBanner />
      <WaitOverlay />
      {/* 地圖開局遮罩 */}
      {isSetup && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(21,26,23,0.9)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 16,
            padding: "24px 20px", textAlign: "center", maxWidth: 400, width: "90vw" }}>
            <h2 style={{ color: C.accent, fontSize: "1.2rem", fontWeight: 900, margin: "0 0 8px" }}>🗺 戰場佈置</h2>
            <p style={{ color: C.muted, fontSize: "0.8rem", margin: "0 0 16px" }}>城鎮固定・其他地形隨機</p>
            {isMyTurn ? (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={reshuffle} style={{
                  flex: 1, padding: "10px", borderRadius: 10,
                  border: `1.5px solid ${C.border}`, background: "transparent",
                  color: C.muted, fontFamily: "inherit", cursor: "pointer", fontSize: "0.85rem",
                }}>↺ 重新抽</button>
                <button onClick={confirmMap} style={{
                  flex: 2, padding: "10px", borderRadius: 10, border: "none",
                  background: C.accent, color: C.bg,
                  fontFamily: "inherit", fontWeight: 900, cursor: "pointer", fontSize: "0.9rem",
                }}>確認開局 →</button>
              </div>
            ) : (
              <div style={{ color: C.muted, fontSize: "0.85rem" }}>等待 {opponentName} 確認地圖…</div>
            )}
          </div>
        </div>
      )}
      {/* 勝利遮罩 */}
      {winner && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(21,26,23,0.9)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 16,
            padding: "28px 24px", textAlign: "center" }}>
            <div style={{ fontSize: "3rem" }}>🏆</div>
            <h2 style={{ color: winner === Player.Blue ? C.blue : C.red, fontSize: "1.4rem", fontWeight: 900, margin: "8px 0" }}>
              {winner === mySide ? "🎉 你贏了！" : `${opponentName} 勝利`}
            </h2>
            <div style={{ color: C.muted, fontSize: "0.85rem", marginBottom: 16 }}>
              {blueName} {scores[Player.Blue]}pt vs {redName} {scores[Player.Red]}pt
            </div>
            <a href="/" style={{ color: C.accent, fontWeight: 700 }}>← 回首頁</a>
          </div>
        </div>
      )}
      {/* 手機單位資訊卡 */}
      {isMobile && mobileInfo && (
        <MobileInfoCard unit={mobileInfo} state={state} onClose={() => setMobileInfo(null)} />
      )}
    </div>
  );

  // ── 手機版 ───────────────────────────────────────────────
  if (isMobile) return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh",
      background: C.bg, fontFamily: "'Noto Sans TC',sans-serif", color: C.text, overflow: "hidden" }}>
      <header style={{ height: 48, flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 10px",
        background: C.header, borderBottom: `1.5px solid ${C.border}` }}>
        <ScoreChip name={blueName} score={scores[Player.Blue]} color={C.blue}
          active={turn.currentPlayer === Player.Blue} small />
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: "0.65rem", color: C.muted }}>R{turn.round}</span>
          {Array.from({ length: GAME_RULES.AP_PER_TURN }, (_, i) => (
            <div key={i} style={{ width: 7, height: 7, borderRadius: "50%",
              background: i < turn.ap ? C.accent : "#2E3E36",
              border: `1.5px solid ${i < turn.ap ? C.accentD : "#3A4E44"}` }} />
          ))}
          <div style={{
            fontSize: "0.65rem", padding: "2px 8px", borderRadius: 99,
            border: `1px solid ${myColor}55`, background: `${myColor}15`, color: myColor,
          }}>
            {isMyTurn ? "你的回合" : "等待…"}
          </div>
        </div>
        <ScoreChip name={redName} score={scores[Player.Red]} color={C.red}
          active={turn.currentPlayer === Player.Red} small reverse />
      </header>
      <CanvasArea />
      <div style={{ background: C.panel, borderTop: `1.5px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, padding: "8px 10px", alignItems: "center" }}>
          <button onClick={() => { setPendingSummon(null); selectUnit(null); }}
            style={{ ...btnGhost, padding: "7px 12px", fontSize: "0.78rem" }}
            disabled={!isMyTurn}>✕</button>
          <button onClick={handleEndTurn} disabled={!isMyTurn || !!winner || syncing}
            style={{ ...btnPrimary, flex: 1, opacity: (!isMyTurn || !!winner) ? 0.35 : 1 }}>
            {syncing ? "同步…" : "結束回合 →"}
          </button>
          {isPlaying && isMyTurn && (
            <button onClick={() => setPanelOpen(o => !o)} style={{
              padding: "7px 12px", borderRadius: 10, fontFamily: "inherit",
              border: `1.5px solid ${panelOpen ? C.accent : C.border}`,
              background: panelOpen ? `${C.accent}22` : C.card,
              color: panelOpen ? C.accent : C.muted, cursor: "pointer", fontSize: "0.78rem",
            }}>⚔️{panelOpen ? "▼" : "▲"}</button>
          )}
        </div>
        <div style={{ padding: "0 10px 6px", fontSize: "0.7rem", color: C.muted,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log}</div>
        {isPlaying && panelOpen && isMyTurn && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px", maxHeight: "38dvh", overflow: "auto" }}>
            <SummonList />
          </div>
        )}
      </div>
    </div>
  );

  // ── 桌機版 ───────────────────────────────────────────────
  return (
    <div style={{ display: "grid", gridTemplateRows: "58px 1fr 56px", height: "100vh",
      background: C.bg, fontFamily: "'Noto Sans TC',sans-serif", color: C.text, overflow: "hidden" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", background: C.header, borderBottom: `1.5px solid ${C.border}`, gap: 12 }}>
        <ScoreChip name={blueName} score={scores[Player.Blue]} color={C.blue}
          active={turn.currentPlayer === Player.Blue} />
        <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, justifyContent: "center" }}>
          <span style={{ fontSize: "0.75rem", color: C.muted, background: C.card, borderRadius: 6,
            padding: "2px 8px", border: `1px solid ${C.border}` }}>R{turn.round}</span>
          <div style={{ display: "flex", gap: 5 }}>
            {Array.from({ length: GAME_RULES.AP_PER_TURN }, (_, i) => (
              <div key={i} style={{ width: 11, height: 11, borderRadius: "50%",
                background: i < turn.ap ? C.accent : "#2E3E36",
                border: `2px solid ${i < turn.ap ? C.accentD : "#3A4E44"}` }} />
            ))}
          </div>
          <span style={{
            fontSize: "0.85rem", fontWeight: 700,
            padding: "3px 14px", borderRadius: 999, border: `1.5px solid ${myColor}55`,
            background: `${myColor}15`, color: myColor,
          }}>
            {isMyTurn ? "你的回合" : `${opponentName} 行動中…`}
          </span>
        </div>
        <ScoreChip name={redName} score={scores[Player.Red]} color={C.red}
          active={turn.currentPlayer === Player.Red} reverse />
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", overflow: "hidden" }}>
        <CanvasArea />
        <aside style={{ background: "#324038", borderLeft: `1.5px solid ${C.border}`,
          padding: "14px 12px", overflow: "hidden", display: "flex", flexDirection: "column", gap: 10 }}>
          <UnitPortrait unit={selectedUnit} state={state} />
          {isPlaying && (
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase",
                letterSpacing: "0.12em", color: C.muted, paddingBottom: 4, borderBottom: `1px solid ${C.sep}`,
                marginBottom: 8 }}>
                召喚兵種
              </div>
              <SummonList />
            </div>
          )}
          {syncError && (
            <div style={{ background: `${C.red}22`, border: `1px solid ${C.red}55`,
              borderRadius: 8, padding: "8px 10px", fontSize: "0.78rem", color: C.red, flexShrink: 0 }}>
              ⚠️ {syncError}
            </div>
          )}
          <div style={{ fontSize: "0.75rem", color: C.muted, marginTop: "auto", paddingTop: 8,
            borderTop: `1px solid ${C.sep}`, overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>
            {log}
          </div>
        </aside>
      </div>

      <footer style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 20px",
        background: C.header, borderTop: `1.5px solid ${C.border}` }}>
        <button onClick={() => { setPendingSummon(null); selectUnit(null); }}
          disabled={!isMyTurn} style={btnGhost}>✕ 取消</button>
        <button onClick={handleEndTurn} disabled={!isMyTurn || !!winner || syncing}
          style={{ ...btnPrimary, opacity: (!isMyTurn || !!winner) ? 0.35 : 1 }}>
          {syncing ? "⟳ 同步中…" : "結束回合 →"}
        </button>
        <span style={{ marginLeft: "auto", fontSize: "0.78rem", color: C.muted,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{log}</span>
      </footer>
    </div>
  );
}

// ── UnitPortrait ──────────────────────────────────────────────
function UnitPortrait({ unit, state }: { unit: Unit | null; state: any }) {
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

  const canMove = !unit.hasMoved && !state.turn.attackPhaseStarted && unit.status !== UnitStatus.Summoned;
  const myTile  = state.tiles?.find((t: any) => t.coord.q === unit.position.q && t.coord.r === unit.position.r);

  let canAttack = !unit.hasAttacked;
  if (canAttack) {
    const intimidated = state.units?.some((u: any) =>
      u.owner !== unit.owner &&
      u.specialAbilities?.includes(SpecialAbility.Intimidate) &&
      hexDistance(u.position, unit.position) <= 1
    );
    if (intimidated) canAttack = false;
    if (canAttack && myTile) {
      const isAquatic = unit.specialAbilities?.includes(SpecialAbility.Aquatic);
      const isAerial  = unit.specialAbilities?.includes(SpecialAbility.Aerial);
      if (!isAerial) {
        if (isAquatic && myTile.terrain !== TerrainType.Water) canAttack = false;
        else if (!isAquatic && myTile.terrain === TerrainType.Water) canAttack = false;
        if (myTile.terrain === TerrainType.Mountain && unit.type === UnitType.Cavalry) canAttack = false;
      }
    }
  }

  const canAct    = canMove || canAttack;
  const statusStr = done ? "已行動" : canAct ? "可行動" : "不可動";
  const statusBg  = done ? C.bg     : canAct ? `${C.accent}22`  : `${C.red}22`;
  const statusCol = done ? C.muted  : canAct ? C.accent          : C.red;
  const statusBd  = done ? C.border : canAct ? `${C.accent}66`   : `${C.red}66`;

  const abilityColor: Record<string, string> = {
    [SpecialAbility.Aquatic]:"#3b82f6",[SpecialAbility.Aerial]:"#8b5cf6",
    [SpecialAbility.Intimidate]:"#ef4444",[SpecialAbility.Immortal]:"#f59e0b",
    [SpecialAbility.Collector]:"#eab308",[SpecialAbility.Pickpocket]:"#10b981",
    [SpecialAbility.Blessing]:"#f0abfc",[SpecialAbility.NoAbility]:"#6b7280",
    [SpecialAbility.TownBonus]:"#a78bfa",[SpecialAbility.WildBark]:"#fb923c",
    [SpecialAbility.ToyGun]:"#60a5fa",
  };
  const abilityIcon: Record<string, string> = {
    [SpecialAbility.Aquatic]:"💧",[SpecialAbility.Aerial]:"🕊",
    [SpecialAbility.Intimidate]:"⚠️",[SpecialAbility.Immortal]:"💀",
    [SpecialAbility.Collector]:"🪙",[SpecialAbility.Pickpocket]:"🤏",
    [SpecialAbility.Blessing]:"✝️",[SpecialAbility.NoAbility]:"💪",
    [SpecialAbility.TownBonus]:"🗑",[SpecialAbility.WildBark]:"🐕",
    [SpecialAbility.ToyGun]:"🔫",
  };

  return (
    <div style={{ flex: 1, minHeight: 0, position: "relative" }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}>
      <div style={{
        height: "100%",
        background: `radial-gradient(ellipse at 50% 90%, ${pColor}30 0%, ${C.card} 60%)`,
        borderRadius: 16, border: `1.5px solid ${pColor}44`,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        position: "relative", overflow: "hidden",
      }}>
        <img src={imgSrc} alt={UNIT_VISUAL[unit.type].label} style={{
          maxHeight: "100%", width: "auto",
          objectFit: "contain", objectPosition: "bottom center",
          filter: `drop-shadow(0 6px 20px ${pColor}99)`,
          opacity: done ? 0.5 : 1, transition: "opacity 0.3s", marginBottom: -8,
        }} />
        {/* 狀態 badge */}
        <div style={{ position: "absolute", top: 10, left: 10,
          fontSize: "0.66rem", fontWeight: 700, padding: "2px 10px", borderRadius: 999,
          background: statusBg, color: statusCol, border: `1px solid ${statusBd}`, zIndex: 2 }}>
          {statusStr}
        </div>
        {/* 玩家方 badge */}
        <div style={{ position: "absolute", top: 10, right: 10,
          fontSize: "0.66rem", fontWeight: 700, padding: "2px 10px", borderRadius: 999,
          background: `${pColor}22`, color: pColor, border: `1px solid ${pColor}55`, zIndex: 2 }}>
          {unit.owner === Player.Blue ? "藍方" : "紅方"}
        </div>
        {/* 底部名稱漸層 */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "24px 14px 12px",
          background: `linear-gradient(transparent, ${C.card}ee)`,
          borderRadius: "0 0 14px 14px", textAlign: "center", zIndex: 2 }}>
          <span style={{ fontWeight: 800, fontSize: "1rem", color: pColor }}>
            {UNIT_VISUAL[unit.type].label}
          </span>
        </div>
        {/* Hover 對白泡泡 */}
        {hovering && quote && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "16px 14px",
            background: `${C.card}D8`, backdropFilter: "blur(4px)",
            borderRadius: 14, zIndex: 10, pointerEvents: "none",
          }}>
            <div style={{ background: "#FFFFFF", borderRadius: 14, padding: "10px 16px",
              maxWidth: "90%", position: "relative", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#1a1a1a",
                lineHeight: 1.5, display: "block", textAlign: "center" }}>{quote}</span>
              <div style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)",
                width: 0, height: 0, borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent", borderTop: "10px solid #FFFFFF" }} />
            </div>
            <div style={{ marginTop: 18, fontSize: "0.72rem", color: pColor, fontWeight: 700,
              letterSpacing: "0.06em", background: `${pColor}22`,
              padding: "3px 12px", borderRadius: 999, border: `1px solid ${pColor}44` }}>
              {unit.owner === Player.Blue ? "藍方" : "紅方"} {UNIT_VISUAL[unit.type].label}
            </div>
            {unit.specialAbilities?.length > 0 && unit.specialAbilities.map((ability: string) => {
              const col = abilityColor[ability] ?? C.accent;
              const ico = abilityIcon[ability] ?? "✦";
              return (
                <div key={ability} style={{ marginTop: 8, maxWidth: "92%",
                  background: `${col}18`, border: `1px solid ${col}44`,
                  borderRadius: 10, padding: "6px 12px",
                  display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <span style={{ fontSize: "0.85rem", flexShrink: 0, marginTop: 1 }}>{ico}</span>
                  <span style={{ fontSize: "0.78rem", color: col, fontWeight: 600,
                    lineHeight: 1.45, textAlign: "left" }}>
                    {SPECIAL_ABILITY_DESC[ability as keyof typeof SPECIAL_ABILITY_DESC]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 共用 sub-components ───────────────────────────────────
function ScoreChip({ name, score, color, active, reverse = false, small = false }: {
  name: string; score: number; color: string; active: boolean; reverse?: boolean; small?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", flexDirection: reverse ? "row-reverse" : "row",
      gap: small ? 4 : 6, minWidth: small ? 80 : 110,
      padding: small ? "3px 8px" : "4px 14px", borderRadius: 999,
      border: `1.5px solid ${active ? color : C.border}`,
      background: active ? `${color}18` : "transparent", transition: "all 0.3s" }}>
      <span style={{ width: small ? 6 : 8, height: small ? 6 : 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: small ? "0.68rem" : "0.78rem", color: C.muted,
        maxWidth: small ? 50 : 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      <span style={{ fontWeight: 900, fontSize: small ? "0.9rem" : "1.1rem", color }}>{score}</span>
    </div>
  );
}

function MobileInfoCard({ unit, state, onClose }: {
  unit: Unit; state: any; onClose: () => void;
}) {
  const pColor = unit.owner === Player.Blue ? C.blue : C.red;
  const vis    = UNIT_VISUAL[unit.type];
  const stats  = BASE_STATS[unit.type];

  const myTile = state.tiles?.find((t: any) => t.coord.q === unit.position.q && t.coord.r === unit.position.r);
  const defBonus = myTile ? ((TERRAIN_EFFECTS as any)[myTile.terrain]?.defBonus ?? 0) : 0;
  const aquaBonus = unit.specialAbilities?.includes(SpecialAbility.Aquatic) && myTile?.terrain === "water" ? 1 : 0;
  const blessBonus = state.units?.some((u: any) =>
    u.owner === unit.owner && u.id !== unit.id &&
    u.specialAbilities?.includes(SpecialAbility.Blessing) &&
    hexDistance(u.position, unit.position) <= 1) ? 2 : 0;
  const hasWildBark = state.units?.some((u: any) =>
    u.owner !== unit.owner && u.specialAbilities?.includes(SpecialAbility.WildBark) &&
    hexDistance(u.position, unit.position) <= 1);
  let effDef = stats.def + defBonus + aquaBonus + blessBonus;
  if (hasWildBark) effDef = Math.ceil(effDef / 2);

  const icons: Record<string, string> = {
    aquatic:"💧",aerial:"🕊",intimidate:"⚠️",immortal:"💀",collector:"🪙",
    pickpocket:"🤏",blessing:"✝️",none:"💪",townbonus:"🗑",wildbark:"🐕",toygun:"🔫",
  };

  return (
    <div style={{ position: "absolute", bottom: 80, left: 10, zIndex: 30,
      background: `${C.panel}F2`, backdropFilter: "blur(10px)",
      border: `1.5px solid ${pColor}66`, borderRadius: 14, padding: "10px 12px",
      minWidth: 200, maxWidth: 240, boxShadow: `0 4px 24px rgba(0,0,0,0.5)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {vis.img && <img src={vis.img} alt={vis.label} style={{ width: 36, height: 36, objectFit: "contain" }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: "0.88rem", color: pColor }}>{vis.label}</div>
          <div style={{ fontSize: "0.65rem", color: C.muted }}>{unit.owner === Player.Blue ? "藍方" : "紅方"}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "1rem" }}>✕</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, marginBottom: 6 }}>
        {[{k:"ATK",v:stats.atk},{k:"DEF",v:effDef},{k:"ROM",v:stats.rom},{k:"RNG",v:stats.rng}].map(({k,v}) => (
          <div key={k} style={{ background: C.bg, borderRadius: 8, padding: "4px 2px",
            textAlign: "center", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: "0.55rem", color: C.muted }}>{k}</div>
            <div style={{ fontWeight: 900, fontSize: "0.9rem", color: C.accent }}>{v}</div>
          </div>
        ))}
      </div>
      {unit.specialAbilities?.length > 0 && unit.specialAbilities.map((ab: string) => (
        <div key={ab} style={{ fontSize: "0.62rem", color: C.muted, display: "flex", gap: 4, marginTop: 3 }}>
          <span>{icons[ab] ?? "✦"}</span>
          <span>{SPECIAL_ABILITY_DESC[ab as keyof typeof SPECIAL_ABILITY_DESC]}</span>
        </div>
      ))}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 10, border: "none",
  background: C.accent, color: C.bg, fontFamily: "inherit",
  fontWeight: 900, fontSize: "0.88rem", cursor: "pointer",
  transition: "all 0.15s", flexShrink: 0,
};
const btnGhost: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`,
  background: "transparent", color: C.muted, fontFamily: "inherit",
  fontSize: "0.85rem", cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
};
