// ============================================================
// lib/game/reducer.ts
// ============================================================
import { GameState, GameAction, Player, UnitStatus, SpecialAbility, TerrainType } from "@/types";
import { GAME_RULES, BASE_STATS, SPAWN_ZONES, drawSpecials } from "@/constants";
import { generateMap } from "./mapGen";
import { createUnit, canSummon, tryAttack, resetUnitsForNewTurn, getEffectiveDef } from "./units";
import { coordKey, hexDistance, hexNeighbors } from "@/lib/utils/hex";

export function createInitialState(): GameState {
  return {
    tiles:             generateMap(),
    units:             [],
    turn: {
      round: 1, currentPlayer: Player.Blue,
      ap: GAME_RULES.AP_PER_TURN, phase: "summon",
      summonedThisTurn: 0, attackPhaseStarted: false,
    },
    scores:            { [Player.Blue]: GAME_RULES.STARTING_SCORE, [Player.Red]: GAME_RULES.STARTING_SCORE },
    selectedUnitId:    null,
    highlightedCoords: [],
    winner:            null,
    phase:             "setup",
    pendingDamage:     {},
    availableSpecials: drawSpecials(),
    missEffect:        {},
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {

    case "RESHUFFLE_MAP":
      return { ...state, tiles: generateMap(), availableSpecials: drawSpecials() };

    case "CONFIRM_MAP":
      return { ...state, phase: "playing" };

    case "SELECT_UNIT":
      return { ...state, selectedUnitId: action.unitId, highlightedCoords: [] };

    case "CLEAR_MISS_EFFECT": {
      const { [action.unitId]: _r, ...rest } = state.missEffect;
      return { ...state, missEffect: rest };
    }

    // ── 召喚 ─────────────────────────────────────────────────
    case "SUMMON_UNIT": {
      const { unitType, coord } = action;
      const { turn, scores, units } = state;
      const player = turn.currentPlayer;
      const cost   = BASE_STATS[unitType].summonCost;

      const check = canSummon(unitType, player, units, turn.summonedThisTurn);
      if (!check.ok)             return state;
      if (scores[player] < cost) return state;
      if (turn.ap <= 0)          return state;

      // 特殊角色：必須是本局該方抽到的
      if (BASE_STATS[unitType].isSpecial) {
        const mySpecials = state.availableSpecials[player] ?? [];
        if (!mySpecials.includes(unitType)) return state;
      }

      const inZone   = SPAWN_ZONES[player].some(c => c.q === coord.q && c.r === coord.r);
      if (!inZone) return state;
      const occupied = units.some(u => u.position.q === coord.q && u.position.r === coord.r);
      if (occupied) return state;

      const newUnit = createUnit(unitType, player, coord);
      return {
        ...state,
        units:  [...units, newUnit],
        scores: { ...scores, [player]: scores[player] - cost },
        turn:   { ...turn, ap: turn.ap - 1, summonedThisTurn: turn.summonedThisTurn + 1 },
      };
    }

    // ── 移動 ─────────────────────────────────────────────────
    case "MOVE_UNIT": {
      const { unitId, coord } = action;
      const unit = state.units.find(u => u.id === unitId);
      if (!unit)                                      return state;
      if (unit.status === UnitStatus.Summoned)        return state;
      if (unit.hasMoved)                              return state;
      if (unit.owner !== state.turn.currentPlayer)    return state;
      if (state.turn.ap <= 0)                         return state;

      const isAerial = unit.specialAbilities.includes(SpecialAbility.Aerial);
      const blocked = state.units.some(u =>
        u.id !== unitId &&
        u.position.q === coord.q && u.position.r === coord.r &&
        (!isAerial || u.owner === unit.owner)
      );
      if (blocked) return state;

      const updatedUnits = state.units.map(u =>
        u.id === unitId ? { ...u, position: coord, status: UnitStatus.Moved, hasMoved: true } : u
      );
      const updatedTiles = state.tiles.map(t => {
        if (coordKey(t.coord) === coordKey(unit.position)) return { ...t, occupiedBy: undefined };
        if (coordKey(t.coord) === coordKey(coord))         return { ...t, occupiedBy: unitId };
        return t;
      });

      return {
        ...state,
        units: updatedUnits, tiles: updatedTiles,
        turn:  { ...state.turn, ap: state.turn.ap - 1 },
        selectedUnitId: null, highlightedCoords: [],
      };
    }

    // ── 攻擊 ─────────────────────────────────────────────────
    case "ATTACK": {
      const { attackerId, targetId } = action;
      const attacker = state.units.find(u => u.id === attackerId);
      const defender = state.units.find(u => u.id === targetId);
      if (!attacker || !defender)                      return state;
      if (attacker.hasAttacked)                        return state;
      if (attacker.owner !== state.turn.currentPlayer) return state;
      if (state.turn.ap <= 0)                          return state;

      const defenderTile = state.tiles.find(t => coordKey(t.coord) === coordKey(defender.position))!;
      const attackerTile = state.tiles.find(t => coordKey(t.coord) === coordKey(attacker.position))!;
      const dist         = hexDistance(attacker.position, defender.position);

      const legalCheck = tryAttack(attacker, defender, attackerTile, defenderTile, dist);
      if (!legalCheck.success) return state;

      // 威嚇：攻擊方週邊有地頭蛇 → 不能攻擊
      const isIntimidated = state.units.some(u =>
        u.owner !== attacker.owner &&
        u.specialAbilities.includes(SpecialAbility.Intimidate) &&
        hexDistance(u.position, attacker.position) <= 1
      );
      if (isIntimidated) return state;

      // 不死小強：80% miss
      if (defender.specialAbilities.includes(SpecialAbility.Immortal) && Math.random() < 0.8) {
        return {
          ...state,
          units: state.units.map(u =>
            u.id === attackerId ? { ...u, hasAttacked: true, status: UnitStatus.Attacked } : u
          ),
          missEffect: { ...state.missEffect, [targetId]: Date.now() },
          turn: { ...state.turn, ap: state.turn.ap - 1, attackPhaseStarted: true },
          selectedUnitId: null, highlightedCoords: [],
        };
      }

      const player = state.turn.currentPlayer;

      // 水中單位在水域額外 DEF+1
      const aquaticBonus =
        defender.specialAbilities.includes(SpecialAbility.Aquatic) &&
        defenderTile.terrain === TerrainType.Water ? 1 : 0;

      // 鼠修女 Blessing：週邊1格友方（同陣營）有修女 → 防禦方 DEF+2
      const blessingBonus = state.units.some(u =>
        u.owner === defender.owner &&
        u.id !== defender.id &&
        u.specialAbilities.includes(SpecialAbility.Blessing) &&
        hexDistance(u.position, defender.position) <= 1
      ) ? 2 : 0;

      // 看門狗 WildBark：防禦方週邊1格有敵方看門狗 → DEF÷2（無條件進位）
      const hasWildBark = state.units.some(u =>
        u.owner !== defender.owner &&
        u.specialAbilities.includes(SpecialAbility.WildBark) &&
        hexDistance(u.position, defender.position) <= 1
      );

      let effectiveDef = getEffectiveDef(defender, defenderTile.terrain) + aquaticBonus + blessingBonus;
      if (hasWildBark) effectiveDef = Math.ceil(effectiveDef / 2);

      const prevDmg     = state.pendingDamage[targetId] ?? 0;
      const newDmg      = prevDmg + attacker.currentAtk;
      const isDead      = newDmg >= effectiveDef;

      let updatedUnits = state.units.map(u =>
        u.id === attackerId ? { ...u, hasAttacked: true, status: UnitStatus.Attacked } : u
      );
      let updatedTiles  = state.tiles;
      let newScores     = state.scores;
      let newPendingDmg = { ...state.pendingDamage, [targetId]: newDmg };

      if (isDead) {
        updatedUnits  = updatedUnits.filter(u => u.id !== targetId);
        updatedTiles  = state.tiles.map(t =>
          coordKey(t.coord) === coordKey(defender.position) ? { ...t, occupiedBy: undefined } : t
        );
        newScores = { ...state.scores, [player]: state.scores[player] + GAME_RULES.KILL_SCORE };
        const { [targetId]: _dead, ...rest } = newPendingDmg;
        newPendingDmg = rest;
      }

      const winner = checkWinner(newScores, updatedUnits);
      return {
        ...state,
        units: updatedUnits, tiles: updatedTiles,
        scores: newScores, pendingDamage: newPendingDmg,
        turn: { ...state.turn, ap: state.turn.ap - 1, attackPhaseStarted: true },
        winner, phase: winner ? "ended" : state.phase,
        selectedUnitId: null, highlightedCoords: [],
      };
    }

    // ── 結束回合 ─────────────────────────────────────────────
    case "END_TURN": {
      const next = state.turn.currentPlayer === Player.Blue ? Player.Red : Player.Blue;
      const cur  = state.turn.currentPlayer;
      const enemy = next;

      const townScore = { ...state.scores };

      // 城鎮加分（當前行動方）
      state.tiles
        .filter(t => t.terrain === "town" && t.occupiedBy)
        .forEach(t => {
          const unit = state.units.find(u => u.id === t.occupiedBy);
          if (unit && unit.owner === cur) {
            townScore[unit.owner] += GAME_RULES.TOWN_SCORE_PER_TURN;
          }
        });

      // 搜集癖（烏鴉）+1
      state.units
        .filter(u => u.owner === cur && u.specialAbilities.includes(SpecialAbility.Collector))
        .forEach(() => { townScore[cur] += 1; });

      // 垃圾哲學家：在城鎮時額外 +2（兩次）
      state.units
        .filter(u => u.owner === cur && u.specialAbilities.includes(SpecialAbility.TownBonus))
        .forEach(u => {
          const onTown = state.tiles.some(
            t => t.terrain === "town" && t.coord.q === u.position.q && t.coord.r === u.position.r
          );
          if (onTown) {
            townScore[cur] += 2; // 兩次 +2 = +4，前端會觸發兩次彈出
          }
        });

      // 摸金（負鼠）：週邊1格有敵 → +1 己，-1 敵
      state.units
        .filter(u => u.owner === cur && u.specialAbilities.includes(SpecialAbility.Pickpocket))
        .forEach(u => {
          const hasNearbyEnemy = state.units.some(
            e => e.owner === enemy && hexDistance(e.position, u.position) <= 1
          );
          if (hasNearbyEnemy) {
            townScore[cur]   += 1;
            townScore[enemy]  = Math.max(0, townScore[enemy] - 1);
          }
        });

      const winner     = checkWinner(townScore, state.units);
      const freshUnits = resetUnitsForNewTurn(state.units);

      return {
        ...state,
        units: freshUnits, scores: townScore,
        pendingDamage: {}, missEffect: {},
        winner, phase: winner ? "ended" : state.phase,
        turn: {
          round:              next === Player.Blue ? state.turn.round + 1 : state.turn.round,
          currentPlayer:      next,
          ap:                 GAME_RULES.AP_PER_TURN,
          phase:              "summon",
          summonedThisTurn:   0,
          attackPhaseStarted: false,
        },
        selectedUnitId: null, highlightedCoords: [],
      };
    }

    case "LOAD_STATE":
      return { ...action.gameState };

    default:
      return state;
  }
}

function checkWinner(scores: Record<Player, number>, units: GameState["units"]): Player | null {
  if (scores[Player.Blue] >= GAME_RULES.WIN_SCORE) return Player.Blue;
  if (scores[Player.Red]  >= GAME_RULES.WIN_SCORE) return Player.Red;
  const minCost = Math.min(...Object.values(BASE_STATS).map(s => s.summonCost));
  for (const player of [Player.Blue, Player.Red] as Player[]) {
    const enemy = player === Player.Blue ? Player.Red : Player.Blue;
    if (units.filter(u => u.owner === enemy).length === 0 && scores[enemy] < minCost) return player;
  }
  return null;
}
