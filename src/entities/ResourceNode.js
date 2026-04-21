import Phaser from '../phaser.js';

export default class ResourceNode extends Phaser.GameObjects.Container {
  constructor(scene, config) {
    super(scene, config.x, config.y);
    this.scene = scene;
    this.nodeType = config.nodeType; // 'food' | 'gold'
    this.resourceType = this.nodeType;
    this.remaining = config.remaining ?? (this.nodeType === 'gold' ? 1200 : Infinity);
    this.harvestAmount = config.harvestAmount ?? (this.nodeType === 'gold' ? 8 : 10);
    this.harvestTime = config.harvestTime ?? (this.nodeType === 'gold' ? 2.4 : 1.8);
    this.maxSlots = config.maxSlots ?? (this.nodeType === 'gold' ? 3 : 8);
    this.assigned = new Set();
    this.depleted = false;
    this.factionId = null; // resource nodes are neutral
    this.dead = false;
    this.selected = false;

    const size = this.nodeType === 'gold' ? { w: 90, h: 80 } : { w: 160, h: 110 };
    this.widthValue = size.w;
    this.heightValue = size.h;

    // Try TS assets first, then procedural fallback
    const tsKey = this.nodeType === 'gold' ? 'ts_goldmine' : 'ts_wheat';
    const procKey = this.nodeType === 'gold' ? 'node_goldMine' : 'node_farmZone';
    const useTS = scene.textures.exists(tsKey);
    const hasTexture = useTS || scene.textures.exists(procKey);
    const texKey = useTS ? tsKey : procKey;
    const body = hasTexture
      ? scene.add.sprite(0, 0, texKey).setDisplaySize(size.w, size.h)
      : scene.add.rectangle(0, 0, size.w, size.h, this.nodeType === 'gold' ? 0x8a7b4b : 0x6fae55, 0.9);
    this.bodyShape = body;

    const label = scene.add.text(0, size.h * 0.55, this._labelText(), {
      fontFamily: 'Verdana, sans-serif',
      fontSize: '11px',
      color: '#f4ecd8',
      stroke: '#08111d',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);
    this.label = label;

    this.add([body, label]);
    this.setSize(size.w, size.h);
    this.setDepth(this.y - (this.nodeType === 'gold' ? 4 : 10));
    scene.add.existing(this);
  }

  _labelText() {
    if (this.nodeType === 'food') {
      return `Farm (${this.assigned.size}/${this.maxSlots})`;
    }
    const r = Number.isFinite(this.remaining) ? Math.max(0, Math.floor(this.remaining)) : '∞';
    return `Mine ${r} (${this.assigned.size}/${this.maxSlots})`;
  }

  refreshLabel() {
    this.label.setText(this._labelText());
  }

  canAssign() {
    return !this.depleted && this.assigned.size < this.maxSlots;
  }

  assignWorker(worker) {
    this.assigned.add(worker);
    this.refreshLabel();
  }

  releaseWorker(worker) {
    this.assigned.delete(worker);
    this.refreshLabel();
  }

  takeHarvest() {
    if (this.depleted) return 0;
    const give = Math.min(this.harvestAmount, Number.isFinite(this.remaining) ? this.remaining : this.harvestAmount);
    if (Number.isFinite(this.remaining)) {
      this.remaining -= give;
      if (this.remaining <= 0) {
        this.remaining = 0;
        this.depleted = true;
      }
    }
    this.refreshLabel();
    if (this.depleted) {
      this._fadeOut();
    }
    return give;
  }

  _fadeOut() {
    for (const worker of this.assigned) {
      if (worker.onResourceNodeDepleted) worker.onResourceNodeDepleted(this);
    }
    this.assigned.clear();
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 600,
      onComplete: () => {
        this.destroy();
      },
    });
    this.dead = true;
    this.scene.removeResourceNode?.(this);
  }

  getHarvestPoint(fromX, fromY) {
    const dx = fromX - this.x;
    const dy = fromY - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const r = Math.min(this.widthValue, this.heightValue) * 0.42;
    return {
      x: this.x + (dx / d) * r,
      y: this.y + (dy / d) * r,
    };
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

  setSelected() {
    // neutral nodes not selectable
  }
}
