// ============================================================
// lib/utils/hex.ts — 六角格數學工具
//
// 使用 flat-top（平頂朝上）六角格
// 地圖水平排列，欄由左到右，整體視覺效果為橫向
// ============================================================
import { HexCoord } from "@/types";

/** axial 座標轉像素（flat-top） */
export function hexToPixel(q: number, r: number, size: number, ox = 0, oy = 0) {
  const x = size * (3 / 2) * q + ox;
  const y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r) + oy;
  return { x, y };
}

/** 像素轉 axial 座標（flat-top） */
export function pixelToHex(px: number, py: number, size: number, ox = 0, oy = 0): HexCoord {
  const x = px - ox;
  const y = py - oy;
  const q = (2 / 3 * x) / size;
  const r = (-1 / 3 * x + Math.sqrt(3) / 3 * y) / size;
  return hexRound(q, r);
}

/** 四捨五入到最近的 hex */
export function hexRound(q: number, r: number): HexCoord {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds)        rr = -rq - rs;
  return { q: rq, r: rr };
}

/** 兩格之間的距離 */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

/** 取得半徑 N 內所有格子 */
export function hexRange(center: HexCoord, range: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let q = -range; q <= range; q++) {
    for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
      results.push({ q: center.q + q, r: center.r + r });
    }
  }
  return results;
}

/** 取得 6 個相鄰格子 */
export function hexNeighbors(coord: HexCoord): HexCoord[] {
  const dirs = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ];
  return dirs.map(d => ({ q: coord.q + d.q, r: coord.r + d.r }));
}

/** 六角形的 6 個頂點（flat-top，角度從 0° 開始） */
export function hexCorners(cx: number, cy: number, size: number): [number, number][] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i);   // flat-top: 0° 30° 60°...
    return [cx + size * Math.cos(angle), cy + size * Math.sin(angle)] as [number, number];
  });
}

/** 座標轉字串 key（用於 Map/Set） */
export function coordKey(c: HexCoord): string {
  return `${c.q},${c.r}`;
}

/** 比較兩座標是否相同 */
export function coordEqual(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

/** Fisher-Yates 洗牌 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
