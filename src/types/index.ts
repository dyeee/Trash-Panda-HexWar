// ============================================================
// types/index.ts — 全域型別定義
// ============================================================

// ── 座標 ────────────────────────────────────────────────────
export interface HexCoord {
  q: number;
  r: number;
}

// ── 地形 ────────────────────────────────────────────────────
export enum TerrainType {
  Town     = "town",
  Plain    = "plain",
  Water    = "water",
  Forest   = "forest",
  Mountain = "mountain",
}

export interface HexTile {
  id: string;
  coord: HexCoord;
  terrain: TerrainType;
  isFixed: boolean;         // 城鎮固定，不參與洗牌
  occupiedBy?: string;      // Unit.id
}

// ── 兵種 ────────────────────────────────────────────────────
export enum UnitType {
  Warrior   = "warrior",
  Archer    = "archer",
  Cavalry   = "cavalry",
  // ── 特殊角色（舊） ──
  Catfish   = "catfish",    // 垃圾魚
  Snake     = "snake",      // 地頭蛇
  Pigeon    = "pigeon",     // 屎彈鴿
  Cockroach = "cockroach",  // 大強
  Crow      = "crow",       // 烏鴉
  // ── 特殊角色（新） ──
  Possum    = "possum",     // 負鼠
  Rat       = "rat",        // 鼠修女
  Rooster   = "rooster",    // 畫雞丸
  Worm      = "worm",       // 垃圾哲學家
  Chiwawa   = "chiwawa",    // 看門狗
  Cat       = "cat",        // 咪咪
  Frog      = "frog",       // 流浪蛙
}

/** 特殊能力標記 */
export enum SpecialAbility {
  Aquatic     = "aquatic",     // 水中單位
  Aerial      = "aerial",      // 空中單位
  Intimidate  = "intimidate",  // 威嚇：週邊敵方不得攻擊
  Immortal    = "immortal",    // 不死小強：80% miss
  Collector   = "collector",   // 搜集癖：每回合結束 +1
  // ── 新能力 ──
  Pickpocket  = "pickpocket",  // 摸金：回合結束，週邊有敵 +1/-1
  Blessing    = "blessing",    // 鼠修女：週邊友方 DEF+2
  NoAbility   = "none",        // 無特殊（畫雞丸）
  TownBonus   = "townbonus",   // 城鎮哲學：在城鎮回合結束額外+2（兩次）
  WildBark    = "wildbark",    // 野性吠叫：週邊敵方 DEF÷2
  ToyGun      = "toygun",      // 玩具槍：RNG3 但數值照算
}

export enum UnitStatus {
  Idle      = "idle",
  Moved     = "moved",
  Attacked  = "attacked",
  Exhausted = "exhausted",
  Summoned  = "summoned",   // 剛召喚，本回合不可行動
}

export enum Player {
  Blue = "blue",
  Red  = "red",
}

export interface UnitStats {
  atk: number;
  def: number;
  rom: number;
  rng: number;
  maxCount: number;
  summonCost: number;
  specialAbility?: SpecialAbility;   // 主要能力（向後相容）
  specialAbilities?: SpecialAbility[]; // 多重能力
  isSpecial?: boolean;
}

export interface Unit {
  id: string;
  type: UnitType;
  owner: Player;
  status: UnitStatus;
  position: HexCoord;
  baseStats: UnitStats;
  currentAtk: number;
  currentDef: number;
  accumulatedDamage: number;
  hasMoved: boolean;
  hasAttacked: boolean;
  specialAbility?: SpecialAbility;    // 主要能力（向後相容）
  specialAbilities: SpecialAbility[]; // 所有能力（含主要）
}

/** 快速判斷單位是否具有某能力 */
export function hasAbility(unit: Unit, ability: SpecialAbility): boolean {
  return unit.specialAbilities.includes(ability);
}

// ── 回合 ────────────────────────────────────────────────────
export type ActionPhase = "summon" | "move" | "attack" | "score";

export interface TurnState {
  round: number;
  currentPlayer: Player;
  ap: number;               // 剩餘 AP（最多 4）
  phase: ActionPhase;
  summonedThisTurn: number; // 本回合已召喚數（最多 2）
  /** 本回合是否已有棋子攻擊過（一旦為 true，所有棋子不可再移動） */
  attackPhaseStarted: boolean;
}

// ── 遊戲整體狀態 ────────────────────────────────────────────
export interface GameState {
  tiles: HexTile[];
  units: Unit[];
  turn: TurnState;
  scores: Record<Player, number>;
  selectedUnitId: string | null;
  highlightedCoords: HexCoord[];
  winner: Player | null;
  phase: "setup" | "playing" | "ended";
  /** 累積傷害：key = unitId，value = 本回合已承受的總攻擊力 */
  pendingDamage: Record<string, number>;
  /** 本局各方可用的特殊角色（各抽 2 隻，每次 reshuffle 重抽） */
  availableSpecials: Record<string, UnitType[]>;
  /** miss 特效：key = unitId，value = timestamp（顯示 Miss! 文字） */
  missEffect: Record<string, number>;
}

// ── Canvas 渲染設定 ──────────────────────────────────────────
export interface CanvasConfig {
  hexSize: number;          // 六角格半徑（px）
  offsetX: number;          // 畫布 X 偏移
  offsetY: number;          // 畫布 Y 偏移
  animationSpeed: number;   // 1 = 正常，2 = 快
}

// ── 積分彈出動畫 ─────────────────────────────────────────────
export interface ScorePopup {
  id: string;
  amount: number;       // +1 / +2 等
  owner: Player;
  coord: HexCoord;      // 從哪個格子飄出
  createdAt: number;    // Date.now()，用於動畫計時
}

// ── 事件 ────────────────────────────────────────────────────
export type GameAction =
  | { type: "SUMMON_UNIT";       unitType: UnitType; coord: HexCoord }
  | { type: "MOVE_UNIT";         unitId: string;     coord: HexCoord }
  | { type: "ATTACK";            attackerId: string; targetId: string }
  | { type: "END_TURN" }
  | { type: "SELECT_UNIT";       unitId: string | null }
  | { type: "RESHUFFLE_MAP" }
  | { type: "CONFIRM_MAP" }
  | { type: "CLEAR_MISS_EFFECT"; unitId: string };
