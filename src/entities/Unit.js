import Phaser from '../phaser.js';
import { UNIT_TYPES } from '../data/units.js';

export default class Unit extends Phaser.GameObjects.Container {
  constructor(scene, config) {
    const stats = config.stats || UNIT_TYPES[config.unitTypeId];
    const size = config.size || (config.isHero ? 30 : 24);
    const displayName = config.label || stats.shortName || stats.name;

    super(scene, config.x, config.y);

    this.scene = scene;
    this.factionId = config.factionId;
    this.unitTypeId = config.unitTypeId;
    this.displayName = displayName;
    this.unitName = stats.name;
    this.category = stats.category || 'infantry';
    this.isHero = Boolean(config.isHero);
    this.baseStats = stats;
    this.maxHp = Math.round(stats.hp);
    this.hp = this.maxHp;
    this.baseDamage = stats.damage;
    this.baseAttackRange = stats.attackRange;
    this.baseAttackSpeed = stats.attackSpeed;
    this.baseMoveSpeed = stats.moveSpeed;
    this.baseSightRange = stats.sightRange ?? stats.attackRange + 80;
    this.baseArmor = stats.armor ?? 0;
    this.bonusVs = stats.bonusVs || null;
    this.supplyCost = (stats.cost && stats.cost.supply) ?? (config.supplyCost ?? 1);
    this.carryCapacity = stats.carryCapacity ?? 0;
    this.harvestTimeBase = stats.harvestTime ?? 2.0;
    this.buildSpeedMultiplier = stats.buildSpeedMultiplier ?? 1;
    this.healCooldownTimer = 0;
    this.isWorker = this.category === 'worker';
    this.carrying = null;
    this.harvestTarget = null;
    this.depositTarget = null;
    this.workerState = 'idle';
    this.workerTimer = 0;
    this.carryIcon = null;
    this.buildTarget = null;
    this.radius = size / 2;
    this.attackCooldown = Phaser.Math.FloatBetween(0, 0.25);
    this.attackTarget = null;
    this.moveTarget = null;
    this.orderType = 'idle';
    this.dead = false;
    this.selected = false;
    this.damageMultiplier = 1;
    this.moveMultiplier = 1;
    this.armorBonus = 0;
    this.buffTimer = 0;
    this.spawnedTime = scene.time.now;

    const shadow = scene.add.ellipse(0, this.radius * 0.5, this.radius * 1.4, this.radius * 0.75, 0x000000, 0.28);

    // Free Pack sprites (separate idle/run/attack sheets)
    const fpMapping = {
      swordsman: 'warrior', lancer: 'lancer', spearman: 'lancer',
      archer: 'archer', worker: 'pawn', monk: 'monk',
      militia: 'militia', bulwark: 'bulwark',
    };
    const fpType = config.isHero ? 'warrior' : fpMapping[config.unitTypeId];
    const fpIdleKey = fpType ? `fp_${fpType}_idle_${this.factionId}` : null;
    const hasFP = fpIdleKey && scene.textures.exists(fpIdleKey);

    this.tsAnimType = hasFP ? fpType : null;
    this.currentAnim = null;
    this._attackAnimActive = false;
    const heroScale = config.isHero ? 1.3 : 1;
    const isLancer = fpType === 'lancer';
    let body;
    if (hasFP) {
      const spriteDisplay = size * (isLancer ? 3.6 : 2.8) * heroScale;
      body = scene.add.sprite(0, -size * 0.35, fpIdleKey, 0)
        .setDisplaySize(spriteDisplay, spriteDisplay);
    } else {
      body = scene.add.rectangle(0, 0, size, size, config.bodyColor ?? stats.color ?? 0xdddddd, 1);
      if (body.setStrokeStyle) body.setStrokeStyle(3, config.strokeColor ?? 0xffffff, 0.85);
    }
    // faction banner with hanja character
    // No banner — TS sprites already color-coded by faction
    const banner = scene.add.rectangle(0, 0, 0, 0, 0x000000, 0);
    this.factionBannerText = null;
    const selection = scene.add.circle(0, 0, this.radius + 9).setStrokeStyle(2, 0xffec8a, 0.9);
    selection.setVisible(false);
    const hpBg = scene.add.rectangle(0, -this.radius - 12, size + 2, 5, 0x16212e, 0.95);
    const hpFill = scene.add.rectangle(-(size + 2) / 2, -this.radius - 12, size + 2, 5, 0x7bd36a, 0.95);
    hpFill.setOrigin(0, 0.5);
    const label = scene.add.text(0, this.radius + 3, displayName, {
      fontFamily: 'Verdana, sans-serif',
      fontSize: '11px',
      color: '#f6f0de',
      stroke: '#08111d',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);

    this.shadow = shadow;
    this.bodyShape = body;
    this.factionBanner = banner;
    this.selectionShape = selection;
    this.hpBack = hpBg;
    this.hpFill = hpFill;
    this.label = label;
    this.facing = 1;
    this.size = size;

    this.add([shadow, body, banner, selection, hpBg, hpFill, label]);
    this.setSize(size, size);
    this.updateDepth();
    scene.add.existing(this);
    this.updateVisuals();
  }

  setSelected(selected) {
    this.selected = selected;
    this.selectionShape.setVisible(selected);
  }

  updateDepth() {
    this.setDepth(this.y + (this.isHero ? 6 : 0));
  }

  setMoveTarget(x, y) {
    this.moveTarget = { x, y };
    this.attackTarget = null;
    this.orderType = 'move';
    // Reset velocity so next frame snaps to new direction instead of low-pass
    // filtering away from the prior heading. Prevents wobble on rapid spam clicks.
    this._vx = undefined;
    this._vy = undefined;
    // Invalidate path only if target shifted enough to matter. Allow immediate
    // recompute if last pathfind was >100ms ago (enables snappy direction changes
    // while still throttling rapid spam clicks).
    const significantMove = !this._lastPathTarget
      || Math.hypot(x - this._lastPathTarget.x, y - this._lastPathTarget.y) > 32;
    if (significantMove) {
      this._path = null;
      this._pathDirty = true;
      const now = this.scene.time?.now ?? 0;
      if (!this._lastPathTime || now - this._lastPathTime > 100) {
        this._lastPathTime = 0; // unblock throttle → next frame computes immediately
      }
    }
    if (this.isWorker) {
      this._releaseHarvestTarget();
      this._releaseBuildTarget();
      this.workerState = 'idle';
    }
  }

  setAttackTarget(target) {
    this.attackTarget = target;
    this.moveTarget = null;
    this.orderType = 'attack';
    this._path = null;
    this._pathDirty = true;
    this._lastPathTarget = null;
    if (this.isWorker) {
      this._releaseHarvestTarget();
      this._releaseBuildTarget();
    }
  }

  clearOrders() {
    this.attackTarget = null;
    this.moveTarget = null;
    this.orderType = 'idle';
  }

  setHarvestTarget(node) {
    if (!this.isWorker || !node || node.dead) return;
    this._releaseHarvestTarget();
    this._releaseBuildTarget();
    this.harvestTarget = node;
    node.assignWorker(this);
    this.attackTarget = null;
    this.moveTarget = null;
    this.orderType = 'harvest';
    this.workerState = this.carrying ? 'moveToDeposit' : 'moveToNode';
  }

  setBuildTarget(building) {
    if (!this.isWorker || !building || building.dead) return;
    this._releaseHarvestTarget();
    this._releaseBuildTarget();
    this.buildTarget = building;
    building.addBuilder(this);
    this.attackTarget = null;
    this.moveTarget = null;
    this.orderType = 'build';
    this.workerState = 'moveToBuild';
  }

  _releaseBuildTarget() {
    if (this.buildTarget) {
      this.buildTarget.removeBuilder(this);
      this.buildTarget = null;
    }
  }

  onConstructionFinished(building) {
    if (this.buildTarget === building) {
      this.buildTarget = null;
      this.workerState = 'idle';
      this.orderType = 'idle';
    }
  }

  _releaseHarvestTarget() {
    if (this.harvestTarget) {
      this.harvestTarget.releaseWorker(this);
      this.harvestTarget = null;
    }
  }

  onResourceNodeDepleted(node) {
    if (this.harvestTarget === node) {
      this.harvestTarget = null;
      if (!this.carrying) {
        this.workerState = 'idle';
        this.orderType = 'idle';
      }
      if (this.isWorker) {
        const fallback = this.scene.findNearestResourceNode?.(this.x, this.y, node.nodeType);
        if (fallback) this.setHarvestTarget(fallback);
      }
    }
  }

  _showCarryIcon(type) {
    if (!this.scene) return;
    const key = type === 'gold' ? 'carry_gold' : 'carry_food';
    if (!this.scene.textures.exists(key)) return;
    if (this.carryIcon) this.carryIcon.destroy();
    const icon = this.scene.add.image(0, -this.radius - 6, key).setDepth(3);
    this.add(icon);
    this.carryIcon = icon;
  }

  _hideCarryIcon() {
    if (this.carryIcon) {
      this.carryIcon.destroy();
      this.carryIcon = null;
    }
  }

  applyBuff({ moveMultiplier = 1, damageMultiplier = 1, armorBonus = 0, duration = 0 }) {
    this.moveMultiplier = moveMultiplier;
    this.damageMultiplier = damageMultiplier;
    this.armorBonus = armorBonus;
    this.buffTimer = duration;
  }

  getMoveSpeed() {
    return this.baseMoveSpeed * this.moveMultiplier;
  }

  getAttackDamage(target) {
    let damage = this.baseDamage * this.damageMultiplier;
    // Faction passive damage bonus
    damage *= (1 + (this._passiveDamageBonus || 0));
    // Bonus vs buildings (Brawler etc)
    if (target && !target.category && this.baseStats?.bonusVsBuilding) {
      damage *= this.baseStats.bonusVsBuilding;
    }
    return damage;
  }

  getAttackRange() {
    // Faction passive range bonus
    return Math.round(this.baseAttackRange * (1 + (this._passiveRangeBonus || 0)));
  }

  getSightRange() {
    return this.baseSightRange;
  }

  getArmor() {
    return this.baseArmor + this.armorBonus + (this._passiveArmorBonus || 0);
  }

  getWorldBounds() {
    const padding = this.radius + 8;
    return new Phaser.Geom.Rectangle(this.x - padding, this.y - padding, padding * 2, padding * 2);
  }

  containsWorldPoint(x, y) {
    return Phaser.Math.Distance.Between(x, y, this.x, this.y) <= this.radius + 16;
  }

  intersectsWorldRect(rect) {
    return Phaser.Geom.Intersects.RectangleToRectangle(this.getWorldBounds(), rect);
  }

  flashHit() {
    this.bodyShape.setAlpha(0.8);
    this.scene.time.delayedCall(70, () => {
      if (!this.dead) {
        this.bodyShape.setAlpha(1);
      }
    });
  }

  updateVisuals() {
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    const width = this.size + 2;
    this.hpFill.width = width * ratio;
    this.hpFill.x = -(width / 2);
    if (ratio > 0.66) {
      this.hpFill.setFillStyle(0x8adf70, 0.95);
    } else if (ratio > 0.33) {
      this.hpFill.setFillStyle(0xf1c45d, 0.95);
    } else {
      this.hpFill.setFillStyle(0xe07171, 0.95);
    }
  }

  takeDamage(amount, attacker) {
    if (this.dead) {
      return 0;
    }

    const mitigated = Math.max(1, Math.round(amount - this.getArmor()));
    this.hp -= mitigated;
    this.flashHit();
    this.updateVisuals();

    if (this.hp <= 0) {
      this.hp = 0;
      this.die(attacker);
    }

    return mitigated;
  }

  die(attacker) {
    if (this.dead) {
      return;
    }

    this.dead = true;
    if (this._bobTween) { this._bobTween.stop(); this._bobTween = null; }
    if (this.isWorker) {
      this._releaseHarvestTarget();
      this._releaseBuildTarget();
    }
    this.scene.onEntityDestroyed(this, attacker);
    // Death animation: fade + tilt then destroy
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      angle: Phaser.Math.Between(-25, 25),
      duration: 400,
      ease: 'Sine.easeOut',
      onComplete: () => { if (!this.destroyed) this.destroy(); },
    });
  }

  update(dt, combatSystem) {
    if (this.dead) {
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.buffTimer > 0) {
      this.buffTimer = Math.max(0, this.buffTimer - dt);
      if (this.buffTimer === 0) {
        this.moveMultiplier = 1;
        this.damageMultiplier = 1;
        this.armorBonus = 0;
      }
    }

    // Support units (Monk) heal nearby wounded allies.
    if (this.baseStats?.healAmount > 0) {
      this._tickHeal(dt);
    }

    if (this.isWorker) {
      this._updateWorker(dt, combatSystem);
      this.updateDepth();
      return;
    }

    const target = combatSystem.resolveTarget(this.attackTarget);
    if (target) {
      this._pursueAndAttack(target, dt, combatSystem);
    } else if (this.moveTarget) {
      this._advanceToPoint(this.moveTarget.x, this.moveTarget.y, dt);
      const nearbyEnemy = combatSystem.findNearestEnemy(this, Math.min(this.getSightRange(), 170));
      if (nearbyEnemy) {
        this.attackTarget = nearbyEnemy;
        this.orderType = 'attack';
      }
    } else {
      const nearbyEnemy = combatSystem.findNearestEnemy(this, Math.min(this.getSightRange(), 130));
      if (nearbyEnemy) {
        this.attackTarget = nearbyEnemy;
        this.orderType = 'attack';
      }
    }

    this.updateDepth();
  }

  _updateWorker(dt, combatSystem) {
    // Attack order takes priority (weak combat)
    const attackee = combatSystem.resolveTarget(this.attackTarget);
    if (attackee) {
      this._pursueAndAttack(attackee, dt, combatSystem);
      return;
    }

    // Return to deposit if carrying full — but NOT if the player issued an
    // explicit move/build/harvest order. Carry resumes after they reach destination.
    const hasUserOrder = this.moveTarget || this.buildTarget || this.harvestTarget;
    if (this.carrying && !hasUserOrder
        && this.workerState !== 'moveToDeposit' && this.workerState !== 'depositing') {
      this.workerState = 'moveToDeposit';
    }

    if (this.harvestTarget && (this.harvestTarget.dead || this.harvestTarget.depleted)) {
      this.harvestTarget = null;
      if (!this.carrying) this.workerState = 'idle';
    }

    if (this.buildTarget && (this.buildTarget.dead || !this.buildTarget.underConstruction)) {
      this._releaseBuildTarget();
      if (this.workerState === 'moveToBuild' || this.workerState === 'building') {
        this.workerState = 'idle';
      }
    }

    switch (this.workerState) {
      case 'moveToBuild': {
        if (!this.buildTarget) { this.workerState = 'idle'; break; }
        const b = this.buildTarget;
        const dist = Phaser.Math.Distance.Between(this.x, this.y, b.x, b.y);
        const reach = Math.max(b.widthValue, b.heightValue) * 0.6 + 4;
        if (dist > reach) {
          this._advanceToPoint(b.x, b.y, dt);
        } else {
          this.workerState = 'building';
          this.bodyShape.setAlpha(0.85);
        }
        break;
      }
      case 'building': {
        if (!this.buildTarget) {
          this.bodyShape.setAlpha(1);
          this.workerState = 'idle';
          break;
        }
        // construction ticks inside Building.tickConstruction based on builders set
        break;
      }
      case 'moveToNode': {
        if (!this.harvestTarget) {
          this.workerState = 'idle';
          break;
        }
        const node = this.harvestTarget;
        const dist = Phaser.Math.Distance.Between(this.x, this.y, node.x, node.y);
        const reach = Math.max(node.widthValue, node.heightValue) * 0.45;
        if (dist > reach) {
          const hp = node.getHarvestPoint(this.x, this.y);
          this._advanceToPoint(hp.x, hp.y, dt);
        } else {
          this.workerState = 'harvesting';
          // Worker's faction harvestTime bonus scales node harvest time
          // (this.harvestTimeBase is base * faction bonus; 2.0 is the unmodified base).
          this.workerTimer = node.harvestTime * (this.harvestTimeBase / 2.0);
          this.bodyShape.setAlpha(0.85);
        }
        break;
      }
      case 'harvesting': {
        if (!this.harvestTarget) {
          this.bodyShape.setAlpha(1);
          this.workerState = 'idle';
          break;
        }
        this.workerTimer -= dt;
        if (this.workerTimer <= 0) {
          const amount = this.harvestTarget.takeHarvest();
          if (amount > 0) {
            this.carrying = { type: this.harvestTarget.nodeType, amount };
            this._showCarryIcon(this.carrying.type);
          }
          this.bodyShape.setAlpha(1);
          this.workerState = 'moveToDeposit';
        }
        break;
      }
      case 'moveToDeposit': {
        if (!this.carrying) {
          this.workerState = this.harvestTarget ? 'moveToNode' : 'idle';
          break;
        }
        const depot = this._findDepotTarget();
        if (!depot) {
          this.workerState = 'idle';
          break;
        }
        const dist = Phaser.Math.Distance.Between(this.x, this.y, depot.x, depot.y);
        // Workers can't enter the building's tile footprint (the terrain marks
        // surrounding tiles BUILDING via Math.floor, so blocked area is wider
        // than visual geometry). Reach = max-dim + one tile + margin.
        const w = depot.widthValue || 80;
        const h = depot.heightValue || 80;
        const reach = Math.max(w, h) + (this.scene.terrainMap?.tileSize || 64);
        if (dist > reach) {
          this._advanceToPoint(depot.x, depot.y, dt);
        } else {
          this.workerState = 'depositing';
          this.workerTimer = 0.15;
        }
        break;
      }
      case 'depositing': {
        this.workerTimer -= dt;
        if (this.workerTimer <= 0) {
          if (this.carrying) {
            this.scene.resourceSystem.deposit(this.factionId, this.carrying.type, this.carrying.amount);
            this.carrying = null;
            this._hideCarryIcon();
          }
          this.workerState = this.harvestTarget ? 'moveToNode' : 'idle';
        }
        break;
      }
      case 'idle':
      default: {
        if (this.moveTarget) {
          this._advanceToPoint(this.moveTarget.x, this.moveTarget.y, dt);
        }
        break;
      }
    }
  }

  _tickHeal(dt) {
    this.healCooldownTimer = Math.max(0, this.healCooldownTimer - dt);
    if (this.healCooldownTimer > 0) return;

    const range = this.baseStats.healRange ?? 160;
    const amount = this.baseStats.healAmount ?? 10;
    const cooldown = this.baseStats.healCooldown ?? 1.5;
    const rangeSq = range * range;

    let target = null;
    let lowestRatio = 1;
    for (const ally of this.scene.units) {
      if (ally.dead || ally === this) continue;
      if (ally.factionId !== this.factionId) continue;
      if (ally.hp >= ally.maxHp) continue;
      const dx = ally.x - this.x;
      const dy = ally.y - this.y;
      if (dx * dx + dy * dy > rangeSq) continue;
      const ratio = ally.hp / ally.maxHp;
      if (ratio < lowestRatio) { lowestRatio = ratio; target = ally; }
    }
    if (!target) return;

    target.hp = Math.min(target.maxHp, target.hp + amount);
    target.updateVisuals();
    this.healCooldownTimer = cooldown;
    this.scene.spawnDamageText?.(target.x, target.y - 18, amount, 0x6ee07a);
  }

  _findDepotTarget() {
    const candidates = this.scene.buildings.filter(
      (b) => !b.dead && b.factionId === this.factionId && b.acceptsDeposit
    );
    if (candidates.length === 0) return null;
    let best = candidates[0];
    let bestDist = Phaser.Math.Distance.Between(this.x, this.y, best.x, best.y);
    for (let i = 1; i < candidates.length; i += 1) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, candidates[i].x, candidates[i].y);
      if (d < bestDist) { best = candidates[i]; bestDist = d; }
    }
    return best;
  }

  _pursueAndAttack(target, dt, combatSystem) {
    const distance = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (distance > this.getAttackRange()) {
      this._attackAnimActive = false;
      this._advanceToPoint(target.x, target.y, dt);
    } else {
      this.clearMoveOnly();
      if (this.attackCooldown <= 0) {
        const damage = this.getAttackDamage(target);
        this.scene.spawnAttackEffect?.(this, target);
        this.currentAnim = null; // force re-trigger
        this._playAnim('attack');
        this._attackAnimActive = true;
        this.playAttackLunge(target.x, target.y);
        combatSystem.dealDamage(this, target, damage);
        this.attackCooldown = 1 / this.baseAttackSpeed;
        this.scene.time.delayedCall(350, () => {
          if (!this.dead) {
            this._attackAnimActive = false;
            this._playAnim('idle');
          }
        });
      } else if (!this._attackAnimActive) {
        this._playAnim('idle');
      }
    }
  }

  clearMoveOnly() {
    this.moveTarget = null;
    this._vx = 0;
    this._vy = 0;
  }

  _advanceToPoint(targetX, targetY, dt) {
    // If we're standing on an unwalkable tile (e.g. a builder finished a building
    // and is now on its footprint), step out to nearest walkable before pathing.
    const tm = this.scene.terrainMap;
    if (tm) {
      const t = tm.worldToTile(this.x, this.y);
      if (!tm.isWalkable(t.col, t.row)) {
        // Spiral search outward for a walkable tile.
        outer: for (let r = 1; r < 10; r += 1) {
          for (let dc = -r; dc <= r; dc += 1) {
            for (let dr = -r; dr <= r; dr += 1) {
              if (Math.abs(dc) !== r && Math.abs(dr) !== r) continue;
              if (tm.isWalkable(t.col + dc, t.row + dr)) {
                const wp = tm.tileToWorld(t.col + dc, t.row + dr);
                this.x = wp.x;
                this.y = wp.y;
                this._path = null;
                this._lastPathTarget = null;
                break outer;
              }
            }
          }
        }
      }
    }

    // Auto-compute path if not available or target changed (throttled)
    if (this.scene.pathfinding && (!this._path || this._pathDirty)) {
      // Throttle: max 1 pathfind per 200ms per unit (was 500ms — too sluggish)
      const now = this.scene.time.now;
      if (!this._lastPathTime || now - this._lastPathTime > 200) {
        const lastTarget = this._lastPathTarget;
        const targetMoved = !lastTarget || Math.hypot(targetX - lastTarget.x, targetY - lastTarget.y) > 32;
        if (targetMoved) {
          this._path = this.scene.pathfinding.findPath(this.x, this.y, targetX, targetY);
          this._pathIndex = 0;
          this._lastPathTarget = { x: targetX, y: targetY };
          this._pathDirty = false;
          this._lastPathTime = now;
        }
      }
    }

    // Follow path waypoints
    let nextX = targetX;
    let nextY = targetY;
    if (this._path && this._path.length > 0) {
      if (this._pathIndex >= this._path.length) this._pathIndex = this._path.length - 1;
      const wp = this._path[this._pathIndex];
      nextX = wp.x;
      nextY = wp.y;
      const wpDist = Math.hypot(nextX - this.x, nextY - this.y);
      if (wpDist < 10 && this._pathIndex < this._path.length - 1) {
        this._pathIndex += 1;
        const nwp = this._path[this._pathIndex];
        nextX = nwp.x;
        nextY = nwp.y;
      }
    }

    const dx = nextX - this.x;
    const dy = nextY - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 3) {
      if (this._path && this._pathIndex >= this._path.length - 1) {
        this.moveTarget = null;
        this._path = null;
        this._lastPathTarget = null;
        this._vx = 0;
        this._vy = 0;
        this._playAnim('idle');
        return;
      }
    }

    this._playAnim('run');

    // Terrain speed modifier
    const terrainMult = this.scene.terrainMap?.getSpeedMultiplier(this.x, this.y) ?? 1.0;
    const moveSpeed = this.getMoveSpeed() * terrainMult;
    // Snap velocity directly to current direction. RTS units feel responsive
    // when they turn instantly rather than easing through prior heading.
    this._vx = (dx / distance) * moveSpeed;
    this._vy = (dy / distance) * moveSpeed;
    const step = Math.hypot(this._vx, this._vy) * dt;
    const capped = Math.min(step, distance);
    const norm = step > 0 ? capped / step : 0;
    this.x += this._vx * dt * norm;
    this.y += this._vy * dt * norm;

    // Sprite flip with 150ms debounce — prevents flicker when player spam-clicks
    // around the unit. Pure horizontal-component flips only after the new
    // direction has held for the debounce window.
    const desiredFacing = dx >= 0 ? 1 : -1;
    const now = this.scene.time?.now ?? 0;
    if (desiredFacing !== this.facing) {
      if (this._pendingFacing !== desiredFacing) {
        this._pendingFacing = desiredFacing;
        this._pendingFacingSince = now;
      } else if (now - (this._pendingFacingSince ?? now) > 150) {
        this.facing = desiredFacing;
        if (this.bodyShape.setFlipX) {
          this.bodyShape.setFlipX(this.facing < 0);
        }
        this.factionBanner.x = this.radius * 0.9 * this.facing;
        this.factionBanner.setOrigin(this.facing < 0 ? 1 : 0, 0.5);
        this._pendingFacing = null;
      }
    } else {
      this._pendingFacing = null;
    }
  }

  _playAnim(action) {
    if (!this.tsAnimType || !this.bodyShape.play) return;
    const key = `${this.tsAnimType}_${action}_${this.factionId}`;
    if (this.currentAnim === key) return;
    if (!this.scene.anims.exists(key)) return;
    this.currentAnim = key;
    // Switch texture to the correct spritesheet for this action
    const texKey = `fp_${this.tsAnimType}_${action === 'attack' ? 'atk' : action}_${this.factionId}`;
    if (this.scene.textures.exists(texKey) && this.bodyShape.texture.key !== texKey) {
      this.bodyShape.setTexture(texKey, 0);
    }
    this.bodyShape.play(key, true);
  }

  playAttackLunge(targetX, targetY) {
    if (this._lungeActive) return;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const lungeX = (dx / d) * 6;
    const lungeY = (dy / d) * 6;
    this._lungeActive = true;
    this.scene.tweens.add({
      targets: this.bodyShape,
      x: lungeX,
      y: -this.size * 0.1 + lungeY,
      duration: 70,
      yoyo: true,
      onComplete: () => {
        this._lungeActive = false;
        this.bodyShape.x = 0;
        this.bodyShape.y = -this.size * 0.1;
      },
    });
  }
}
