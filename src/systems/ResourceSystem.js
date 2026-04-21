import { UNIT_TYPES } from '../data/units.js';

export default class ResourceSystem {
  constructor(scene) {
    this.scene = scene;
    this.state = new Map();
  }

  resetFaction(factionId, startingResources) {
    this.state.set(factionId, {
      food: startingResources.food,
      gold: startingResources.gold,
      supplyUsed: 0,
      supplyCap: 0,
    });
  }

  clear() {
    this.state.clear();
  }

  getResources(factionId) {
    if (!this.state.has(factionId)) {
      this.state.set(factionId, { food: 0, gold: 0, supplyUsed: 0, supplyCap: 0 });
    }
    return this.state.get(factionId);
  }

  add(factionId, delta) {
    const s = this.getResources(factionId);
    s.food += delta.food ?? 0;
    s.gold += delta.gold ?? 0;
  }

  deposit(factionId, type, amount) {
    const s = this.getResources(factionId);
    const faction = this.scene.getFaction?.(factionId);
    const mult = faction?.economy?.harvestRateMultiplier ?? 1;
    const adjusted = amount * mult;
    if (type === 'food') s.food += adjusted;
    else if (type === 'gold') s.gold += adjusted;
  }

  canAfford(factionId, cost) {
    // Refresh supply count first so queued production is considered.
    this.recomputeSupply(factionId);
    const s = this.getResources(factionId);
    const needSupply = cost.supply ?? 0;
    return (
      s.food >= (cost.food ?? 0) &&
      s.gold >= (cost.gold ?? 0) &&
      s.supplyUsed + needSupply <= s.supplyCap
    );
  }

  spend(factionId, cost) {
    if (!this.canAfford(factionId, cost)) return false;
    const s = this.getResources(factionId);
    s.food -= cost.food ?? 0;
    s.gold -= cost.gold ?? 0;
    return true;
  }

  recomputeSupply(factionId) {
    const s = this.getResources(factionId);
    let used = 0;
    let cap = 0;
    for (const unit of this.scene.units) {
      if (!unit.dead && unit.factionId === factionId) {
        used += unit.supplyCost ?? 1;
      }
    }
    for (const b of this.scene.buildings) {
      if (b.dead || b.factionId !== factionId) continue;
      if (!b.underConstruction) cap += b.supplyProvided ?? 0;
      // Reserve supply for queued + active production so canAfford can't be bypassed.
      if (b.activeProduction) used += this._supplyCostOf(b.activeProduction.unitTypeId);
      for (const order of b.productionQueue) {
        used += this._supplyCostOf(order.unitTypeId);
      }
    }
    s.supplyUsed = used;
    s.supplyCap = cap;
  }

  _supplyCostOf(unitTypeId) {
    return UNIT_TYPES[unitTypeId]?.cost?.supply ?? 1;
  }

  update() {
    for (const factionId of this.state.keys()) {
      this.recomputeSupply(factionId);
    }
  }
}
