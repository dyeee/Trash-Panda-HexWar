// ============================================================
// hooks/useOnlineGame.ts — 連線對戰狀態管理
// ============================================================
"use client";
import { useReducer, useCallback, useEffect, useRef, useState } from "react";
import { GameAction, HexCoord, UnitType, Player, UnitStatus, SpecialAbility, TerrainType } from "@/types";
import { gameReducer, createInitialState } from "@/lib/game/reducer";
import { hexDistance, coordKey } from "@/lib/utils/hex";
import { calcMoveRange } from "@/lib/game/units";
import { TERRAIN_EFFECTS } from "@/constants";
import { getRoom, endTurn as apiEndTurn } from "@/lib/online/roomClient";
import type { Room } from "@/lib/online/roomTypes";

interface UseOnlineGameOptions {
  roomId:     string;
  mySide:     Player;
  myName:     string;
  opponentName: string;
  initialRoom: Room;
}

export function useOnlineGame({
  roomId, mySide, myName, opponentName, initialRoom,
}: UseOnlineGameOptions) {
  const [state, dispatch] = useReducer(
    gameReducer,
    null,
    () => initialRoom.gameState ?? createInitialState(),
  );
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const [syncing,   setSyncing]   = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [room,      setRoom]      = useState<Room>(initialRoom);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const isMyTurn = state.turn.currentPlayer === mySide;

  // ── 輪詢對手的狀態 ───────────────────────────────────────
  const poll = useCallback(async () => {
    if (isMyTurn) return;
    try {
      const r = await getRoom(roomId);
      setRoom(prev => {
        if (r.updatedAt !== prev.updatedAt && r.gameState) {
          dispatch({ type: "LOAD_STATE", gameState: r.gameState });
        }
        return r;
      });
    } catch {
      // 靜默失敗
    }
  }, [roomId, isMyTurn]);

  useEffect(() => {
    if (state.phase === "ended") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    if (!isMyTurn) {
      pollRef.current = setInterval(poll, 2500);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isMyTurn, poll, state.phase]);

  // ── Dispatch 包裝（只有自己回合才能操作）──────────────────
  const safeDispatch = useCallback((action: GameAction) => {
    if (!isMyTurn && action.type !== "SELECT_UNIT") return;
    dispatch(action);
  }, [isMyTurn]);

  const reshuffle  = useCallback(() => safeDispatch({ type: "RESHUFFLE_MAP" }), [safeDispatch]);
  const confirmMap = useCallback(() => safeDispatch({ type: "CONFIRM_MAP" }), [safeDispatch]);
  const selectUnit = useCallback((unitId: string | null) =>
    dispatch({ type: "SELECT_UNIT", unitId }), []);
  const summonUnit = useCallback((unitType: UnitType, coord: HexCoord) =>
    safeDispatch({ type: "SUMMON_UNIT", unitType, coord }), [safeDispatch]);
  const moveUnit   = useCallback((unitId: string, coord: HexCoord) =>
    safeDispatch({ type: "MOVE_UNIT", unitId, coord }), [safeDispatch]);
  const attack     = useCallback((attackerId: string, targetId: string) =>
    safeDispatch({ type: "ATTACK", attackerId, targetId }), [safeDispatch]);

  // ── 結束回合：上傳狀態給對手 ─────────────────────────────
  const endTurn = useCallback(async () => {
    if (!isMyTurn) return;
    setSyncing(true);
    setSyncError(null);
    dispatch({ type: "END_TURN" });
    // 等 reducer 執行完，用 ref 取最新 state
    await new Promise(r => setTimeout(r, 80));
    try {
      await apiEndTurn(roomId, mySide, stateRef.current);
    } catch (err: any) {
      setSyncError(err.message ?? "同步失敗，請重試");
    } finally {
      setSyncing(false);
    }
  }, [isMyTurn, roomId, mySide]);

  // ── handleTileClick（同 useGame.ts 邏輯）────────────────
  const handleTileClick = useCallback((coord: HexCoord) => {
    if (!isMyTurn) return;
    const { selectedUnitId, units, turn, tiles, phase } = state;
    if (phase !== "playing") return;

    const clickedUnit  = units.find(u => coordKey(u.position) === coordKey(coord));
    const selectedUnit = units.find(u => u.id === selectedUnitId);

    if (selectedUnit) {
      if (clickedUnit && clickedUnit.owner !== selectedUnit.owner && !selectedUnit.hasAttacked) {
        const myTile   = tiles.find(t => coordKey(t.coord) === coordKey(selectedUnit.position));
        const myEffect = myTile ? TERRAIN_EFFECTS[myTile.terrain] : null;
        const isAerial = selectedUnit.specialAbilities?.includes(SpecialAbility.Aerial);
        const isIntimidated = units.some(u =>
          u.owner !== selectedUnit.owner &&
          u.specialAbilities?.includes(SpecialAbility.Intimidate) &&
          hexDistance(u.position, selectedUnit.position) <= 1
        );
        if (!isIntimidated) {
          let canAtk = true;
          if (!isAerial) {
            const isAquatic = selectedUnit.specialAbilities?.includes(SpecialAbility.Aquatic);
            if (isAquatic && myTile?.terrain !== TerrainType.Water) canAtk = false;
            else if (!isAquatic) {
              if (myEffect?.cannotAttack) canAtk = false;
              if (myEffect?.blockedFor?.includes(selectedUnit.type)) canAtk = false;
            }
          }
          if (canAtk) {
            const dist = hexDistance(selectedUnit.position, coord);
            const effectiveRng = myEffect?.meleeOnly && !isAerial ? 1 : selectedUnit.baseStats.rng;
            if (dist <= effectiveRng) {
              attack(selectedUnit.id, clickedUnit.id);
              return;
            }
          }
        }
      }

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

    if (clickedUnit && clickedUnit.owner === mySide) {
      selectUnit(clickedUnit.id);
    }
  }, [state, isMyTurn, mySide, attack, moveUnit, selectUnit]);

  // ── 高亮格 ───────────────────────────────────────────────
  const getHighlightedCoords = useCallback((): HexCoord[] => {
    if (!isMyTurn) return [];
    const { selectedUnitId, units, tiles, turn } = state;
    if (!selectedUnitId) return [];
    const unit = units.find(u => u.id === selectedUnitId);
    if (!unit) return [];

    const highlights: HexCoord[] = [];
    if (!unit.hasMoved && !turn.attackPhaseStarted && unit.status !== UnitStatus.Summoned) {
      highlights.push(...calcMoveRange(unit, tiles, units));
    }
    if (!unit.hasAttacked) {
      const myTile   = tiles.find(t => coordKey(t.coord) === coordKey(unit.position));
      const myEffect = myTile ? TERRAIN_EFFECTS[myTile.terrain] : null;
      const isAerial  = unit.specialAbilities?.includes(SpecialAbility.Aerial);
      const isAquatic = unit.specialAbilities?.includes(SpecialAbility.Aquatic);
      const isIntimidated = units.some(u =>
        u.owner !== unit.owner &&
        u.specialAbilities?.includes(SpecialAbility.Intimidate) &&
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
          highlights.push(...units
            .filter(u => u.owner !== unit.owner)
            .filter(u => hexDistance(unit.position, u.position) <= effectiveRng)
            .map(u => u.position));
        }
      }
    }
    return highlights;
  }, [state, isMyTurn]);

  return {
    state,
    highlightedCoords: getHighlightedCoords(),
    isMyTurn,
    syncing,
    syncError,
    room,
    myName,
    opponentName,
    mySide,
    reshuffle,
    confirmMap,
    endTurn,
    selectUnit,
    summonUnit,
    moveUnit,
    attack,
    handleTileClick,
  };
}
