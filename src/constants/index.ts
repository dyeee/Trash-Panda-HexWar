// ============================================================
// constants/index.ts — 遊戲常數
// ============================================================
import { TerrainType, UnitType, UnitStats, HexCoord, Player, SpecialAbility } from "@/types";

// ============================================================
// 地圖座標系說明（flat-top 六角格）
//
// 實體桌遊由左到右 A~G 共 7 欄，每欄張數：
//   A=4  B=5  C=4  D=5  E=4  F=5  G=4   共 31 格
//
// flat-top：六角格左右兩邊是平的，上下是尖的
// 欄（A-G）= q 軸（左右），以 D=0 為中心
// 列（1-N）= r 軸（上下），偶數欄(B D F)多一格且整體偏下半格
//
// A1 與 B1、B2 相鄰（B 欄比 A 欄多一格且向下突出半格）
//
// 轉換公式（flat-top axial）：
//   q = col_index - 3
//   r = row - 1 - floor(col_index / 2)
//   （偶數欄上方多出的那格 offset 補償）
// ============================================================

/** col 字母 → index */
const COL: Record<string, number> = { A:0, B:1, C:2, D:3, E:4, F:5, G:6 };

/** 實體座標（col 字母 + row 數字）→ axial {q, r} */
function toAxial(col: string, row: number): HexCoord {
  const c = COL[col];
  const q = c - 3;
  // 奇數欄（B D F, index=1,3,5）整體往上偏移 1，
  // 使得 A1 同時與 B1、B2 相鄰，符合實體桌遊的排列
  const oddShift = c % 2 === 1 ? -1 : 0;
  const r = row - 1 + oddShift - Math.floor(c / 2);
  return { q, r };
}

/** 每欄的列數 */
const COL_ROWS: Record<string, number> = { A:4, B:5, C:4, D:5, E:4, F:5, G:4 };

/** 全部 31 格 axial 座標（由實體地圖轉換） */
export const ALL_HEX_COORDS: HexCoord[] = Object.entries(COL_ROWS).flatMap(
  ([col, rows]) =>
    Array.from({ length: rows }, (_, i) => toAxial(col, i + 1))
);

/** 固定城鎮座標：C4、D3、E1 */
export const FIXED_TOWN_COORDS: HexCoord[] = [
  toAxial("C", 4),   // C4
  toAxial("D", 3),   // D3
  toAxial("E", 1),   // E1
];

/** Player1 召喚區：A1 A2 A3 A4（左側） */
export const SPAWN_ZONE_P1: HexCoord[] = [
  toAxial("A", 1),
  toAxial("A", 2),
  toAxial("A", 3),
  toAxial("A", 4),
];

/** Player2 召喚區：G1 G2 G3 G4（右側） */
export const SPAWN_ZONE_P2: HexCoord[] = [
  toAxial("G", 1),
  toAxial("G", 2),
  toAxial("G", 3),
  toAxial("G", 4),
];

/** 玩家的召喚區 map */
export const SPAWN_ZONES: Record<Player, HexCoord[]> = {
  [Player.Blue]: SPAWN_ZONE_P1,
  [Player.Red]:  SPAWN_ZONE_P2,
};

/** 隨機地形張數（28 格 = 31 - 3 城鎮）：10+6+8+4 = 28 ✓ */
export const TERRAIN_COUNTS: Record<Exclude<TerrainType, TerrainType.Town>, number> = {
  [TerrainType.Plain]:    10,
  [TerrainType.Forest]:    6,
  [TerrainType.Water]:     8,
  [TerrainType.Mountain]:  4,
};

// ── 地形效果 ─────────────────────────────────────────────────
export interface TerrainEffect {
  moveCost: number;
  defBonus: number;
  meleeOnly: boolean;
  cannotAttack: boolean;
  rngOverride?: number;
  blockedFor?: UnitType[];
}

export const TERRAIN_EFFECTS: Record<TerrainType, TerrainEffect> = {
  [TerrainType.Town]:     { moveCost: 1, defBonus: 1,  meleeOnly: false, cannotAttack: false },
  [TerrainType.Plain]:    { moveCost: 1, defBonus: 0,  meleeOnly: false, cannotAttack: false },
  [TerrainType.Water]:    { moveCost: 1, defBonus: 0,  meleeOnly: false, cannotAttack: true  },
  [TerrainType.Forest]:   { moveCost: 1, defBonus: 1,  meleeOnly: true,  cannotAttack: false, rngOverride: 1 },
  [TerrainType.Mountain]: { moveCost: 1, defBonus: 2,  meleeOnly: false, cannotAttack: false, blockedFor: [UnitType.Cavalry] },
};

// ── 地形視覺 ─────────────────────────────────────────────────
export const TERRAIN_VISUAL = {
  [TerrainType.Town]:     { label: "城鎮", emoji: "🏰", color: "#FF6B6B", bg: "#FFF0F0", border: "#FF6B6B" },
  [TerrainType.Plain]:    { label: "平原", emoji: "🌾", color: "#F5A623", bg: "#FFFBF0", border: "#F5A623" },
  [TerrainType.Forest]:   { label: "森林", emoji: "🌲", color: "#27AE60", bg: "#F0FFF4", border: "#27AE60" },
  [TerrainType.Water]:    { label: "水域", emoji: "💧", color: "#2980B9", bg: "#F0F8FF", border: "#2980B9" },
  [TerrainType.Mountain]: { label: "山區", emoji: "⛰️", color: "#8D6E63", bg: "#FDF5F0", border: "#8D6E63" },
} as const;

// ── 兵種屬性 ─────────────────────────────────────────────────
export const BASE_STATS: Record<UnitType, UnitStats> = {
  // 普通兵種
  [UnitType.Warrior]:   { atk: 3, def: 4, rom: 2, rng: 1, maxCount: 6, summonCost: 2 },
  [UnitType.Archer]:    { atk: 4, def: 2, rom: 2, rng: 2, maxCount: 4, summonCost: 3 },
  [UnitType.Cavalry]:   { atk: 4, def: 3, rom: 3, rng: 1, maxCount: 2, summonCost: 3 },
  // 特殊角色（每局各抽 1 隻，每隻最多 1 隻，費用 5）
  [UnitType.Catfish]:   { atk: 4, def: 5, rom: 2, rng: 2, maxCount: 1, summonCost: 5,
                          specialAbility: SpecialAbility.Aquatic,
                          specialAbilities: [SpecialAbility.Aquatic],
                          isSpecial: true },
  [UnitType.Snake]:     { atk: 4, def: 4, rom: 2, rng: 1, maxCount: 1, summonCost: 5,
                          specialAbility: SpecialAbility.Intimidate,
                          specialAbilities: [SpecialAbility.Intimidate],
                          isSpecial: true },
  [UnitType.Pigeon]:    { atk: 4, def: 5, rom: 4, rng: 1, maxCount: 1, summonCost: 5,
                          specialAbility: SpecialAbility.Aerial,
                          specialAbilities: [SpecialAbility.Aerial],
                          isSpecial: true },
  [UnitType.Cockroach]: { atk: 3, def: 1, rom: 2, rng: 1, maxCount: 1, summonCost: 5,
                          specialAbility: SpecialAbility.Immortal,
                          specialAbilities: [SpecialAbility.Immortal],
                          isSpecial: true },
  [UnitType.Crow]:      { atk: 4, def: 5, rom: 2, rng: 1, maxCount: 1, summonCost: 5,
                          specialAbility: SpecialAbility.Collector,
                          specialAbilities: [SpecialAbility.Aerial, SpecialAbility.Collector],
                          isSpecial: true },
};

export const UNIT_VISUAL: Record<UnitType, { label: string; symbol: string; color: string; img?: string }> = {
  [UnitType.Warrior]:   { label: "戰士",    symbol: "△", color: "#4A90D9" },
  [UnitType.Archer]:    { label: "弓手",    symbol: "✕", color: "#9B59B6" },
  [UnitType.Cavalry]:   { label: "騎兵",    symbol: "✦", color: "#E67E22" },
  [UnitType.Catfish]:   { label: "垃圾魚",  symbol: "魚", color: "#5B9E8A", img: "/img/specials/catfish.png" },
  [UnitType.Snake]:     { label: "地頭蛇",  symbol: "蛇", color: "#7DB83A", img: "/img/specials/snake.png" },
  [UnitType.Pigeon]:    { label: "屎彈鴿",  symbol: "鴿", color: "#9B8ED4", img: "/img/specials/pigeon.png" },
  [UnitType.Cockroach]: { label: "大強",    symbol: "強", color: "#A0724A", img: "/img/specials/cockroach.png" },
  [UnitType.Crow]:      { label: "烏鴉",    symbol: "鴉", color: "#7A7A8C", img: "/img/specials/crow.png" },
};

/** 全部特殊角色 pool */
export const ALL_SPECIALS: UnitType[] = [
  UnitType.Catfish, UnitType.Snake, UnitType.Pigeon,
  UnitType.Cockroach, UnitType.Crow,
];

/** 各方各自從 pool 隨機抽 2 隻特殊角色（兩方可以相同） */
export function drawSpecials(): Record<string, UnitType[]> {
  const draw2 = (): UnitType[] => {
    const pool = [...ALL_SPECIALS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 2);
  };
  return {
    [Player.Blue]: draw2(),
    [Player.Red]:  draw2(),
  };
}

export const SPECIAL_ABILITY_DESC: Record<SpecialAbility, string> = {
  [SpecialAbility.Aquatic]:    "水中單位：水域可攻擊、移動2格、DEF+1；陸地只能移1格且不可攻擊",
  [SpecialAbility.Intimidate]: "威嚇：週邊1格內的敵方無法攻擊",
  [SpecialAbility.Aerial]:     "空中單位：無視地形、可穿越敵軍",
  [SpecialAbility.Immortal]:   "不死小強：受到攻擊時有 80% 機率 Miss",
  [SpecialAbility.Collector]:  "搜集癖：每回合結束 +1 分",
};

/** 取得一個兵種所有能力的說明（多能力用 / 分隔） */
export function getAbilitiesDesc(abilities: SpecialAbility[]): string {
  return abilities.map(a => SPECIAL_ABILITY_DESC[a]).join("\n");
}

// ── 遊戲規則 ─────────────────────────────────────────────────
export const GAME_RULES = {
  AP_PER_TURN:           4,
  MAX_SUMMONS_PER_TURN:  2,
  WIN_SCORE:            31,
  WIN_SCORE_ALT:        21,
  STARTING_SCORE:        5,
  SPECIAL_CARDS_START:   2,
  TOWN_SCORE_PER_TURN:   2,
  KILL_SCORE:            1,
} as const;

// ── 玩家視覺 ─────────────────────────────────────────────────
export const PLAYER_VISUAL: Record<Player, { label: string; color: string; light: string }> = {
  [Player.Blue]: { label: "藍方", color: "#2980B9", light: "#AED6F1" },
  [Player.Red]:  { label: "紅方", color: "#C0392B", light: "#F1948A" },
};

// ── Canvas 預設設定 ───────────────────────────────────────────
export const DEFAULT_CANVAS_CONFIG = {
  hexSize:        68,   // 放大貼齊邊界
  offsetX:        0,
  offsetY:        0,
  animationSpeed: 1,
} as const;
