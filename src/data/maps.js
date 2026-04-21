// Map definitions. Each map exposes:
//   - meta: id, name, description, worldWidth, worldHeight, maxSlots, minSlots
//   - generateTerrain(scene, terrainMap) -> { basePositions: [{x, y, side}, ...] }
//   - spawnContestedResources(scene) -> places center-contested resource nodes
//
// scene.spawnResourceLayoutAt is reused per-base (not map-specific).

import { TILE } from '../systems/TerrainMap.js';

export const MAPS = {
  three_way_classic: {
    id: 'three_way_classic',
    name: 'Three Kingdoms',
    description: '120° symmetric map. Classic 3-way FFA.',
    worldWidth: 9600,
    worldHeight: 5400,
    maxSlots: 3,
    minSlots: 2,
    sideNames: ['top', 'right', 'left'],

    generateTerrain(scene, tm) {
      const cx = Math.floor(tm.cols / 2);
      const cy = Math.floor(tm.rows / 2);
      const baseDistance = Math.min(cx, cy) * 0.8;

      const baseAngles = [
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 / 3,
        -Math.PI / 2 + Math.PI * 4 / 3,
      ];
      const baseTiles = baseAngles.map((a) => ({
        col: Math.round(cx + Math.cos(a) * baseDistance),
        row: Math.round(cy + Math.sin(a) * baseDistance),
      }));
      const basePositions = baseTiles.map((b, i) => ({
        x: b.col * tm.tileSize + tm.tileSize / 2,
        y: b.row * tm.tileSize + tm.tileSize / 2,
        side: this.sideNames[i],
      }));

      // Central lake
      tm.fillCircle(cx, cy, 5, TILE.WATER);

      // Rivers between adjacent base pairs
      const riverAngles = [
        (baseAngles[0] + baseAngles[1]) / 2,
        (baseAngles[1] + baseAngles[2]) / 2,
        (baseAngles[2] + baseAngles[0] + Math.PI * 2) / 2,
      ];
      for (const a of riverAngles) {
        for (let d = 5; d < baseDistance * 0.85; d += 1) {
          const perpOffset = Math.sin(d * 0.2) * 2;
          const rx = Math.round(cx + Math.cos(a) * d + Math.cos(a + Math.PI / 2) * perpOffset);
          const ry = Math.round(cy + Math.sin(a) * d + Math.sin(a + Math.PI / 2) * perpOffset);
          const perp = a + Math.PI / 2;
          for (let w = -1; w <= 1; w += 1) {
            tm.set(
              Math.round(rx + Math.cos(perp) * w),
              Math.round(ry + Math.sin(perp) * w),
              TILE.WATER
            );
          }
        }
      }

      // Bridges across each river
      const BRIDGE_LEN_TILES = 14;
      const BRIDGE_WID_TILES = 4;
      for (const a of riverAngles) {
        const bd = baseDistance * 0.5;
        const bx = cx + Math.cos(a) * bd;
        const by = cy + Math.sin(a) * bd;
        const perp = a + Math.PI / 2;
        for (let i = -6; i <= 6; i += 1) {
          const px = Math.round(bx + Math.cos(perp) * i);
          const py = Math.round(by + Math.sin(perp) * i);
          tm.fillCircle(px, py, 2, TILE.BRIDGE);
        }
        const wx = bx * tm.tileSize + tm.tileSize / 2;
        const wy = by * tm.tileSize + tm.tileSize / 2;
        tm.registerBridge(wx, wy, a, BRIDGE_LEN_TILES, BRIDGE_WID_TILES);
      }

      // Forests symmetric around base midpoints
      const sym3 = (relX, relY, radius, type) => {
        for (const a of baseAngles) {
          const rx = Math.round(cx + relX * Math.cos(a) - relY * Math.sin(a));
          const ry = Math.round(cy + relX * Math.sin(a) + relY * Math.cos(a));
          tm.fillCircle(rx, ry, radius, type);
        }
      };
      sym3(baseDistance * 0.6, baseDistance * 0.35, 4, TILE.FOREST);
      sym3(baseDistance * 0.6, -baseDistance * 0.35, 4, TILE.FOREST);

      // Bushes near bridges
      for (const a of riverAngles) {
        const bd = baseDistance * 0.5;
        const bx = Math.round(cx + Math.cos(a) * bd);
        const by = Math.round(cy + Math.sin(a) * bd);
        const perp = a + Math.PI / 2;
        tm.fillCircle(bx + Math.round(Math.cos(perp) * 6), by + Math.round(Math.sin(perp) * 6), 2, TILE.BUSH);
        tm.fillCircle(bx - Math.round(Math.cos(perp) * 6), by - Math.round(Math.sin(perp) * 6), 2, TILE.BUSH);
      }

      // Clear base areas
      for (const b of baseTiles) {
        tm.fillCircle(b.col, b.row, 12, TILE.GRASS);
      }

      return { basePositions };
    },

    spawnContestedResources(scene) {
      const cx = scene.worldWidth / 2;
      const cy = scene.worldHeight / 2;
      const contestedAngles = [Math.PI / 2, Math.PI / 2 + Math.PI * 2 / 3, Math.PI / 2 + Math.PI * 4 / 3];
      for (let i = 0; i < contestedAngles.length; i += 1) {
        const a = contestedAngles[i];
        const dist = 350;
        scene.spawnResourceNode(i === 0 ? 'gold' : 'food',
          cx + Math.cos(a) * dist,
          cy + Math.sin(a) * dist);
      }
    },
  },

  duel_river: {
    id: 'duel_river',
    name: 'River Duel',
    description: '1v1 across a central river. Smaller and faster.',
    worldWidth: 6400,
    worldHeight: 3600,
    maxSlots: 2,
    minSlots: 2,
    sideNames: ['left', 'right'],

    generateTerrain(scene, tm) {
      const cx = Math.floor(tm.cols / 2);
      const cy = Math.floor(tm.rows / 2);

      // Two bases on left/right with same y
      const baseDistance = Math.floor(tm.cols * 0.36);
      const baseTiles = [
        { col: cx - baseDistance, row: cy },
        { col: cx + baseDistance, row: cy },
      ];
      const basePositions = baseTiles.map((b, i) => ({
        x: b.col * tm.tileSize + tm.tileSize / 2,
        y: b.row * tm.tileSize + tm.tileSize / 2,
        side: this.sideNames[i],
      }));

      // Central vertical river
      const riverThickness = 2;
      for (let r = 0; r < tm.rows; r += 1) {
        const wobble = Math.round(Math.sin(r * 0.18) * 1.5);
        for (let dc = -riverThickness; dc <= riverThickness; dc += 1) {
          tm.set(cx + dc + wobble, r, TILE.WATER);
        }
      }

      // Two bridges (top third + bottom third)
      const bridgeRows = [Math.floor(tm.rows * 0.30), Math.floor(tm.rows * 0.70)];
      for (const br of bridgeRows) {
        for (let i = -4; i <= 4; i += 1) {
          tm.fillCircle(cx + i, br, 2, TILE.BRIDGE);
        }
        const wx = cx * tm.tileSize + tm.tileSize / 2;
        const wy = br * tm.tileSize + tm.tileSize / 2;
        tm.registerBridge(wx, wy, Math.PI / 2, 12, 4);
      }

      // Forest patches between bases (away from rivers/bridges)
      tm.fillCircle(Math.floor(cx - tm.cols * 0.12), Math.floor(cy - tm.rows * 0.20), 3, TILE.FOREST);
      tm.fillCircle(Math.floor(cx + tm.cols * 0.12), Math.floor(cy + tm.rows * 0.20), 3, TILE.FOREST);

      // Bushes near bridges
      for (const br of bridgeRows) {
        tm.fillCircle(cx - 7, br, 1, TILE.BUSH);
        tm.fillCircle(cx + 7, br, 1, TILE.BUSH);
      }

      // Clear base areas
      for (const b of baseTiles) {
        tm.fillCircle(b.col, b.row, 10, TILE.GRASS);
      }

      return { basePositions };
    },

    spawnContestedResources(scene) {
      const cx = scene.worldWidth / 2;
      const cy = scene.worldHeight / 2;
      // 1 gold + 1 food at the two bridge midpoints
      scene.spawnResourceNode('gold', cx, cy - scene.worldHeight * 0.20);
      scene.spawnResourceNode('food', cx, cy + scene.worldHeight * 0.20);
    },
  },
};

export const MAP_ORDER = ['three_way_classic', 'duel_river'];
