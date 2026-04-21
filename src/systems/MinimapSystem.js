import Phaser from '../phaser.js';

export default class MinimapSystem {
  constructor(scene, x, y, width, height) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;

    const worldW = scene.worldWidth;
    const worldH = scene.worldHeight;
    this.scaleX = width / worldW;
    this.scaleY = height / worldH;

    // Panel frame (Chinese-styled)
    this.bg = scene.add.rectangle(x, y, width + 8, height + 8, 0x0c1420, 0.92)
      .setStrokeStyle(2, 0xd4a23a, 0.9)
      .setScrollFactor(0)
      .setDepth(10200);
    this.inner = scene.add.rectangle(x, y, width, height, 0x1a2a1a, 1)
      .setScrollFactor(0)
      .setDepth(10201);

    this.graphics = scene.add.graphics()
      .setScrollFactor(0)
      .setDepth(10202);

    // Interactive overlay for clicks
    this.hitArea = scene.add.rectangle(x, y, width, height, 0xffffff, 0)
      .setScrollFactor(0)
      .setDepth(10203)
      .setInteractive();
    this.hitArea.isUiElement = true;
    this.bg.isUiElement = true;
    this.inner.isUiElement = true;

    this.hitArea.on('pointerdown', (pointer) => this._handleClick(pointer));
    this.hitArea.on('pointermove', (pointer) => {
      if (pointer.isDown && pointer.leftButtonDown()) this._handleClick(pointer);
    });

    this.left = x - width / 2;
    this.top = y - height / 2;
  }

  _handleClick(pointer) {
    const localX = Phaser.Math.Clamp(pointer.x - this.left, 0, this.width);
    const localY = Phaser.Math.Clamp(pointer.y - this.top, 0, this.height);
    const worldX = localX / this.scaleX;
    const worldY = localY / this.scaleY;
    this.scene.cameras.main.centerOn(worldX, worldY);
    if (this.scene.clampCamera) this.scene.clampCamera();
  }

  isPointerOver(pointer) {
    return (
      pointer.x >= this.left && pointer.x <= this.left + this.width &&
      pointer.y >= this.top && pointer.y <= this.top + this.height
    );
  }

  update() {
    const g = this.graphics;
    g.clear();

    const toMap = (wx, wy) => ({
      mx: this.left + wx * this.scaleX,
      my: this.top + wy * this.scaleY,
    });

    // Terrain — draw once via bake if not yet
    if (!this._terrainBaked && this.scene.terrainMap) {
      this._terrainBaked = true;
      this._terrainGraphics = this.scene.add.graphics()
        .setScrollFactor(0).setDepth(10201);
      const tg = this._terrainGraphics;
      const tm = this.scene.terrainMap;
      const tsX = tm.tileSize * this.scaleX;
      const tsY = tm.tileSize * this.scaleY;
      for (let r = 0; r < tm.rows; r += 1) {
        for (let c = 0; c < tm.cols; c += 1) {
          const t = tm.get(c, r);
          let color = null;
          if (t === 99) color = 0x2a6a8a; // water
          else if (t === 2) color = 0x264a26; // forest
          else if (t === 0) color = 0x3a3a32; // cliff
          else if (t === 7) color = 0x8a6a44; // bridge
          if (color !== null) {
            tg.fillStyle(color, 0.8);
            tg.fillRect(this.left + c * tsX, this.top + r * tsY, tsX + 1, tsY + 1);
          }
        }
      }
    }

    // Resource nodes
    for (const n of this.scene.resourceNodes || []) {
      if (n.dead) continue;
      const p = toMap(n.x, n.y);
      const color = n.nodeType === 'gold' ? 0xf2d24f : 0x8ad060;
      g.fillStyle(color, 0.95);
      g.fillRect(p.mx - 1.5, p.my - 1.5, 3, 3);
    }

    // Buildings
    for (const b of this.scene.buildings || []) {
      if (b.dead) continue;
      const p = toMap(b.x, b.y);
      const faction = this.scene.getFaction(b.factionId);
      const color = faction ? faction.color : 0x888888;
      g.fillStyle(color, b.underConstruction ? 0.5 : 1);
      const sz = b.isMainBase ? 6 : 4;
      g.fillRect(p.mx - sz / 2, p.my - sz / 2, sz, sz);
      g.lineStyle(1, 0x0b1520, 0.9);
      g.strokeRect(p.mx - sz / 2, p.my - sz / 2, sz, sz);
    }

    // Units
    for (const u of this.scene.units || []) {
      if (u.dead) continue;
      const p = toMap(u.x, u.y);
      const faction = this.scene.getFaction(u.factionId);
      const color = faction ? faction.color : 0xffffff;
      g.fillStyle(color, 1);
      const r = u.isHero ? 2 : 1.4;
      g.fillCircle(p.mx, p.my, r);
    }

    // Camera viewport rectangle
    const cam = this.scene.cameras.main;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const vx = this.left + cam.scrollX * this.scaleX;
    const vy = this.top + cam.scrollY * this.scaleY;
    const vw = viewW * this.scaleX;
    const vh = viewH * this.scaleY;
    g.lineStyle(1.5, 0xfff2b0, 0.9);
    g.strokeRect(vx, vy, vw, vh);
  }
}
