// ============================================================
// lib/game/mapGen.ts — 地圖生成邏輯
// ============================================================
import { HexTile, TerrainType } from "@/types";
import { ALL_HEX_COORDS, FIXED_TOWN_COORDS, TERRAIN_COUNTS } from "@/constants";
import { shuffle, coordKey } from "@/lib/utils/hex";

export function generateMap(): HexTile[] {
  const fixedKeys = new Set(FIXED_TOWN_COORDS.map(coordKey));

  // 可隨機的格子（排除城鎮）並洗牌
  const randomCoords = shuffle(
    ALL_HEX_COORDS.filter(c => !fixedKeys.has(coordKey(c)))
  );

  // 建立地形牌組並洗牌
  const deck: TerrainType[] = shuffle([
    ...Array(TERRAIN_COUNTS[TerrainType.Plain]).fill(TerrainType.Plain),
    ...Array(TERRAIN_COUNTS[TerrainType.Forest]).fill(TerrainType.Forest),
    ...Array(TERRAIN_COUNTS[TerrainType.Water]).fill(TerrainType.Water),
    ...Array(TERRAIN_COUNTS[TerrainType.Mountain]).fill(TerrainType.Mountain),
  ]);

  const tiles: HexTile[] = [];

  // 固定城鎮
  FIXED_TOWN_COORDS.forEach((coord, i) => {
    tiles.push({ id: `town_${i}`, coord, terrain: TerrainType.Town, isFixed: true });
  });

  // 隨機地形
  randomCoords.forEach((coord, i) => {
    tiles.push({ id: `tile_${i}`, coord, terrain: deck[i], isFixed: false });
  });

  return tiles;
}
