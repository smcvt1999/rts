import Phaser from '../phaser.js';
import { BUILDING_PRODUCTION } from '../data/units.js';

export const BUILDING_TYPES = {
  townCenter: {
    id: 'townCenter',
    name: 'Castle',
    shortName: 'TC',
    size: { width: 104, height: 84 },
    hp: 1700,
    armor: 2,
    fill: 0x6b7fa6,
    accent: 0xe8cf8a,
    produces: BUILDING_PRODUCTION.townCenter,
    supplyProvided: 10,
    acceptsDeposit: true,
    cost: { food: 0, gold: 0 },
    description: 'Trains peasants and accepts resource deposits',
  },
  house: {
    id: 'house',
    name: 'House',
    shortName: 'H',
    size: { width: 54, height: 46 },
    hp: 380,
    armor: 0,
    fill: 0xa8906c,
    accent: 0xe8d3a6,
    produces: [],
    supplyProvided: 8,
    cost: { food: 60, gold: 0 },
    buildTime: 10,
    buildable: true,
    description: 'Increases supply cap by 8',
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    shortName: 'BK',
    size: { width: 76, height: 58 },
    hp: 820,
    armor: 1,
    fill: 0x915e42,
    accent: 0xf0c49a,
    produces: BUILDING_PRODUCTION.barracks,
    cost: { food: 120, gold: 60 },
    buildTime: 18,
    buildable: true,
    description: 'Trains Warriors and Lancers',
  },
  archeryRange: {
    id: 'archeryRange',
    name: 'Archery',
    shortName: 'AR',
    size: { width: 76, height: 58 },
    hp: 760,
    armor: 1,
    fill: 0x5f89ab,
    accent: 0xd7edf8,
    produces: BUILDING_PRODUCTION.archeryRange,
    cost: { food: 100, gold: 90 },
    buildTime: 20,
    buildable: true,
    description: 'Trains Archers',
  },
  monastery: {
    id: 'monastery',
    name: 'Monastery',
    shortName: 'MO',
    size: { width: 76, height: 58 },
    hp: 790,
    armor: 1,
    fill: 0xa2714c,
    accent: 0xf5d3b0,
    produces: BUILDING_PRODUCTION.monastery,
    cost: { food: 140, gold: 120 },
    buildTime: 22,
    buildable: true,
    description: 'Trains Monks for healing support',
  },
};

export const BUILDABLE_ORDER = ['house', 'barracks', 'archeryRange', 'monastery'];

export default class Building extends Phaser.GameObjects.Container {
  constructor(scene, config) {
    const type = BUILDING_TYPES[config.buildingTypeId];
    const width = type.size.width;
    const height = type.size.height;

    super(scene, config.x, config.y);

    this.scene = scene;
    this.factionId = config.factionId;
    this.buildingTypeId = config.buildingTypeId;
    this.buildingType = type;
    this.displayName = type.name;
    this.side = config.side || 'left';
    this.maxHp = Math.round(type.hp * (config.hpMultiplier ?? 1));
    this.armor = type.armor ?? 0;
    this.isMainBase = this.buildingTypeId === 'townCenter';
    this.dead = false;
    this.selected = false;
    this.productionQueue = [];
    this.activeProduction = null;
    this.productionSpeedMultiplier = config.productionSpeedMultiplier ?? 1;
    this.supplyProvided = type.supplyProvided ?? 0;
    this.acceptsDeposit = Boolean(type.acceptsDeposit);
    this.rallyPoint = config.rallyPoint || null;
    this.underConstruction = Boolean(config.underConstruction);
    this.buildTime = type.buildTime ?? 0;
    this.buildProgress = this.underConstruction ? 0 : this.buildTime;
    this.builders = new Set();
    this.hp = this.underConstruction ? Math.max(1, Math.round(this.maxHp * 0.1)) : this.maxHp;

    const shadow = scene.add.ellipse(0, height * 0.42, width * 0.95, height * 0.42, 0x000000, 0.26);

    // Try Tiny Swords building image, then procedural fallback
    // Free Pack has proper building types!
    const fpBMap = { townCenter: 'castle', house: 'house', barracks: 'barracks', archeryRange: 'archery', monastery: 'monastery' };
    const fpType = fpBMap[config.buildingTypeId];
    const fpKey = fpType ? `fp_${fpType}_${config.factionId}` : null;
    const hasTS = fpKey && scene.textures.exists(fpKey);

    const textureKey = `building_${config.buildingTypeId}`;
    const hasTexture = scene.textures.exists(textureKey);
    let body;
    if (hasTS) {
      body = scene.add.sprite(0, -height * 0.12, fpKey);
      body.setDisplaySize(width * 1.6, height * 1.6);
    } else if (hasTexture) {
      body = scene.add.sprite(0, 0, textureKey).setDisplaySize(width * 1.25, height * 1.35);
    } else {
      body = scene.add.rectangle(0, 0, width, height, type.fill, 1);
    }
    if (!hasTS && !hasTexture && body.setStrokeStyle) {
      body.setStrokeStyle(3, config.strokeColor ?? 0xffffff, 0.88);
    }
    body.displayWidthValue = width;

    const accent = scene.add.rectangle(0, -height * 0.12, 0, 0, type.accent, 0);
    const roof = scene.add.rectangle(0, -height * 0.42, 0, 0, type.accent, 0);
    const selection = scene.add.rectangle(0, 0, width + 12, height + 12).setStrokeStyle(2, 0xffe47a, 0.95);
    selection.setVisible(false);
    const hpBg = scene.add.rectangle(0, -height * 0.72, width + 8, 5, 0x16212e, 0.95);
    const hpFill = scene.add.rectangle(-(width + 8) / 2, -height * 0.72, width + 8, 5, 0x7bd36a, 0.95);
    hpFill.setOrigin(0, 0.5);
    const nameLabel = scene.add.text(0, height * 0.62, type.name, {
      fontFamily: 'Verdana, sans-serif',
      fontSize: '11px',
      color: '#f7f0e1',
      stroke: '#08111d',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);
    const queueLabel = scene.add.text(width * 0.33, -height * 0.72, '', {
      fontFamily: 'Verdana, sans-serif',
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#08111d',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);
    const factionMark = scene.add.circle(-width * 0.33, height * 0.18, 10, config.factionColor ?? 0xffffff, 1);

    this.shadow = shadow;
    this.bodyShape = body;
    this.accentShape = accent;
    this.roofShape = roof;
    this.selectionShape = selection;
    this.hpBack = hpBg;
    this.hpFill = hpFill;
    this.nameLabel = nameLabel;
    this.queueLabel = queueLabel;
    this.factionMark = factionMark;
    this.widthValue = width;
    this.heightValue = height;

    this.add([shadow, body, accent, roof, selection, hpBg, hpFill, factionMark, nameLabel, queueLabel]);
    this.setSize(width, height);
    this.updateDepth();
    scene.add.existing(this);
    this.updateVisuals();
    if (this.underConstruction) {
      this._applyConstructionVisual();
    }
    // Mark terrain tiles under this building as unwalkable so units can't enter.
    if (scene.terrainMap) {
      this._footprintTiles = scene.terrainMap.occupyFootprint(config.x, config.y, width, height);
    }
  }

  _applyConstructionVisual() {
    if (this.bodyShape.setAlpha) this.bodyShape.setAlpha(0.45);
    this.nameLabel.setText(`${this.buildingType.name} (Building...)`);
  }

  _clearConstructionVisual() {
    if (this.bodyShape.setAlpha) this.bodyShape.setAlpha(1);
    this.nameLabel.setText(this.buildingType.name);
  }

  addBuilder(unit) { this.builders.add(unit); }
  removeBuilder(unit) { this.builders.delete(unit); }

  tickConstruction(dt) {
    if (!this.underConstruction || this.dead) return;
    if (this.builders.size === 0) return;
    let speedSum = 0;
    for (const b of this.builders) speedSum += b.buildSpeedMultiplier ?? 1;
    const avgSpeed = speedSum / this.builders.size;
    this.buildProgress += dt * avgSpeed;
    const ratio = Phaser.Math.Clamp(this.buildProgress / this.buildTime, 0, 1);
    this.hp = Math.max(1, Math.round(this.maxHp * (0.1 + 0.9 * ratio)));
    if (this.buildProgress >= this.buildTime) {
      this.underConstruction = false;
      this.hp = this.maxHp;
      this.buildProgress = this.buildTime;
      this._clearConstructionVisual();
      for (const b of [...this.builders]) {
        b.onConstructionFinished?.(this);
      }
      this.builders.clear();
    }
    this.updateVisuals();
  }

  setSelected(selected) {
    this.selected = selected;
    this.selectionShape.setVisible(selected);
  }

  updateDepth() {
    this.setDepth(this.y + 1);
  }

  getWorldBounds() {
    return new Phaser.Geom.Rectangle(
      this.x - this.widthValue / 2,
      this.y - this.heightValue / 2,
      this.widthValue,
      this.heightValue
    );
  }

  containsWorldPoint(x, y) {
    return Phaser.Geom.Rectangle.Contains(this.getWorldBounds(), x, y);
  }

  intersectsWorldRect(rect) {
    return Phaser.Geom.Intersects.RectangleToRectangle(this.getWorldBounds(), rect);
  }

  canProduce(unitTypeId) {
    return this.buildingType.produces.includes(unitTypeId);
  }

  queueProduction(order) {
    this.productionQueue.push(order);
    this.updateQueueLabel();
  }

  popProduction() {
    this.activeProduction = this.productionQueue.shift() || null;
    this.updateQueueLabel();
    return this.activeProduction;
  }

  clearProduction() {
    this.productionQueue.length = 0;
    this.activeProduction = null;
    this.updateQueueLabel();
  }

  getSpawnPoint() {
    const offset = this.side === 'left' ? 72 : -72;
    return {
      x: this.x + offset,
      y: this.y + (this.buildingTypeId === 'townCenter' ? 20 : 0),
    };
  }

  updateQueueLabel() {
    const active = this.activeProduction ? `${this.activeProduction.shortName || this.activeProduction.unitTypeId} ${Math.ceil(this.activeProduction.remaining)}s` : '';
    const queueSize = this.productionQueue.length;
    this.queueLabel.setText(active || (queueSize > 0 ? `Queue ${queueSize}` : ''));
  }

  updateVisuals() {
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    const w = this.widthValue + 8;
    this.hpFill.width = w * ratio;
    this.hpFill.x = -w / 2;
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

    const mitigated = Math.max(1, Math.round(amount - this.armor));
    this.hp -= mitigated;
    this.updateVisuals();
    this.scene.flashStructureHit(this);

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
    // Release terrain footprint so units can path through the rubble.
    if (this.scene.terrainMap && this._footprintTiles) {
      this.scene.terrainMap.releaseFootprint(this._footprintTiles);
      this._footprintTiles = null;
    }
    this.scene.onEntityDestroyed(this, attacker);
    this.destroy();
  }

  update(dt = 0) {
    if (this.dead) {
      return;
    }

    if (this.underConstruction && dt > 0) {
      this.tickConstruction(dt);
    }

    this.updateDepth();
    this.updateQueueLabel();
  }
}
