// ============================================================
// hooks/useGame.ts
// ============================================================
import { useReducer, useCallback } from "react";
import { GameAction, HexCoord, UnitType, Player, UnitStatus, SpecialAbility, TerrainType } from "@/types";
import { gameReducer, createInitialState } from "@/lib/game/reducer";
import { hexDistance, coordKey, hexNeighbors } from "@/lib/utils/hex";
import { calcMoveRange } from "@/lib/game/units";
import { TERRAIN_EFFECTS } from "@/constants";

export function useGame() {
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);

  const reshuffle  = useCallback(() => dispatch({ type: "RESHUFFLE_MAP" }), []);
  const confirmMap = useCallback(() => dispatch({ type: "CONFIRM_MAP" }), []);
  const endTurn    = useCallback(() => dispatch({ type: "END_TURN" }), []);
  const selectUnit = useCallback((unitId: string | null) =>
    dispatch({ type: "SELECT_UNIT", unitId }), []);
  const summonUnit = useCallback((unitType: UnitType, coord: HexCoord) =>
    dispatch({ type: "SUMMON_UNIT", unitType, coord }), []);
  const moveUnit   = useCallback((unitId: string, coord: HexCoord) =>
    dispatch({ type: "MOVE_UNIT", unitId, coord }), []);
  const attack     = useCallback((attackerId: string, targetId: string) =>
    dispatch({ type: "ATTACK", attackerId, targetId }), []);

  // ── 格子點擊 ─────────────────────────────────────────────
  const handleTileClick = useCallback((coord: HexCoord) => {
    const { selectedUnitId, units, turn, tiles, phase } = state;
    if (phase !== "playing") return;

    const clickedUnit  = units.find(u => coordKey(u.position) === coordKey(coord));
    const selectedUnit = units.find(u => u.id === selectedUnitId);

    if (selectedUnit) {
      // 點擊敵方 → 攻擊
      if (clickedUnit && clickedUnit.owner !== selectedUnit.owner && !selectedUnit.hasAttacked) {
        const myTile   = tiles.find(t => coordKey(t.coord) === coordKey(selectedUnit.position));
        const myEffect = myTile ? TERRAIN_EFFECTS[myTile.terrain] : null;
        const isAerial = selectedUnit.specialAbilities.includes(SpecialAbility.Aerial);

        // 威嚇：週邊有地頭蛇 → 不能攻擊
        const isIntimidated = units.some(u =>
          u.owner !== selectedUnit.owner &&
          u.specialAbilities.includes(SpecialAbility.Intimidate) &&
          hexDistance(u.position, selectedUnit.position) <= 1
        );

        if (!isIntimidated) {
          let canAtk = true;
          if (!isAerial) {
            const isAquatic = selectedUnit.specialAbilities.includes(SpecialAbility.Aquatic);
            if (isAquatic && myTile?.terrain !== TerrainType.Water) canAtk = false;
            else if (!isAquatic) {
              if (myEffect?.cannotAttack) canAtk = false;
              if (myEffect?.blockedFor?.includes(selectedUnit.type)) canAtk = false;
            }
          }

          if (canAtk) {
            const dist = hexDistance(selectedUnit.position, coord);
            const isAquaticInWater = selectedUnit.specialAbilities.includes(SpecialAbility.Aquatic) &&
              myTile?.terrain === TerrainType.Water;
            const effectiveRng = isAerial
              ? selectedUnit.baseStats.rng
              : myEffect?.meleeOnly ? 1
              : isAquaticInWater ? selectedUnit.baseStats.rng
              : selectedUnit.baseStats.rng;

            if (dist <= effectiveRng) {
              attack(selectedUnit.id, clickedUnit.id);
              return;
            }
          }
        }
      }

      // 點擊空格 → 移動
      if (!clickedUnit && !selectedUnit.hasMoved &&
        !turn.attackPhaseStarted && selectedUnit.status !== UnitStatus.Summoned) {
        const moveRange = calcMoveRange(selectedUnit, tiles, units);
        if (moveRange.some(c => c.q === coord.q && c.r === coord.r)) {
          moveUnit(selectedUnit.id, coord);
          return;
        }
      }

      selectUnit(null);
      return;
    }

    if (clickedUnit && clickedUnit.owner === turn.currentPlayer) {
      selectUnit(clickedUnit.id);
    }
  }, [state, attack, moveUnit, selectUnit]);

  // ── 高亮格 ───────────────────────────────────────────────
  const getHighlightedCoords = useCallback((): HexCoord[] => {
    const { selectedUnitId, units, tiles, turn } = state;
    if (!selectedUnitId) return [];
    const unit = units.find(u => u.id === selectedUnitId);
    if (!unit) return [];

    const highlights: HexCoord[] = [];

    // 移動範圍
    if (!unit.hasMoved && !turn.attackPhaseStarted && unit.status !== UnitStatus.Summoned) {
      highlights.push(...calcMoveRange(unit, tiles, units));
    }

    // 攻擊範圍（考慮威嚇、空中、水中）
    if (!unit.hasAttacked) {
      const myTile   = tiles.find(t => coordKey(t.coord) === coordKey(unit.position));
      const myEffect = myTile ? TERRAIN_EFFECTS[myTile.terrain] : null;
      const isAerial  = unit.specialAbilities.includes(SpecialAbility.Aerial);
      const isAquatic = unit.specialAbilities.includes(SpecialAbility.Aquatic);

      const isIntimidated = units.some(u =>
        u.owner !== unit.owner &&
        u.specialAbilities.includes(SpecialAbility.Intimidate) &&
        hexDistance(u.position, unit.position) <= 1
      );

      if (!isIntimidated) {
        let canAtk = true;
        if (!isAerial) {
          if (isAquatic && myTile?.terrain !== TerrainType.Water) canAtk = false;
          else if (!isAquatic) {
            if (myEffect?.cannotAttack) canAtk = false;
            if (myEffect?.blockedFor?.includes(unit.type)) canAtk = false;
          }
        }

        if (canAtk) {
          const effectiveRng = myEffect?.meleeOnly && !isAerial ? 1 : unit.baseStats.rng;
          const attackable = units
            .filter(u => u.owner !== unit.owner)
            .filter(u => hexDistance(unit.position, u.position) <= effectiveRng)
            .map(u => u.position);
          highlights.push(...attackable);
        }
      }
    }

    return highlights;
  }, [state]);

  return {
    state,
    highlightedCoords: getHighlightedCoords(),
    reshuffle, confirmMap, endTurn,
    selectUnit, summonUnit, moveUnit, attack,
    handleTileClick,
  };
}
