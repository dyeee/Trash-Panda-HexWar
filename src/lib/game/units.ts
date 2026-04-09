// ============================================================
// lib/game/units.ts — 兵種工廠 & 輔助函式
//
// 規則：
//   1. 剛召喚的棋子本回合不得移動（status = Summoned）
//   2. 山區 / 水域：移動只能 1 格，且路徑上遇到就停
//   3. 可跨越我軍，不得跨越敵軍（BFS 尋路）
//   4. 每棋子只能移動和攻擊各一次（hasMoved / hasAttacked）
//   5. 攻擊力 >= 防禦力才算成功，否則不扣步數
// ============================================================
import {
  Unit, UnitType, UnitStatus, Player,
  HexCoord, HexTile, TerrainType, SpecialAbility,
} from "@/types";
import { BASE_STATS, TERRAIN_EFFECTS, TERRAIN_COUNTS, GAME_RULES } from "@/constants";
import { hexNeighbors, coordKey } from "@/lib/utils/hex";

let _counter = 0;

// ── 建立新兵種 ────────────────────────────────────────────────
export function createUnit(type: UnitType, owner: Player, position: HexCoord): Unit {
  const stats = BASE_STATS[type];
  _counter++;
  return {
    id:                `${type}_${owner}_${_counter}`,
    type, owner,
    status:            UnitStatus.Summoned,
    position,
    baseStats:         stats,
    currentAtk:        stats.atk,
    currentDef:        stats.def,
    accumulatedDamage: 0,
    hasMoved:          false,
    hasAttacked:       false,
    specialAbility:    stats.specialAbility,
    specialAbilities:  stats.specialAbilities ?? (stats.specialAbility ? [stats.specialAbility] : []),
  };
}

// ── 地形輔助 ──────────────────────────────────────────────────
export function getEffectiveDef(unit: Unit, terrain: TerrainType): number {
  return unit.baseStats.def + TERRAIN_EFFECTS[terrain].defBonus;
}

export function getEffectiveRng(unit: Unit, terrain: TerrainType): number {
  const override = TERRAIN_EFFECTS[terrain].rngOverride;
  return override !== undefined ? override : unit.baseStats.rng;
}

/** 地形是否限制移動為 1 格（山區 / 水域） */
function isRestrictedTerrain(terrain: TerrainType): boolean {
  return terrain === TerrainType.Mountain || terrain === TerrainType.Water;
}

// ── BFS 可移動格子計算 ────────────────────────────────────────
/**
 * 規則：
 *   - 剛召喚（Summoned）本回合不可移動
 *   - 山區 / 水域：進入後立即停止（消耗完移動力）
 *   - 可跨越己方棋子（中途跳過），不可跨越敵方棋子（路徑被封）
 *   - 目標格不可有任何棋子
 */
export function calcMoveRange(
  unit: Unit,
  tiles: HexTile[],
  allUnits: Unit[],
): HexCoord[] {
  // 剛召喚本回合不得移動
  if (unit.status === UnitStatus.Summoned) return [];
  if (unit.hasMoved || unit.hasAttacked)   return [];

  const tileMap     = new Map(tiles.map(t => [coordKey(t.coord), t]));
  const friendKeys  = new Set(
    allUnits.filter(u => u.owner === unit.owner && u.id !== unit.id)
            .map(u => coordKey(u.position))
  );
  const enemyKeys   = new Set(
    allUnits.filter(u => u.owner !== unit.owner)
            .map(u => coordKey(u.position))
  );

  const ability = unit.specialAbility;
  const isAerial  = unit.specialAbilities.includes(SpecialAbility.Aerial);
  const isAquatic = unit.specialAbilities.includes(SpecialAbility.Aquatic);

  // 空中單位：全地圖自由移動（ROM 格），無視地形與敵軍
  if (isAerial) {
    const reachable: Set<string> = new Set();
    const startKey = coordKey(unit.position);
    type Node = { coord: HexCoord; stepsLeft: number };
    const queue: Node[] = [{ coord: unit.position, stepsLeft: unit.baseStats.rom }];
    const visited = new Map<string, number>([[startKey, unit.baseStats.rom]]);
    while (queue.length > 0) {
      const { coord, stepsLeft } = queue.shift()!;
      if (stepsLeft <= 0) continue;
      for (const nb of hexNeighbors(coord)) {
        const key = coordKey(nb);
        if (!tileMap.has(key)) continue;
        const next = stepsLeft - 1;
        if ((visited.get(key) ?? -1) >= next) continue;
        visited.set(key, next);
        if (!friendKeys.has(key)) reachable.add(key); // 可穿越敵軍，不可停在友軍
        if (next > 0) queue.push({ coord: nb, stepsLeft: next });
      }
    }
    reachable.delete(startKey);
    return Array.from(reachable).map(k => {
      const [q, r] = k.split(",").map(Number);
      return { q, r };
    });
  }

  // 水中單位：水域 ROM = baseStats.rom，陸地只能移 1 格
  // 從水域出發：正常；從陸地出發：只能走 1 格
  const startTile = tileMap.get(coordKey(unit.position));
  const startOnWater = startTile?.terrain === TerrainType.Water;
  let maxRom: number;
  if (isAquatic) {
    maxRom = startOnWater ? unit.baseStats.rom : 1;
  } else {
    // 普通單位：在限制地形只能走 1 格
    const startRestricted = startTile ? isRestrictedTerrain(startTile.terrain) : false;
    maxRom = startRestricted ? 1 : unit.baseStats.rom;
  }

  type Node = { coord: HexCoord; stepsLeft: number };
  const queue: Node[]          = [{ coord: unit.position, stepsLeft: maxRom }];
  const visited                = new Map<string, number>();
  const reachable: Set<string> = new Set();
  visited.set(coordKey(unit.position), maxRom);

  while (queue.length > 0) {
    const { coord, stepsLeft } = queue.shift()!;
    if (stepsLeft <= 0) continue;

    const currentKey  = coordKey(coord);
    const currentTile = tileMap.get(currentKey);

    if (isAquatic) {
      // 水中單位在非起點的陸地格：不能繼續展開（只能停在水域）
      const onWater = currentTile?.terrain === TerrainType.Water;
      if (currentKey !== coordKey(unit.position) && !onWater) continue;
    } else {
      // 普通單位：非起點的限制地形不再延伸
      if (currentKey !== coordKey(unit.position) && currentTile && isRestrictedTerrain(currentTile.terrain)) {
        continue;
      }
    }

    for (const nb of hexNeighbors(coord)) {
      const key  = coordKey(nb);
      const tile = tileMap.get(key);
      if (!tile) continue;

      if (enemyKeys.has(key)) continue; // 敵軍封路

      const canStop = !friendKeys.has(key);

      let nextSteps: number;
      if (isAquatic) {
        const nbOnWater = tile.terrain === TerrainType.Water;
        nextSteps = nbOnWater ? stepsLeft - 1 : 0; // 進陸地強制停止
      } else {
        const restrict = isRestrictedTerrain(tile.terrain);
        nextSteps = restrict ? 0 : stepsLeft - 1;
      }

      const prev = visited.get(key) ?? -1;
      if (nextSteps <= prev) continue;
      visited.set(key, nextSteps);

      if (canStop) reachable.add(key);
      if (nextSteps > 0) queue.push({ coord: nb, stepsLeft: nextSteps });
    }
  }

  // 排除起點
  reachable.delete(coordKey(unit.position));

  return Array.from(reachable).map(k => {
    const [q, r] = k.split(",").map(Number);
    return { q, r };
  });
}

// ── 攻擊相關 ──────────────────────────────────────────────────
/**
 * 判斷攻擊方能否從自身地形發動攻擊（地形限制，不含傷害判斷）
 *   - 攻擊方在水域 → 不能主動出擊
 *   - 攻擊方是騎兵且在山區 → 不能主動出擊
 *   - 攻擊方在森林 → 只能近戰（dist ≤ 1）
 */
export function tryAttack(
  attacker: Unit,
  defender: Unit,
  attackerTile: HexTile,
  defenderTile: HexTile,
  dist: number,
): { success: boolean; reason?: string } {
  const isAerial  = attacker.specialAbilities.includes(SpecialAbility.Aerial);
  const isAquatic = attacker.specialAbilities.includes(SpecialAbility.Aquatic);

  if (isAerial) return { success: true };

  if (isAquatic) {
    if (attackerTile.terrain !== TerrainType.Water) {
      return { success: false, reason: "垃圾魚在陸地不能攻擊" };
    }
    return { success: true };
  }

  // 普通單位依攻擊方地形
  const atkEffect = TERRAIN_EFFECTS[attackerTile.terrain];
  if (atkEffect.cannotAttack) return { success: false, reason: "水域中無法主動出擊" };
  if (atkEffect.blockedFor?.includes(attacker.type)) return { success: false, reason: "山區中騎兵無法主動出擊" };
  if (atkEffect.meleeOnly && dist > 1) return { success: false, reason: "森林中只能近戰" };

  return { success: true };
}

/** 判斷是否可選取 / 行動（未行動過） */
export function canActUnit(unit: Unit, currentPlayer: Player): boolean {
  if (unit.owner !== currentPlayer)          return false;
  if (unit.status === UnitStatus.Summoned)   return false;  // 剛召喚不可動
  return !unit.hasMoved || !unit.hasAttacked;
}

/** 回合結束：重置所有棋子狀態 */
export function resetUnitsForNewTurn(units: Unit[]): Unit[] {
  return units.map(u => ({
    ...u,
    status:            UnitStatus.Idle,
    accumulatedDamage: 0,
    hasMoved:          false,
    hasAttacked:       false,
  }));
}

/** 驗證召喚條件 */
export function canSummon(
  type: UnitType,
  owner: Player,
  units: Unit[],
  summonedThisTurn: number,
): { ok: boolean; reason?: string } {
  if (summonedThisTurn >= GAME_RULES.MAX_SUMMONS_PER_TURN)
    return { ok: false, reason: "本回合已召喚 2 隻" };
  const onField = units.filter(u => u.owner === owner && u.type === type).length;
  if (onField >= BASE_STATS[type].maxCount)
    return { ok: false, reason: `${type} 已達場上上限` };
  return { ok: true };
}

