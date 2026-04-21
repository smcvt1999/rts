// Post-movement pass. Applies three behaviors per frame:
//   1. Separation — hard push-apart of overlapping allies/enemies (dominant).
//   2. Alignment  — gentle nudge toward average neighbor heading while moving.
//   3. Cohesion   — gentle pull toward same-faction group centroid while moving.
// Not true physics; pure position nudging after Unit.update has run.
export default class FlockingSystem {
  constructor(scene) {
    this.scene = scene;
    this.senseRadius = 110;
    this.alignStrength = 22;   // px/sec bias toward avg heading
    this.cohesionStrength = 14; // px/sec pull toward centroid when far from group
    this.cohesionMinGap = 40;   // only pull when > this far from group center
  }

  update(dt) {
    const units = this.scene.units;
    if (units.length < 2) return;

    // Build a lightweight frame cache of alive units.
    const live = [];
    for (let i = 0; i < units.length; i += 1) {
      const u = units[i];
      if (u && !u.dead) live.push(u);
    }
    if (live.length < 2) return;

    // Separation runs EVERY frame (cheap, prevents overlap drift).
    this._separationPass(live);

    // Alignment + Cohesion throttled to ~15Hz (more expensive, less time-critical).
    this._accum = (this._accum || 0) + dt;
    if (this._accum < 0.066) return;
    const effDt = this._accum;
    this._accum = 0;
    this._alignCohesionPass(live, effDt);
  }

  _separationPass(live) {
    for (let i = 0; i < live.length; i += 1) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j += 1) {
        const b = live[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const minD = a.radius + b.radius + 2;
        const sq = dx * dx + dy * dy;
        if (sq >= minD * minD || sq === 0) continue;
        const d = Math.sqrt(sq) || 0.01;
        const overlap = minD - d;
        // Soft push: 0.25 instead of 0.5 leaves residual overlap so units making
        // small forward motion don't get fully cancelled by separation. Prevents
        // worker clusters from deadlocking when funneling toward a depot.
        const push = overlap * 0.25;
        const nx = dx / d;
        const ny = dy / d;
        const aLocked = this._isLocked(a);
        const bLocked = this._isLocked(b);
        if (aLocked && !bLocked) {
          const bx = b.x - nx * overlap;
          const by = b.y - ny * overlap;
          if (this._isWalkable(bx, by)) { b.x = bx; b.y = by; }
        } else if (bLocked && !aLocked) {
          const ax = a.x + nx * overlap;
          const ay = a.y + ny * overlap;
          if (this._isWalkable(ax, ay)) { a.x = ax; a.y = ay; }
        } else {
          const ax = a.x + nx * push;
          const ay = a.y + ny * push;
          const bx2 = b.x - nx * push;
          const by2 = b.y - ny * push;
          if (this._isWalkable(ax, ay)) { a.x = ax; a.y = ay; }
          if (this._isWalkable(bx2, by2)) { b.x = bx2; b.y = by2; }
        }
      }
    }
  }

  _alignCohesionPass(live, dt) {
    const senseSq = this.senseRadius * this.senseRadius;
    for (let i = 0; i < live.length; i += 1) {
      const a = live[i];
      if (!a.moveTarget) continue;
      let alignX = 0, alignY = 0, alignCount = 0;
      let cohX = 0, cohY = 0, cohCount = 0;

      for (let j = 0; j < live.length; j += 1) {
        if (i === j) continue;
        const b = live[j];
        if (b.factionId !== a.factionId) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const sq = dx * dx + dy * dy;
        if (sq > senseSq) continue;

        cohX += b.x; cohY += b.y; cohCount += 1;

        if (b.moveTarget) {
          const hx = b.moveTarget.x - b.x;
          const hy = b.moveTarget.y - b.y;
          const hd = Math.hypot(hx, hy);
          if (hd > 0.1) {
            alignX += hx / hd;
            alignY += hy / hd;
            alignCount += 1;
          }
        }
      }

      if (alignCount > 0) {
        const ax2 = alignX / alignCount;
        const ay2 = alignY / alignCount;
        const newAx = a.x + ax2 * this.alignStrength * dt;
        const newAy = a.y + ay2 * this.alignStrength * dt;
        if (this._isWalkable(newAx, newAy)) { a.x = newAx; a.y = newAy; }
      }

      if (cohCount > 0) {
        const cx = cohX / cohCount;
        const cy = cohY / cohCount;
        const gx = cx - a.x;
        const gy = cy - a.y;
        const gd = Math.hypot(gx, gy);
        if (gd > this.cohesionMinGap) {
          const newX = a.x + (gx / gd) * this.cohesionStrength * dt;
          const newY = a.y + (gy / gd) * this.cohesionStrength * dt;
          if (this._isWalkable(newX, newY)) { a.x = newX; a.y = newY; }
        }
      }
    }
  }

  _isWalkable(x, y) {
    const tm = this.scene.terrainMap;
    if (!tm) return true;
    const { col, row } = tm.worldToTile(x, y);
    return tm.isWalkable(col, row);
  }

  _isLocked(u) {
    if (!u.isWorker) return false;
    // Lock workers that are doing something purposeful so they don't get
    // shoved off course by mutual separation. Includes user-issued move
    // commands (moveTarget present) so player input feels precise.
    if (u.moveTarget) return true;
    return u.workerState === 'harvesting'
      || u.workerState === 'depositing'
      || u.workerState === 'building'
      || u.workerState === 'moveToDeposit'
      || u.workerState === 'moveToNode'
      || u.workerState === 'moveToBuild';
  }
}
