import Phaser from '../phaser.js';

// Tile types
export const TILE = {
  CLIFF: 0,      // impassable
  GRASS: 1,      // normal movement
  FOREST: 2,     // 50% speed, blocks vision
  BUSH: 3,       // stealth zone, normal speed
  ELEVATION: 4,  // high ground — range bonus, vision advantage
  RAMP: 5,       // connects elevation to ground
  SAND: 6,       // slight slowdown
  BRIDGE: 7,     // normal movement (over water)
  BUILDING: 8,   // impassable, occupied by a building footprint
  WATER: 99,     // impassable
};

export const TILE_SPEED = {
  [TILE.CLIFF]: 0,
  [TILE.GRASS]: 1.0,
  [TILE.FOREST]: 0.5,
  [TILE.BUSH]: 0.9,
  [TILE.ELEVATION]: 1.0,
  [TILE.RAMP]: 0.7,
  [TILE.SAND]: 0.75,
  [TILE.BRIDGE]: 1.0,
  [TILE.BUILDING]: 0,
  [TILE.WATER]: 0,
};

export default class TerrainMap {
  constructor(scene, worldWidth, worldHeight, tileSize = 64) {
    this.scene = scene;
    this.tileSize = tileSize;
    this.cols = Math.ceil(worldWidth / tileSize);
    this.rows = Math.ceil(worldHeight / tileSize);
    this.grid = new Uint8Array(this.cols * this.rows).fill(TILE.GRASS);
    this.bridges = []; // { wx, wy, riverAngle, lengthTiles, widthTiles }
  }

  registerBridge(wx, wy, riverAngle, lengthTiles, widthTiles) {
    this.bridges.push({ wx, wy, riverAngle, lengthTiles, widthTiles });
  }

  get(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return TILE.CLIFF;
    return this.grid[row * this.cols + col];
  }

  set(col, row, type) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    this.grid[row * this.cols + col] = type;
  }

  worldToTile(wx, wy) {
    return {
      col: Math.floor(wx / this.tileSize),
      row: Math.floor(wy / this.tileSize),
    };
  }

  tileToWorld(col, row) {
    return {
      x: col * this.tileSize + this.tileSize / 2,
      y: row * this.tileSize + this.tileSize / 2,
    };
  }

  isWalkable(col, row) {
    const t = this.get(col, row);
    return t !== TILE.WATER && t !== TILE.CLIFF && t !== TILE.BUILDING;
  }

  // Mark rectangular building footprint; returns saved tiles for later restore.
  occupyFootprint(wx, wy, wWidth, wHeight) {
    const ts = this.tileSize;
    const tx1 = Math.floor((wx - wWidth / 2) / ts);
    const ty1 = Math.floor((wy - wHeight / 2) / ts);
    const tx2 = Math.floor((wx + wWidth / 2) / ts);
    const ty2 = Math.floor((wy + wHeight / 2) / ts);
    const saved = [];
    for (let r = ty1; r <= ty2; r += 1) {
      for (let c = tx1; c <= tx2; c += 1) {
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) continue;
        saved.push({ c, r, prev: this.get(c, r) });
        this.set(c, r, TILE.BUILDING);
      }
    }
    return saved;
  }

  releaseFootprint(saved) {
    if (!saved) return;
    for (const { c, r, prev } of saved) this.set(c, r, prev);
  }

  getSpeedMultiplier(wx, wy) {
    const { col, row } = this.worldToTile(wx, wy);
    return TILE_SPEED[this.get(col, row)] ?? 1.0;
  }

  isElevated(col, row) {
    const t = this.get(col, row);
    return t === TILE.ELEVATION;
  }

  isStealth(col, row) {
    return this.get(col, row) === TILE.BUSH;
  }

  isForest(col, row) {
    return this.get(col, row) === TILE.FOREST;
  }

  // Fill a rectangular region with a tile type
  fillRect(col1, row1, col2, row2, type) {
    for (let r = Math.max(0, row1); r <= Math.min(this.rows - 1, row2); r += 1) {
      for (let c = Math.max(0, col1); c <= Math.min(this.cols - 1, col2); c += 1) {
        this.set(c, r, type);
      }
    }
  }

  // Fill a circle with a tile type
  fillCircle(centerCol, centerRow, radius, type) {
    for (let r = centerRow - radius; r <= centerRow + radius; r += 1) {
      for (let c = centerCol - radius; c <= centerCol + radius; c += 1) {
        const dx = c - centerCol;
        const dy = r - centerRow;
        if (dx * dx + dy * dy <= radius * radius) {
          this.set(c, r, type);
        }
      }
    }
  }

  // Winding river (set water tiles along a path)
  carveRiver(startCol, startRow, endCol, endRow, width) {
    const steps = Math.max(Math.abs(endRow - startRow), Math.abs(endCol - startCol));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const c = Math.round(startCol + (endCol - startCol) * t + Math.sin(t * Math.PI * 4) * width * 0.8);
      const r = Math.round(startRow + (endRow - startRow) * t);
      this.fillCircle(c, r, width, TILE.WATER);
    }
  }

  // Place a bridge (overwrite water tiles with bridge)
  placeBridge(col, row, horizontal, length) {
    for (let i = 0; i < length; i += 1) {
      const bc = horizontal ? col + i : col;
      const br = horizontal ? row : row + i;
      // Bridge + 1 tile width for passage
      this.set(bc, br, TILE.BRIDGE);
      this.set(bc, br - 1, TILE.BRIDGE);
      this.set(bc, br + 1, TILE.BRIDGE);
    }
  }

  // Render the terrain visually
  render() {
    const scene = this.scene;
    const ts = this.tileSize;

    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        const t = this.get(c, r);
        const wx = c * ts + ts / 2;
        const wy = r * ts + ts / 2;

        if (t === TILE.WATER || t === TILE.BRIDGE) {
          // Water background under both water AND bridge tiles
          if (scene.textures.exists('fp_water_bg')) {
            scene.add.image(wx, wy, 'fp_water_bg').setDisplaySize(ts + 1, ts + 1).setDepth(-9);
          } else {
            scene.add.rectangle(wx, wy, ts, ts, 0x2a7aaa, 1).setDepth(-9);
          }
        } else if (t === TILE.ELEVATION) {
          scene.add.rectangle(wx, wy, ts, ts, 0x5a6a50, 0.5).setDepth(-7);
        }
      }
    }

    // Scatter forest trees
    this._renderForests();
    // Scatter bush sprites
    this._renderBushes();
    // Place bridge sprites
    this._renderBridges();
    // Scatter rock sprites on cliffs
    this._renderCliffs();
  }

  _renderForests() {
    const scene = this.scene;
    const ts = this.tileSize;
    const rng = new Phaser.Math.RandomDataGenerator(['forests']);
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        if (this.get(c, r) !== TILE.FOREST) continue;
        const wx = c * ts + ts / 2;
        const wy = r * ts + ts / 2;
        // Dark ground under forest
        scene.add.rectangle(wx, wy, ts, ts, 0x1a3a1a, 0.3).setDepth(-6);
        // Random tree
        const treeIdx = rng.between(1, 4);
        const key = `fp_tree_${treeIdx}`;
        if (scene.textures.exists(key)) {
          scene.add.image(
            wx + rng.between(-8, 8),
            wy + rng.between(-8, 8),
            key
          ).setScale(rng.realInRange(0.6, 0.9)).setDepth(wy);
        }
      }
    }
  }

  _renderBushes() {
    const scene = this.scene;
    const ts = this.tileSize;
    const rng = new Phaser.Math.RandomDataGenerator(['bushes']);
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        if (this.get(c, r) !== TILE.BUSH) continue;
        const wx = c * ts + ts / 2;
        const wy = r * ts + ts / 2;
        const key = `fp_bush_${rng.between(1, 4)}`;
        if (scene.textures.exists(key)) {
          scene.add.image(wx, wy, key).setScale(rng.realInRange(0.8, 1.2)).setDepth(wy).setAlpha(0.9);
        }
      }
    }
  }

  _renderBridges() {
    const scene = this.scene;
    const ts = this.tileSize;
    if (!scene.textures.exists('ts_bridge')) return;
    // Render one rotated sprite per registered bridge, oriented across its river.
    for (const br of this.bridges) {
      // Sprite's natural long-axis is horizontal; rotate by perp (river+π/2) so
      // the long side spans the river width.
      const perp = br.riverAngle + Math.PI / 2;
      scene.add.image(br.wx, br.wy, 'ts_bridge')
        .setRotation(perp)
        .setDisplaySize(br.lengthTiles * ts, br.widthTiles * ts)
        .setDepth(-3);
    }
  }

  _renderCliffs() {
    const scene = this.scene;
    const ts = this.tileSize;
    const rng = new Phaser.Math.RandomDataGenerator(['cliffs']);
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        if (this.get(c, r) !== TILE.CLIFF) continue;
        const wx = c * ts + ts / 2;
        const wy = r * ts + ts / 2;
        // Dark rocky ground
        scene.add.rectangle(wx, wy, ts, ts, 0x3a3a32, 0.8).setDepth(-8);
        // Scatter rocks (not every tile — every other)
        if ((c + r) % 2 === 0) {
          const key = `fp_rock_${rng.between(1, 4)}`;
          if (scene.textures.exists(key)) {
            scene.add.image(wx + rng.between(-6, 6), wy + rng.between(-6, 6), key)
              .setScale(rng.realInRange(0.8, 1.3)).setDepth(wy);
          }
        }
      }
    }
  }
}
