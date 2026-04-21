// A* pathfinding on the terrain grid.
// Returns an array of {x, y} world coordinates from start to goal.

export default class Pathfinding {
  constructor(terrainMap) {
    this.map = terrainMap;
  }

  findPath(startX, startY, goalX, goalY) {
    const map = this.map;
    const start = map.worldToTile(startX, startY);
    const goal = map.worldToTile(goalX, goalY);

    // If goal is unwalkable, find nearest walkable tile
    if (!map.isWalkable(goal.col, goal.row)) {
      const alt = this._nearestWalkable(goal.col, goal.row);
      if (!alt) return [{ x: goalX, y: goalY }]; // give up
      goal.col = alt.col;
      goal.row = alt.row;
    }

    if (start.col === goal.col && start.row === goal.row) {
      // Already at the nearest-walkable approach tile to an (unwalkable) goal.
      // Return the original goal coords so the caller can walk closer and decide
      // proximity via its own reach check (otherwise worker oscillates 5px from
      // its own tile center forever).
      return [{ x: goalX, y: goalY }];
    }

    // A* with binary heap
    const cols = map.cols;
    const key = (c, r) => r * cols + c;
    const gScore = new Map();
    const fScore = new Map();
    const cameFrom = new Map();
    const startKey = key(start.col, start.row);
    const goalKey = key(goal.col, goal.row);

    gScore.set(startKey, 0);
    fScore.set(startKey, this._heuristic(start.col, start.row, goal.col, goal.row));

    // Simple open set (sorted array — good enough for our grid size)
    const open = [{ col: start.col, row: start.row, key: startKey }];
    const closed = new Set();
    let iterations = 0;
    const maxIterations = 20000;

    while (open.length > 0 && iterations < maxIterations) {
      iterations += 1;
      // Find lowest fScore
      let bestIdx = 0;
      let bestF = fScore.get(open[0].key) ?? Infinity;
      for (let i = 1; i < open.length; i += 1) {
        const f = fScore.get(open[i].key) ?? Infinity;
        if (f < bestF) { bestF = f; bestIdx = i; }
      }
      const current = open[bestIdx];
      open.splice(bestIdx, 1);

      if (current.key === goalKey) {
        return this._reconstructPath(cameFrom, current, map);
      }

      closed.add(current.key);

      // 8-directional neighbors
      const dirs = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [-1, 1], [1, -1], [1, 1],
      ];

      for (const [dc, dr] of dirs) {
        const nc = current.col + dc;
        const nr = current.row + dr;
        const nk = key(nc, nr);

        if (closed.has(nk)) continue;
        if (!map.isWalkable(nc, nr)) continue;

        // Diagonal: check that both adjacent tiles are walkable (no corner cutting)
        if (dc !== 0 && dr !== 0) {
          if (!map.isWalkable(current.col + dc, current.row) || !map.isWalkable(current.col, current.row + dr)) {
            continue;
          }
        }

        const moveCost = (dc !== 0 && dr !== 0) ? 1.414 : 1.0;
        const tileType = map.get(nc, nr);
        const speedMult = this.map.getSpeedMultiplier(nc * map.tileSize, nr * map.tileSize);
        const tileCost = speedMult > 0 ? moveCost / speedMult : Infinity;

        const tentG = (gScore.get(current.key) ?? Infinity) + tileCost;

        if (tentG < (gScore.get(nk) ?? Infinity)) {
          cameFrom.set(nk, current.key);
          gScore.set(nk, tentG);
          fScore.set(nk, tentG + this._heuristic(nc, nr, goal.col, goal.row));

          if (!open.some((n) => n.key === nk)) {
            open.push({ col: nc, row: nr, key: nk });
          }
        }
      }
    }

    // No path found — return direct line
    return [{ x: goalX, y: goalY }];
  }

  _heuristic(c1, r1, c2, r2) {
    // Octile distance
    const dx = Math.abs(c1 - c2);
    const dy = Math.abs(r1 - r2);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  }

  _reconstructPath(cameFrom, current, map) {
    const path = [];
    let k = current.key;
    const cols = map.cols;
    while (k !== undefined) {
      const row = Math.floor(k / cols);
      const col = k % cols;
      const wp = map.tileToWorld(col, row);
      path.unshift({ x: wp.x, y: wp.y });
      k = cameFrom.get(k);
    }
    // Two-pass smoothing: drop collinear, then string-pull via LOS.
    const smoothed = this._stringPull(this._simplify(path));
    // Drop the start-tile waypoint — the unit is already there, walking back
    // to its tile center first would jerk the unit briefly toward its own tile.
    if (smoothed.length > 1) smoothed.shift();
    return smoothed;
  }

  _simplify(path) {
    if (path.length <= 2) return path;
    const result = [path[0]];
    for (let i = 1; i < path.length - 1; i += 1) {
      const prev = result[result.length - 1];
      const curr = path[i];
      const next = path[i + 1];
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      // If direction changes, keep the waypoint
      if (Math.abs(dx1 * dy2 - dy1 * dx2) > 0.01) {
        result.push(curr);
      }
    }
    result.push(path[path.length - 1]);
    return result;
  }

  // String-pulling: greedily skip waypoints that have line-of-sight to a later one.
  // Turns A*'s staircase pattern into smooth diagonals across open terrain.
  _stringPull(path) {
    if (path.length <= 2) return path;
    const result = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = path.length - 1;
      while (j > i + 1) {
        if (this._hasLineOfSight(path[i].x, path[i].y, path[j].x, path[j].y)) break;
        j -= 1;
      }
      result.push(path[j]);
      i = j;
    }
    return result;
  }

  _hasLineOfSight(x1, y1, x2, y2) {
    const map = this.map;
    const ts = map.tileSize;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return true;
    // Sample along the line at half-tile granularity.
    const steps = Math.max(2, Math.ceil(dist / (ts * 0.5)));
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps;
      const x = x1 + dx * t;
      const y = y1 + dy * t;
      const { col, row } = map.worldToTile(x, y);
      if (!map.isWalkable(col, row)) return false;
    }
    return true;
  }

  _nearestWalkable(col, row) {
    for (let r = 1; r < 15; r += 1) {
      for (let dc = -r; dc <= r; dc += 1) {
        for (let dr = -r; dr <= r; dr += 1) {
          if (Math.abs(dc) !== r && Math.abs(dr) !== r) continue;
          if (this.map.isWalkable(col + dc, row + dr)) {
            return { col: col + dc, row: row + dr };
          }
        }
      }
    }
    return null;
  }
}
