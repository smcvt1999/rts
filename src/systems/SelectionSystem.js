import Phaser from '../phaser.js';

export default class SelectionSystem {
  constructor(scene) {
    this.scene = scene;
    this.active = true;
    this.selected = [];
    this.dragging = false;
    this.startScreen = null;
    this.startWorld = null;
    this.pointerButton = 0;
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(2500);
  }

  setActive(active) {
    this.active = active;
    if (!active) {
      this.clear();
    }
  }

  begin(pointer) {
    if (!this.active || this.scene.matchState !== 'playing') {
      return;
    }

    this.pointerButton = pointer.button;
    this.startScreen = { x: pointer.x, y: pointer.y };
    const cam = this.scene.cameras.main;
    this.startWorld = cam.getWorldPoint(pointer.x, pointer.y);
    this.dragging = false;
  }

  update(pointer) {
    if (!this.active || this.scene.matchState !== 'playing' || !this.startScreen) {
      return;
    }

    if (!pointer.leftButtonDown()) {
      return;
    }

    const screenDistance = Phaser.Math.Distance.Between(this.startScreen.x, this.startScreen.y, pointer.x, pointer.y);
    if (screenDistance > 5) {
      this.dragging = true;
    }

    this.drawDrag(pointer);
  }

  end(pointer) {
    if (!this.active || this.scene.matchState !== 'playing' || !this.startScreen) {
      this.clearDragGraphics();
      return;
    }

    const isLeft = this.pointerButton === 0;
    if (isLeft) {
      if (this.dragging) {
        this.finishDrag(pointer);
      } else {
        this.finishClick(pointer);
      }
    }

    this.clearDragGraphics();
    this.startScreen = null;
    this.startWorld = null;
    this.dragging = false;
  }

  issueCommand(pointer) {
    if (!this.active || this.scene.matchState !== 'playing' || this.scene.isPointerOverUi(pointer)) {
      return;
    }
    if (!this.selected || this.selected.length === 0) return;

    const wx = pointer.worldX;
    const wy = pointer.worldY;

    const target = this.scene.getEnemyTargetAt(wx, wy);
    if (target) {
      this.scene.issueAttackCommand(this.selected, target);
      this.scene.spawnCommandRipple(target.x, target.y, 0xff4a4a); // red: attack
      return;
    }

    const node = this.scene.getResourceNodeAt(wx, wy);
    if (node && this.scene.issueHarvestCommand) {
      const handled = this.scene.issueHarvestCommand(this.selected, node);
      if (handled) {
        this.scene.spawnCommandRipple(node.x, node.y, 0xffd84a); // yellow: harvest
        return;
      }
    }

    this.scene.issueMoveCommand(this.selected, wx, wy);
    this.scene.spawnCommandRipple(wx, wy, 0x7bd36a); // green: move
  }

  finishClick(pointer) {
    if (this.scene.isPointerOverUi(pointer)) {
      return;
    }

    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    // Try friendly first
    const friendly = this.scene.getPlayerSelectableAt(world.x, world.y);
    if (friendly) {
      this.select([friendly]);
      return;
    }
    // Try enemy — show info only (no command)
    const enemy = this.scene.getEnemyTargetAt(world.x, world.y);
    if (enemy) {
      this.inspectEnemy(enemy);
      return;
    }
    this.clear();
  }

  inspectEnemy(entity) {
    this.clear();
    this._inspected = entity;
    if (entity.selectionShape) {
      entity.selectionShape.setVisible(true);
      if (entity.selectionShape.setStrokeStyle) {
        entity.selectionShape.setStrokeStyle(2, 0xff4444, 0.9);
      }
    }
    this.scene.refreshEnemyInfoUi(entity);
  }

  clearInspection() {
    if (this._inspected) {
      const e = this._inspected;
      if (e.selectionShape) {
        e.selectionShape.setVisible(false);
        if (e.selectionShape.setStrokeStyle) {
          e.selectionShape.setStrokeStyle(2, 0xffec8a, 0.9);
        }
      }
      this._inspected = null;
    }
  }

  finishDrag(pointer) {
    const cam = this.scene.cameras.main;
    const endWorld = cam.getWorldPoint(pointer.x, pointer.y);
    const rect = new Phaser.Geom.Rectangle(
      Math.min(this.startWorld.x, endWorld.x),
      Math.min(this.startWorld.y, endWorld.y),
      Math.abs(this.startWorld.x - endWorld.x),
      Math.abs(this.startWorld.y - endWorld.y)
    );

    const entities = this.scene.getPlayerEntitiesInRect(rect);
    if (entities.length > 0) {
      this.select(entities);
    } else {
      this.clear();
    }
  }

  select(entities) {
    this.clearInspection();
    for (const entity of this.selected) {
      entity.setSelected(false);
    }

    this.selected = entities.filter((entity) => !entity.dead);
    for (const entity of this.selected) {
      entity.setSelected(true);
    }

    this.scene.refreshSelectionUi(this.selected);
  }

  remove(entity) {
    const next = this.selected.filter((item) => item !== entity);
    if (next.length !== this.selected.length) {
      entity.setSelected(false);
      this.selected = next;
      this.scene.refreshSelectionUi(this.selected);
    }
  }

  clear() {
    this.clearInspection();
    for (const entity of this.selected) {
      entity.setSelected(false);
    }

    this.selected = [];
    this.scene.refreshSelectionUi(this.selected);
  }

  drawDrag(pointer) {
    this.graphics.clear();
    const fillColor = 0xc5d9ff;
    const x = Math.min(this.startScreen.x, pointer.x);
    const y = Math.min(this.startScreen.y, pointer.y);
    const width = Math.abs(pointer.x - this.startScreen.x);
    const height = Math.abs(pointer.y - this.startScreen.y);
    this.graphics.lineStyle(2, fillColor, 0.95);
    this.graphics.fillStyle(fillColor, 0.08);
    this.graphics.fillRect(x, y, width, height);
    this.graphics.strokeRect(x, y, width, height);
  }

  clearDragGraphics() {
    this.graphics.clear();
  }
}
