import Phaser from '../phaser.js';
import { BUILDING_TYPES } from '../entities/Building.js';
import { AI_PROFILES, pickRandomAiProfile } from './AIProfiles.js';

// Baseline AI. Trains workers, builds houses + combat structures,
// then mass-produces a simple mixed army and launches waves.
// Profile sets base parameters; reactive layer (next step) tweaks them.
// Difficulty applies a multiplier curve on top of the rolled profile.
// Easy: slower buildCooldown, lower workerTarget, sluggish waves.
// Med: as rolled (current behavior).
// Hard: faster buildCooldown, higher workerTarget, more aggressive waves.
const DIFFICULTY_TWEAKS = {
  easy: { workerMul: 0.75, buildCdMul: 1.5, waveMul: 1.3, thinkMul: 1.3, profileBias: 'balanced' },
  med:  { workerMul: 1.0,  buildCdMul: 1.0, waveMul: 1.0, thinkMul: 1.0, profileBias: null },
  hard: { workerMul: 1.15, buildCdMul: 0.65, waveMul: 0.75, thinkMul: 0.8, profileBias: 'rush' },
};

export default class AIController {
  constructor(scene, factionId, options = {}) {
    this.scene = scene;
    this.factionId = factionId;
    this.difficulty = options.difficulty || 'med';
    const tweak = DIFFICULTY_TWEAKS[this.difficulty] || DIFFICULTY_TWEAKS.med;
    this.thinkInterval = 1.4 * tweak.thinkMul;
    this.thinkTimer = 0.6;

    // Hard biases toward rush, Easy biases toward balanced. Med rolls freely.
    const rolled = options.profileId
      ?? (tweak.profileBias && Math.random() < 0.6 ? tweak.profileBias : pickRandomAiProfile());
    this.profileId = rolled;
    const params = AI_PROFILES[rolled].roll();
    this.params = params;

    this.workerTarget = Math.max(3, Math.round(params.workerTarget * tweak.workerMul));
    this.firstWaveThreshold = Math.max(2, Math.round(params.firstWaveThreshold * tweak.waveMul));
    this.nextWaveThreshold = Math.max(this.firstWaveThreshold + 1, Math.round(params.nextWaveThreshold * tweak.waveMul));
    this.unitWeights = { militia: 0.1, bulwark: 0.1, ...params.unitWeights };
    // Apply faction's preferred unit ordering as a multiplier on the rolled weights.
    const faction = scene.getFaction(factionId);
    const prefs = faction?.aiProfile?.preferredUnits || [];
    prefs.forEach((id, i) => {
      const factionMult = 1.5 - i * 0.2; // 1.5, 1.3, 1.1, 0.9
      this.unitWeights[id] = (this.unitWeights[id] ?? 1) * factionMult;
    });
    this.buildOrder = params.buildOrder.slice();
    this.buildCooldown = params.buildCooldown * tweak.buildCdMul;

    this.intent = 'economy';
    this.wave = [];
    this.waveTarget = null;
    this.rallyPoint = null;
    this.lastBuildAttemptAt = 0;

    // Reactive layer state
    this.observeInterval = 3.0;
    this.observeTimer = 1.0;
    this.lastObservation = null;
    this.baseWeights = { ...this.unitWeights }; // snapshot for reactive rebalance

    console.log(`[AI] faction=${factionId} difficulty=${this.difficulty} profile=${rolled}`, this.params);
  }

  update(dt) {
    this.observeTimer -= dt;
    if (this.observeTimer <= 0) {
      this.observeTimer = this.observeInterval;
      this.tickReactive();
    }

    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer = this.thinkInterval;

    const faction = this.scene.getFaction(this.factionId);
    if (!faction) return;

    this._ensureRallyPoint();
    this._pruneDeadWave();
    this._checkDefense();

    this.tickEconomy(faction);
    this.tickArmy(faction);
  }

  tickReactive() {
    // Observe combined enemy presence across all opponents (spectator-safe).
    const opponents = new Set(this._getOpponentFactions());
    const playerUnits = this.scene.units.filter((u) => !u.dead && opponents.has(u.factionId));
    const playerBuildings = this.scene.buildings.filter((b) => !b.dead && opponents.has(b.factionId));

    const armyUnits = playerUnits.filter((u) => !u.isWorker && !u.isHero);
    const compCounts = { infantry: 0, ranged: 0, support: 0 };
    for (const u of armyUnits) {
      if (u.category === 'ranged') compCounts.ranged += 1;
      else if (u.category === 'support') compCounts.support += 1;
      else compCounts.infantry += 1;
    }
    const armySize = armyUnits.length;
    const ratios = armySize > 0
      ? { infantry: compCounts.infantry / armySize, ranged: compCounts.ranged / armySize, support: compCounts.support / armySize }
      : { infantry: 0, ranged: 0, support: 0 };

    const playerWorkerCount = playerUnits.filter((u) => u.isWorker).length;
    const hasStable = playerBuildings.some((b) => b.buildingTypeId === 'monastery' && !b.underConstruction);
    const hasArcheryRange = playerBuildings.some((b) => b.buildingTypeId === 'archeryRange' && !b.underConstruction);
    const ownArmy = this.getOwnArmy().length;

    // Reset weights from base, then apply counter biases
    const w = { ...this.baseWeights };
    if (ratios.infantry >= 0.5) { w.archer = (w.archer ?? 1) * 1.4; }
    if (ratios.ranged >= 0.4) { w.lancer = (w.lancer ?? 1) * 1.4; w.swordsman = (w.swordsman ?? 1) * 1.3; }

    // Tempo response
    if (playerWorkerCount <= 4 && armySize >= 3) {
      // Player is rushing: prioritize swordsman/spearman defenders
      w.swordsman = (w.swordsman ?? 1) * 1.4;
      w.lancer = (w.lancer ?? 1) * 1.3;
    } else if (playerWorkerCount >= 12) {
      // Player booming — pressure earlier
      this.firstWaveThreshold = Math.max(4, Math.round(this.firstWaveThreshold * 0.75));
    }

    // Tech response — if player has no ranged counter, cavalry is safe
    if (!hasArcheryRange) { w.swordsman = (w.swordsman ?? 1) * 1.2; }
    if (!hasStable) { w.archer = (w.archer ?? 1) * 1.2; }

    // Big army deficit → plan bigger next wave
    if (armySize >= ownArmy * 1.5 && armySize >= 6) {
      this.nextWaveThreshold = Math.min(24, Math.round(this.nextWaveThreshold * 1.3));
    }

    this.unitWeights = w;
    this.lastObservation = { ratios, armySize, playerWorkerCount, hasStable, hasArcheryRange };
  }

  _checkDefense() {
    const tc = this.scene.getMainBase(this.factionId);
    if (!tc) return;
    const opponents = new Set(this._getOpponentFactions());
    const threats = this.scene.units.filter(
      (u) => !u.dead && opponents.has(u.factionId) && !u.isWorker
        && Phaser.Math.Distance.Between(u.x, u.y, tc.x, tc.y) < 320
    );
    if (threats.length >= 2) {
      // Recall army to defend
      if (this.intent !== 'defending') {
        this.intent = 'defending';
        this.waveTarget = threats[0];
        for (const u of this.wave) {
          if (!u.dead) u.setAttackTarget(threats[0]);
        }
      } else {
        // Keep attacking nearest threat
        const nearest = threats[0];
        for (const u of this.wave) {
          if (!u.dead && (!u.attackTarget || u.attackTarget.dead)) u.setAttackTarget(nearest);
        }
      }
    } else if (this.intent === 'defending') {
      // Threats cleared — reset to economy/massing based on army size
      this.intent = this.wave.length >= this.firstWaveThreshold ? 'massing' : 'economy';
      this.waveTarget = null;
    }
  }

  _ensureRallyPoint() {
    if (this.rallyPoint) return;
    const tc = this.scene.getMainBase(this.factionId);
    if (!tc) return;
    const player = this.scene.getMainBase(this.scene.playerFactionId);
    if (!player) {
      this.rallyPoint = { x: tc.x, y: tc.y };
      return;
    }
    const dx = player.x - tc.x;
    const dy = player.y - tc.y;
    const d = Math.hypot(dx, dy) || 1;
    this.rallyPoint = {
      x: tc.x + (dx / d) * 180,
      y: tc.y + (dy / d) * 80,
    };
  }

  _pruneDeadWave() {
    this.wave = this.wave.filter((u) => u && !u.dead);
  }

  getOwnWorkers() {
    return this.scene.units.filter((u) => !u.dead && u.factionId === this.factionId && u.isWorker);
  }

  getOwnArmy() {
    return this.scene.units.filter(
      (u) => !u.dead && u.factionId === this.factionId && !u.isWorker && !u.isHero
    );
  }

  getOwnBuildings() {
    return this.scene.buildings.filter((b) => !b.dead && b.factionId === this.factionId);
  }

  hasBuilding(id, includeConstruction = true) {
    return this.getOwnBuildings().some((b) => b.buildingTypeId === id && (includeConstruction || !b.underConstruction));
  }

  countBuilding(id) {
    return this.getOwnBuildings().filter((b) => b.buildingTypeId === id).length;
  }

  idleWorker() {
    const workers = this.getOwnWorkers();
    // Prefer one that's just harvesting food (not carrying, not building)
    return (
      workers.find((w) => !w.buildTarget && !w.carrying && w.workerState !== 'building') ||
      workers.find((w) => !w.buildTarget) ||
      null
    );
  }

  tickEconomy(faction) {
    const tc = this.scene.getMainBase(this.factionId);
    if (!tc || tc.dead) return;

    const resources = this.scene.resourceSystem.getResources(this.factionId);
    const workers = this.getOwnWorkers();

    // 1) Keep producing workers up to target
    if (workers.length < this.workerTarget && !tc.activeProduction && tc.productionQueue.length === 0) {
      this.scene.productionSystem.queueUnit(tc, 'worker');
    }

    // 2) Supply cap management
    const supplyHeadroom = resources.supplyCap - resources.supplyUsed;
    const housesInProgress = this.getOwnBuildings().filter((b) => b.buildingTypeId === 'house' && b.underConstruction).length;
    if (supplyHeadroom <= 3 && housesInProgress === 0 && resources.supplyCap < 40) {
      this._tryBuild('house');
    }

    // 3) Profile-driven build order (skip 'house' here — handled in step 2 above)
    let builtThisTick = false;
    for (const id of this.buildOrder) {
      if (id === 'house') continue;
      if (!this.hasBuilding(id)) {
        if (this._tryBuild(id)) builtThisTick = true;
        break;
      }
    }

    // 3b) Multi-prod: scale production buildings with worker count.
    // Once core build order satisfied, build a second of each as economy grows.
    if (!builtThisTick) {
      const desiredProdCount = Math.max(1, Math.floor(workers.length / 6));
      const prodBuildings = this.getOwnBuildings().filter(
        (b) => b.buildingType.produces.length > 0 && b.buildingTypeId !== 'townCenter'
      );
      if (prodBuildings.length < desiredProdCount) {
        const prodTypes = ['barracks', 'archeryRange', 'monastery'];
        for (const id of prodTypes) {
          const count = prodBuildings.filter((b) => b.buildingTypeId === id).length;
          if (count < 2) {
            this._tryBuild(id);
            break;
          }
        }
      }
    }

    // 4) TC special units: militia (early scout), bulwark (if massing)
    if (tc && !tc.activeProduction && tc.productionQueue.length === 0) {
      const army = this.getOwnArmy();
      const hasMilitia = army.some((u) => u.unitTypeId === 'militia');
      const hasBulwark = army.some((u) => u.unitTypeId === 'bulwark');
      if (!this._scoutSent && !hasMilitia && workers.length >= 3) {
        this.scene.productionSystem.queueUnit(tc, 'militia');
      } else if (this.intent === 'massing' && !hasBulwark && army.length >= 4) {
        this.scene.productionSystem.queueUnit(tc, 'bulwark');
      }
    }

    // 5) Train combat units from production buildings
    const combatBuildings = this.getOwnBuildings().filter(
      (b) => !b.underConstruction && b.buildingType.produces.length > 0 && b.buildingTypeId !== 'townCenter'
    );
    for (const b of combatBuildings) {
      if (b.activeProduction || b.productionQueue.length >= 1) continue;
      const choice = this._pickUnitFromBuilding(b);
      if (choice) this.scene.productionSystem.queueUnit(b, choice);
    }
  }

  _pickUnitFromBuilding(building) {
    const options = building.buildingType.produces.slice();
    if (options.length === 0) return null;
    const totalWeight = options.reduce((s, id) => s + (this.unitWeights[id] ?? 1), 0);
    let roll = Math.random() * totalWeight;
    for (const id of options) {
      const w = this.unitWeights[id] ?? 1;
      if ((roll -= w) <= 0) return id;
    }
    return options[0];
  }

  _tryBuild(buildingTypeId) {
    const now = this.scene.time.now / 1000;
    if (now - this.lastBuildAttemptAt < this.buildCooldown) return false;
    const type = BUILDING_TYPES[buildingTypeId];
    if (!type || !type.buildable) return false;
    const cost = this.scene.applyFactionCost(type.cost ?? { food: 0, gold: 0 }, this.scene.getFaction(this.factionId), true);
    if (!this.scene.resourceSystem.canAfford(this.factionId, cost)) return false;

    const worker = this.idleWorker();
    if (!worker) return false;

    const pos = this._findBuildSpot(buildingTypeId);
    if (!pos) {
      this.lastBuildAttemptAt = now; // Don't retry immediately
      return false;
    }

    if (!this.scene.resourceSystem.spend(this.factionId, cost)) return false;

    const faction = this.scene.getFaction(this.factionId);
    const building = this.scene.spawnBuilding(buildingTypeId, this.factionId, pos.x, pos.y, {
      side: this.factionId === this.scene.playerFactionId ? 'left' : 'right',
      factionColor: faction.accent,
      underConstruction: true,
    });
    worker.setBuildTarget(building);
    this.lastBuildAttemptAt = now;
    return true;
  }

  _findBuildSpot(buildingTypeId) {
    const tc = this.scene.getMainBase(this.factionId);
    if (!tc) return null;
    const type = BUILDING_TYPES[buildingTypeId];
    const baseX = tc.x;
    const baseY = tc.y;
    // Spiral outward search
    const ringsCount = 5;
    const anglesPerRing = 10;
    for (let ring = 1; ring <= ringsCount; ring += 1) {
      const radius = 120 + ring * 60;
      const angleOffset = (ring * 0.23) * Math.PI;
      for (let a = 0; a < anglesPerRing; a += 1) {
        const angle = angleOffset + (a / anglesPerRing) * Math.PI * 2;
        const x = baseX + Math.cos(angle) * radius;
        const y = baseY + Math.sin(angle) * radius * 0.75;
        if (this.scene.isPlacementValid(buildingTypeId, x, y)) {
          return { x, y };
        }
      }
    }
    return null;
  }

  tickArmy(faction) {
    const army = this.getOwnArmy();
    const hero = this.scene.units.find((u) => u.isHero && u.factionId === this.factionId && !u.dead);

    // Register newly spawned combat units into wave roster
    for (const u of army) {
      if (u._aiRetreating) continue; // skip wounded units in retreat
      if (!this.wave.includes(u)) {
        this.wave.push(u);
        if (this.rallyPoint && this.intent !== 'attacking') {
          u.setMoveTarget(
            this.rallyPoint.x + (Math.random() - 0.5) * 40,
            this.rallyPoint.y + (Math.random() - 0.5) * 40
          );
        }
      }
    }

    // ---- Micro behaviors (run every tick) ----
    this._microRetreatDamaged();
    this._microFocusFire();
    this._microKiteRanged();
    this._microFormation();
    this._microSmartTargeting();

    // ---- Strategic behaviors ----
    this._tickScouting();
    this._tickHarassment();
    this._tickFlanking();
    this._tickPatrol();
    this._tickExpansion();
    this._tickBaiting();
    this._tickHitAndRun();
    this._tickResourceDenial();
    this._tickCounterTiming();
    this._tickForwardTower();
    this._tickThreeWayPolitics();

    // ---- Main army state machine ----
    switch (this.intent) {
      case 'economy': {
        if (this.wave.length >= this.firstWaveThreshold) {
          this.intent = 'massing';
        }
        break;
      }
      case 'massing': {
        if (this.wave.length >= this.nextWaveThreshold) {
          this._launchWave(army, hero);
          this.intent = 'attacking';
        } else if (this.wave.length < this.firstWaveThreshold * 0.5) {
          this.intent = 'economy';
        }
        break;
      }
      case 'attacking': {
        if (this.wave.length === 0) {
          this.intent = 'economy';
          this.waveTarget = null;
          this._flankExecuted = false;
          this._baitSent = false;
          this.nextWaveThreshold = Math.min(20, this.nextWaveThreshold + 2);
        } else {
          this._retargetWave();
        }
        break;
      }
      default:
        this.intent = 'economy';
    }
  }

  // === FOCUS FIRE: all wave units attack the same target ===
  _microFocusFire() {
    if (this.intent !== 'attacking' || this.wave.length === 0) return;
    if (!this.waveTarget || this.waveTarget.dead) return;
    // Every few ticks, re-align stragglers to the wave target
    for (const u of this.wave) {
      if (u.dead) continue;
      // If unit has no target or its target is dead, assign wave target
      if (!u.attackTarget || u.attackTarget.dead) {
        u.setAttackTarget(this.waveTarget);
      }
    }
  }

  // === RETREAT: pull back units below 25% HP to base ===
  _microRetreatDamaged() {
    const tc = this.scene.getMainBase(this.factionId);
    if (!tc) return;
    for (const u of this.wave) {
      if (u.dead) continue;
      const hpRatio = u.hp / u.maxHp;
      if (hpRatio < 0.25 && u.orderType === 'attack') {
        // Retreat to TC and mark so tickArmy doesn't immediately re-recruit.
        u.setMoveTarget(
          tc.x + (Math.random() - 0.5) * 80,
          tc.y + (Math.random() - 0.5) * 80
        );
        u._aiRetreating = true;
        this.wave = this.wave.filter((w) => w !== u);
      }
    }
    // Clear retreat flag once HP recovered enough (heal or Monk support).
    for (const u of this.scene.units) {
      if (u._aiRetreating && (u.dead || u.hp / u.maxHp >= 0.6)) {
        u._aiRetreating = false;
      }
    }
  }

  // === KITING: ranged units try to stay at max range ===
  _microKiteRanged() {
    if (this.intent !== 'attacking') return;
    for (const u of this.wave) {
      if (u.dead || !u.attackTarget || u.attackTarget.dead) continue;
      if (u.category !== 'ranged') continue;
      const dist = Phaser.Math.Distance.Between(u.x, u.y, u.attackTarget.x, u.attackTarget.y);
      const range = u.getAttackRange();
      // If enemy is too close (within 60% of range), back away
      if (dist < range * 0.6 && u.attackCooldown > 0) {
        const dx = u.x - u.attackTarget.x;
        const dy = u.y - u.attackTarget.y;
        const d = Math.hypot(dx, dy) || 1;
        const retreatDist = range * 0.8;
        u.setMoveTarget(u.x + (dx / d) * retreatDist, u.y + (dy / d) * retreatDist);
      }
    }
  }

  // === SCOUTING: send first unit to explore early ===
  _tickScouting() {
    if (this._scoutSent) return;
    const now = this.scene.time.now / 1000;
    if (now < 15) return; // wait 15s before scouting

    const army = this.getOwnArmy();
    if (army.length === 0) return;

    this._scoutSent = true;
    const scout = army[0];
    // Send to nearest opponent base area
    const opponents = this._getOpponentFactions();
    if (opponents.length === 0) return;
    const oppBase = this.scene.getMainBase(opponents[0]);
    if (!oppBase) return;
    // Don't walk straight to base — explore perimeter
    const angle = Math.random() * Math.PI * 2;
    const scoutX = oppBase.x + Math.cos(angle) * 500;
    const scoutY = oppBase.y + Math.sin(angle) * 500;
    scout.setMoveTarget(scoutX, scoutY);
  }

  // === WORKER HARASSMENT: occasionally send small group to enemy workers ===
  _tickHarassment() {
    if (this.intent !== 'attacking' && this.intent !== 'massing') return;
    if (this._lastHarass && this.scene.time.now - this._lastHarass < 25000) return;
    if (Math.random() > 0.3) return; // 30% chance per tick

    const opponents = this._getOpponentFactions();
    if (opponents.length === 0) return;

    // Find enemy workers
    const targetFaction = opponents[Math.floor(Math.random() * opponents.length)];
    const enemyWorkers = this.scene.units.filter(
      (u) => !u.dead && u.factionId === targetFaction && u.isWorker
    );
    if (enemyWorkers.length === 0) return;

    // Detach 1-2 units as harassment squad
    const available = this.wave.filter((u) => !u.dead && u.category !== 'ranged');
    if (available.length < 4) return; // don't harass if army too small
    const harassCount = Math.min(2, Math.floor(available.length * 0.2));
    const squad = available.slice(0, harassCount);
    const targetWorker = enemyWorkers[Math.floor(Math.random() * enemyWorkers.length)];

    for (const u of squad) {
      u.setAttackTarget(targetWorker);
      this.wave = this.wave.filter((w) => w !== u); // detach from main wave
    }
    this._lastHarass = this.scene.time.now;
  }

  // === FORMATION: melee front, ranged behind ===
  _microFormation() {
    if (this.intent !== 'attacking' || !this.waveTarget) return;
    const target = this.waveTarget;
    for (const u of this.wave) {
      if (u.dead || !u.attackTarget) continue;
      if (u.category === 'ranged') {
        // Ranged should stay behind melee — if closer to target than nearest melee, back off
        const myDist = Phaser.Math.Distance.Between(u.x, u.y, target.x, target.y);
        const meleeInFront = this.wave.some(
          (m) => !m.dead && m.category !== 'ranged' && m !== u
            && Phaser.Math.Distance.Between(m.x, m.y, target.x, target.y) < myDist - 30
        );
        if (!meleeInFront && myDist < u.getAttackRange() * 0.8) {
          // No melee in front — hold position, don't advance further
          const dx = u.x - target.x;
          const dy = u.y - target.y;
          const d = Math.hypot(dx, dy) || 1;
          u.setMoveTarget(u.x + (dx / d) * 20, u.y + (dy / d) * 20);
        }
      }
    }
  }

  // === SMART TARGETING: prioritize ranged/healers over melee ===
  _microSmartTargeting() {
    if (this.intent !== 'attacking') return;
    for (const u of this.wave) {
      if (u.dead || u._attackAnimActive) continue;
      if (!u.attackTarget || u.attackTarget.dead) continue;
      // Check if there's a higher-priority target nearby
      const range = Math.max(u.getAttackRange(), 150);
      const nearby = this.scene.units.filter(
        (e) => !e.dead && e.factionId !== this.factionId
          && Phaser.Math.Distance.Between(u.x, u.y, e.x, e.y) < range
      );
      if (nearby.length === 0) continue;
      // Priority: ranged > worker > melee. Pick highest priority
      const prioritized = nearby.sort((a, b) => {
        const pa = a.category === 'ranged' ? 0 : a.isWorker ? 1 : a.isHero ? 3 : 2;
        const pb = b.category === 'ranged' ? 0 : b.isWorker ? 1 : b.isHero ? 3 : 2;
        return pa - pb;
      });
      const best = prioritized[0];
      if (best && u.attackTarget !== best) {
        u.setAttackTarget(best);
      }
    }
  }

  // === FLANKING: split army into 2 groups, attack from different angles ===
  _tickFlanking() {
    if (this.intent !== 'attacking') return;
    if (this._flankExecuted) return;
    if (this.wave.length < 8) return; // need decent army to flank

    this._flankExecuted = true;
    const target = this.waveTarget;
    if (!target) return;

    // Split wave: 60% main, 40% flank
    const splitIdx = Math.floor(this.wave.length * 0.6);
    const mainGroup = this.wave.slice(0, splitIdx);
    const flankGroup = this.wave.slice(splitIdx);

    // Flank group goes around to the side
    const dx = target.x - (this.rallyPoint?.x ?? 0);
    const dy = target.y - (this.rallyPoint?.y ?? 0);
    const perpX = -dy;
    const perpY = dx;
    const perpLen = Math.hypot(perpX, perpY) || 1;
    const flankOffset = 350;
    const flankX = target.x + (perpX / perpLen) * flankOffset;
    const flankY = target.y + (perpY / perpLen) * flankOffset;

    for (const u of flankGroup) {
      if (!u.dead) {
        // Move to flank position first, then attack
        u.setMoveTarget(flankX + (Math.random() - 0.5) * 60, flankY + (Math.random() - 0.5) * 60);
        // Delayed attack command
        this.scene.time.delayedCall(3000, () => {
          if (!u.dead && target && !target.dead) u.setAttackTarget(target);
        });
      }
    }
  }

  // === PATROL: idle units patrol key map points ===
  _tickPatrol() {
    if (this.intent !== 'economy' && this.intent !== 'massing') return;
    if (this._lastPatrol && this.scene.time.now - this._lastPatrol < 10000) return;

    // Assign idle army units to patrol between base and center
    const idleArmy = this.wave.filter((u) => !u.dead && u.orderType === 'idle');
    if (idleArmy.length === 0) return;

    this._lastPatrol = this.scene.time.now;
    const tc = this.scene.getMainBase(this.factionId);
    if (!tc) return;
    const cx = this.scene.worldWidth / 2;
    const cy = this.scene.worldHeight / 2;
    const patrolX = (tc.x + cx) / 2 + (Math.random() - 0.5) * 200;
    const patrolY = (tc.y + cy) / 2 + (Math.random() - 0.5) * 200;

    for (const u of idleArmy.slice(0, 3)) {
      u.setMoveTarget(patrolX + (Math.random() - 0.5) * 80, patrolY + (Math.random() - 0.5) * 80);
    }
  }

  // === EXPANSION: build second TC at distant resource ===
  _tickExpansion() {
    if (this._expansionAttempted) return;
    const workers = this.getOwnWorkers();
    if (workers.length < 8) return; // need stable eco first
    const resources = this.scene.resourceSystem.getResources(this.factionId);
    if (resources.food < 400 || resources.gold < 300) return; // need surplus

    // Find distant unoccupied resource node
    const tc = this.scene.getMainBase(this.factionId);
    if (!tc) return;
    const farNodes = this.scene.resourceNodes.filter(
      (n) => !n.dead && !n.depleted && n.assigned.size < 2
        && Phaser.Math.Distance.Between(n.x, n.y, tc.x, tc.y) > 800
    );
    if (farNodes.length === 0) return;

    // Build house near far resource (expansion marker)
    const node = farNodes[0];
    const pos = this._findBuildSpotNear(node.x, node.y, 'house');
    if (!pos) return;

    const cost = this.scene.applyFactionCost(
      BUILDING_TYPES.house?.cost ?? { food: 60, gold: 0 },
      this.scene.getFaction(this.factionId),
      true
    );
    if (!this.scene.resourceSystem.spend(this.factionId, cost)) return;

    this._expansionAttempted = true;
    const faction = this.scene.getFaction(this.factionId);
    const building = this.scene.spawnBuilding('house', this.factionId, pos.x, pos.y, {
      side: 'right', factionColor: faction.accent, underConstruction: true,
    });
    const worker = this.idleWorker();
    if (worker) worker.setBuildTarget(building);
  }

  _findBuildSpotNear(cx, cy, buildingTypeId) {
    for (let ring = 1; ring <= 3; ring += 1) {
      const radius = 80 + ring * 50;
      for (let a = 0; a < 8; a += 1) {
        const angle = (a / 8) * Math.PI * 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (this.scene.isPlacementValid(buildingTypeId, x, y)) return { x, y };
      }
    }
    return null;
  }

  // === BAITING: send 1 unit forward to lure enemy out ===
  _tickBaiting() {
    if (this.intent !== 'massing') return;
    if (this._baitSent) return;
    if (this.wave.length < 6) return;
    if (Math.random() > 0.2) return; // 20% chance per tick

    this._baitSent = true;
    const baitUnit = this.wave.find((u) => !u.dead && u.category !== 'ranged');
    if (!baitUnit) return;

    const opponents = this._getOpponentFactions();
    if (opponents.length === 0) return;
    const oppBase = this.scene.getMainBase(opponents[0]);
    if (!oppBase) return;

    // Send bait toward enemy, then retreat after 4 seconds
    const baitX = (this.rallyPoint?.x ?? baitUnit.x) * 0.4 + oppBase.x * 0.6;
    const baitY = (this.rallyPoint?.y ?? baitUnit.y) * 0.4 + oppBase.y * 0.6;
    baitUnit.setMoveTarget(baitX, baitY);

    this.scene.time.delayedCall(4000, () => {
      if (!baitUnit.dead && this.rallyPoint) {
        baitUnit.setMoveTarget(this.rallyPoint.x, this.rallyPoint.y);
      }
    });
  }

  // === HIT AND RUN: quick strike then retreat ===
  _tickHitAndRun() {
    if (this.intent !== 'attacking') return;
    if (this.wave.length < 4 || this.wave.length > 8) return; // only with small-medium army
    if (this._hitAndRunCooldown && this.scene.time.now < this._hitAndRunCooldown) return;

    // If we've been attacking for a while and lost 40%+, retreat
    const aliveRatio = this.wave.length / (this.nextWaveThreshold || 10);
    if (aliveRatio < 0.6 && this.rallyPoint) {
      for (const u of this.wave) {
        if (!u.dead) u.setMoveTarget(
          this.rallyPoint.x + (Math.random() - 0.5) * 60,
          this.rallyPoint.y + (Math.random() - 0.5) * 60
        );
      }
      this.intent = 'massing';
      this.waveTarget = null;
      this._hitAndRunCooldown = this.scene.time.now + 15000;
    }
  }

  // === RESOURCE DENIAL: target enemy resource nodes/workers ===
  _tickResourceDenial() {
    if (this.intent !== 'attacking') return;
    if (this._lastDenial && this.scene.time.now - this._lastDenial < 30000) return;
    if (Math.random() > 0.25) return;

    const opponents = this._getOpponentFactions();
    if (opponents.length === 0) return;
    const targetFid = opponents[Math.floor(Math.random() * opponents.length)];

    // Find enemy resource nodes with workers on them
    const busyNodes = this.scene.resourceNodes.filter(
      (n) => !n.dead && n.assigned.size > 0
        && [...n.assigned].some((w) => w.factionId === targetFid)
    );
    if (busyNodes.length === 0) return;

    const available = this.wave.filter((u) => !u.dead);
    if (available.length < 5) return;
    const raidSize = Math.min(3, Math.floor(available.length * 0.25));
    const raid = available.slice(0, raidSize);
    const node = busyNodes[Math.floor(Math.random() * busyNodes.length)];

    // Send raid to the node area — they'll auto-engage workers
    for (const u of raid) {
      const worker = [...node.assigned].find((w) => w.factionId === targetFid && !w.dead);
      if (worker) u.setAttackTarget(worker);
      else u.setMoveTarget(node.x, node.y);
      this.wave = this.wave.filter((w) => w !== u);
    }
    this._lastDenial = this.scene.time.now;
  }

  // === COUNTER TIMING: attack when enemy army is away from their base ===
  _tickCounterTiming() {
    if (this.intent !== 'massing') return;
    if (this.wave.length < this.firstWaveThreshold * 0.8) return;

    const opponents = this._getOpponentFactions();
    for (const oppId of opponents) {
      const oppBase = this.scene.getMainBase(oppId);
      if (!oppBase) continue;
      const oppArmy = this.scene.units.filter(
        (u) => !u.dead && u.factionId === oppId && !u.isWorker && !u.isHero
      );
      // Check if enemy army is far from their base
      const nearBase = oppArmy.filter(
        (u) => Phaser.Math.Distance.Between(u.x, u.y, oppBase.x, oppBase.y) < 600
      );
      const awayRatio = oppArmy.length > 0 ? 1 - (nearBase.length / oppArmy.length) : 0;
      if (awayRatio > 0.6 && oppArmy.length >= 4) {
        // Enemy base is exposed! Rush now even if below threshold
        const hero = this.scene.units.find((u) => u.isHero && u.factionId === this.factionId && !u.dead);
        this._launchWave(this.wave, hero);
        this.intent = 'attacking';
        return;
      }
    }
  }

  // === FORWARD TOWER: build tower near enemy as pressure ===
  _tickForwardTower() {
    if (this._forwardTowerBuilt) return;
    if (this.wave.length < 6) return;
    const resources = this.scene.resourceSystem.getResources(this.factionId);
    if (resources.food < 200 || resources.gold < 150) return;

    const opponents = this._getOpponentFactions();
    if (opponents.length === 0) return;
    const oppBase = this.scene.getMainBase(opponents[0]);
    const myBase = this.scene.getMainBase(this.factionId);
    if (!oppBase || !myBase) return;

    // Midpoint between bases
    const midX = (myBase.x + oppBase.x) / 2;
    const midY = (myBase.y + oppBase.y) / 2;

    // Check if we have a tower building type. Use 'barracks' as forward presence
    const buildId = 'barracks';
    const type = BUILDING_TYPES[buildId];
    if (!type?.buildable) return;
    const cost = this.scene.applyFactionCost(type.cost, this.scene.getFaction(this.factionId), true);
    if (!this.scene.resourceSystem.canAfford(this.factionId, cost)) return;

    const pos = this._findBuildSpotNear(midX, midY, buildId);
    if (!pos) return;
    if (!this.scene.resourceSystem.spend(this.factionId, cost)) return;

    this._forwardTowerBuilt = true;
    const faction = this.scene.getFaction(this.factionId);
    const building = this.scene.spawnBuilding(buildId, this.factionId, pos.x, pos.y, {
      side: 'right', factionColor: faction.accent, underConstruction: true,
    });
    const worker = this.idleWorker();
    if (worker) worker.setBuildTarget(building);
  }

  // === THREE-WAY POLITICS ===
  _tickThreeWayPolitics() {
    const opponents = this._getOpponentFactions();
    if (opponents.length < 2) return; // only relevant in 3-way

    // Evaluate opponent strengths
    const strengths = {};
    for (const fid of opponents) {
      const army = this.scene.units.filter((u) => !u.dead && u.factionId === fid && !u.isWorker).length;
      const buildings = this.scene.buildings.filter((b) => !b.dead && b.factionId === fid).length;
      strengths[fid] = army * 2 + buildings;
    }

    // Sort opponents by strength
    const sorted = opponents.sort((a, b) => strengths[a] - strengths[b]);
    const weakest = sorted[0];
    const strongest = sorted[sorted.length - 1];

    // OPPORTUNISM: if two enemies are fighting each other, attack the one losing
    const fighting = opponents.filter((fid) => {
      const theirArmy = this.scene.units.filter((u) => !u.dead && u.factionId === fid && !u.isWorker);
      const inCombat = theirArmy.filter((u) => u.orderType === 'attack').length;
      return inCombat > theirArmy.length * 0.5;
    });
    if (fighting.length >= 2) {
      // Both enemies fighting! Attack the weaker one (어부지리)
      this._preferredTarget = weakest;
    } else if (strengths[strongest] > strengths[weakest] * 2) {
      // One is much stronger — gang up on the strong one (밸런스 정치)
      this._preferredTarget = strongest;
    } else {
      // Default: attack weaker opponent (easier win)
      this._preferredTarget = weakest;
    }
  }

  _launchWave(units, hero) {
    const target = this._pickAttackTarget();
    if (!target) return;
    this.waveTarget = target;
    for (const u of units) {
      if (!u.dead) u.setAttackTarget(target);
    }
    if (hero && !hero.dead) hero.setAttackTarget(target);
  }

  // Called each tick during attacking — retarget if current target dead
  _retargetWave() {
    if (!this.waveTarget || this.waveTarget.dead) {
      const next = this._pickAttackTarget();
      if (!next) return;
      this.waveTarget = next;
      for (const u of this.wave) {
        if (!u.dead && (!u.attackTarget || u.attackTarget.dead)) {
          u.setAttackTarget(next);
        }
      }
    }
  }

  _pickAttackTarget() {
    const opponents = this._getOpponentFactions();
    if (opponents.length === 0) return null;

    // Use political target if set by _tickThreeWayPolitics, else pick weakest
    let targetFaction = this._preferredTarget || opponents[0];
    if (!opponents.includes(targetFaction)) targetFaction = opponents[0];
    // Fallback: pick weakest if no political preference
    if (!this._preferredTarget) {
      let minArmy = Infinity;
      for (const fid of opponents) {
        const count = this.scene.units.filter((u) => !u.dead && u.factionId === fid && !u.isWorker).length;
        if (count < minArmy) { minArmy = count; targetFaction = fid; }
      }
    }

    // Wave centroid for proximity checks
    const cx = this.wave.length > 0
      ? this.wave.reduce((s, u) => s + u.x, 0) / this.wave.length
      : (this.rallyPoint?.x ?? this.scene.worldWidth / 2);
    const cy = this.wave.length > 0
      ? this.wave.reduce((s, u) => s + u.y, 0) / this.wave.length
      : (this.rallyPoint?.y ?? this.scene.worldHeight / 2);

    // Priority 1: Enemy army units near our wave (engage first!)
    const nearbyEnemyUnits = this.scene.units.filter(
      (u) => !u.dead && u.factionId === targetFaction && !u.isWorker
        && Phaser.Math.Distance.Between(u.x, u.y, cx, cy) < 600
    );
    if (nearbyEnemyUnits.length > 0) {
      // Target closest enemy unit
      nearbyEnemyUnits.sort((a, b) =>
        Phaser.Math.Distance.Between(a.x, a.y, cx, cy) - Phaser.Math.Distance.Between(b.x, b.y, cx, cy)
      );
      return nearbyEnemyUnits[0];
    }

    // Priority 2: Enemy production/economy buildings (NOT TC)
    const enemyBuildings = this.scene.buildings.filter(
      (b) => !b.dead && b.factionId === targetFaction && !b.isMainBase
    );
    if (enemyBuildings.length > 0) {
      enemyBuildings.sort((a, b) =>
        Phaser.Math.Distance.Between(a.x, a.y, cx, cy) - Phaser.Math.Distance.Between(b.x, b.y, cx, cy)
      );
      return enemyBuildings[0];
    }

    // Priority 3: Enemy workers
    const enemyWorkers = this.scene.units.filter(
      (u) => !u.dead && u.factionId === targetFaction && u.isWorker
    );
    if (enemyWorkers.length > 0) {
      return enemyWorkers[0];
    }

    // Priority 4 (last resort): Enemy TC
    const enemyBase = this.scene.getMainBase(targetFaction);
    return enemyBase;
  }

  _getOpponentFactions() {
    const all = this.scene.getActiveFactionIds?.()
      ?? [this.scene.playerFactionId, ...(this.scene.enemyFactionIds || [])].filter(Boolean);
    return all.filter((id) => id !== this.factionId);
  }
}
