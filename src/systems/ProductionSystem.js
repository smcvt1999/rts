import { UNIT_TYPES } from '../data/units.js';

export default class ProductionSystem {
  constructor(scene) {
    this.scene = scene;
  }

  queueUnit(building, unitTypeId) {
    if (!building || building.dead) {
      return false;
    }

    if (!building.canProduce(unitTypeId)) {
      return false;
    }

    if (building.underConstruction) {
      if (building.factionId === this.scene.playerFactionId) {
        this.scene.showToast('Cannot produce while under construction');
      }
      return false;
    }

    const unitDef = UNIT_TYPES[unitTypeId];
    const faction = this.scene.getFaction(building.factionId);
    if (!unitDef || !faction) {
      return false;
    }

    const cost = this.scene.applyFactionCost(unitDef.cost, faction);
    if (!this.scene.resourceSystem.spend(faction.id, cost)) {
      if (faction.id === this.scene.playerFactionId) {
        this.scene.showToast('Not enough resources');
      }
      return false;
    }

    const buildTime = unitDef.buildTime / faction.modifiers.productionSpeedMultiplier;
    building.queueProduction({
      unitTypeId,
      shortName: unitDef.shortName,
      remaining: buildTime,
      total: buildTime,
    });

    if (faction.id === this.scene.playerFactionId) {
      this.scene.showToast(`${building.displayName}: Training ${unitDef.name}`);
    }
    return true;
  }

  update(dt) {
    for (const building of [...this.scene.buildings]) {
      if (building.dead || building.underConstruction || !building.buildingType.produces.length) {
        continue;
      }

      if (!building.activeProduction && building.productionQueue.length > 0) {
        building.popProduction();
      }

      if (!building.activeProduction) {
        continue;
      }

      building.activeProduction.remaining -= dt;
      building.updateQueueLabel();

      if (building.activeProduction.remaining <= 0) {
        const order = building.activeProduction;
        building.activeProduction = null;
        building.updateQueueLabel();
        this.scene.spawnUnitFromProduction(building, order.unitTypeId);
        if (building.productionQueue.length > 0) {
          building.popProduction();
        }
      }
    }
  }
}
