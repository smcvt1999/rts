import Phaser from '../phaser.js';
import { FACTIONS, getOpposingPlayableFaction, getOpposingFactions } from '../data/factions.js';
import { UNIT_TYPES } from '../data/units.js';
import { HEROES } from '../data/heroes.js';
import { MAPS, MAP_ORDER } from '../data/maps.js';
import Unit from '../entities/Unit.js';
import Hero from '../entities/Hero.js';
import Building, { BUILDING_TYPES, BUILDABLE_ORDER } from '../entities/Building.js';
import ResourceNode from '../entities/ResourceNode.js';
import SelectionSystem from '../systems/SelectionSystem.js';
import CombatSystem from '../systems/CombatSystem.js';
import ResourceSystem from '../systems/ResourceSystem.js';
import ProductionSystem from '../systems/ProductionSystem.js';
import AIController from '../systems/AIController.js';
import FlockingSystem from '../systems/FlockingSystem.js';
import TerrainMap, { TILE } from '../systems/TerrainMap.js';
import Pathfinding from '../systems/Pathfinding.js';
import MinimapSystem from '../systems/MinimapSystem.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    // Default map sets initial world size; restartMatch may swap to another.
    this.activeMapId = MAP_ORDER[0];
    const initialMap = MAPS[this.activeMapId];
    this.worldWidth = initialMap.worldWidth;
    this.worldHeight = initialMap.worldHeight;
    this.matchState = 'menu';
    this.isClearingEntities = false;
    this.playerFactionId = null;
    this.enemyFactionIds = [];
    this.activeFactionIds = [];
    this.playerFaction = null;
    this.spectator = false;
    this.mainBases = {};
    this.units = [];
    this.buildings = [];
    this.resourceNodes = [];
    this.placement = null;
    this.contextButtons = [];
    this.menuButtons = [];
    this.gameOverButtons = [];
    this.aiThinkTimer = 0;
    // Lobby state defaults — actual UI built in showLobby.
    this.lobbyConfig = this._defaultLobbyConfig(this.activeMapId);

    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(this.worldWidth * 0.3, this.worldHeight * 0.5);

    // UI camera — never zooms, never scrolls. Renders UI only.
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setName('ui');
    // Keep UI camera viewport in sync if window resizes.
    this.scale.on('resize', (gameSize) => {
      this.uiCamera?.setViewport(0, 0, gameSize.width, gameSize.height);
    });
    this._uiElements = [];

    this.input.mouse.disableContextMenu();
    this._applyGameCursors();
    this.createBackdrop(this.activeMapId);
    this.createHud();

    this.selectionSystem = new SelectionSystem(this);
    this.combatSystem = new CombatSystem(this);
    this.resourceSystem = new ResourceSystem(this);
    this.productionSystem = new ProductionSystem(this);
    this.flockingSystem = new FlockingSystem(this);

    this.createInputHandlers();
    this.createKeyboardHandlers();
    this.showLobby();
    this.refreshSelectionUi([]);
    this.refreshResourceUi();
  }

  getActiveFactionIds() {
    return this.activeFactionIds.slice();
  }

  _defaultLobbyConfig(mapId) {
    const map = MAPS[mapId];
    const slots = [];
    // Slot 0 defaults to player; rest default to AI Med
    for (let i = 0; i < map.maxSlots; i += 1) {
      slots.push({
        type: i === 0 ? 'player' : 'ai_med',
        race: ['england', 'france', 'germany'][i % 3],
      });
    }
    return { mapId, slots };
  }

  createBackdrop(mapId = this.activeMapId) {
    const map = MAPS[mapId];
    if (!map) throw new Error(`Unknown map: ${mapId}`);
    this.activeMapId = mapId;
    this.worldWidth = map.worldWidth;
    this.worldHeight = map.worldHeight;
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);

    this.terrainMap = new TerrainMap(this, this.worldWidth, this.worldHeight, 64);
    this.pathfinding = new Pathfinding(this.terrainMap);
    const W = this.worldWidth;
    const H = this.worldHeight;

    // Base grass ground
    if (this.textures.exists('ts_tilemap_flat')) {
      if (!this.textures.exists('ts_grass_tile')) {
        const src = this.textures.get('ts_tilemap_flat').getSourceImage();
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        canvas.getContext('2d').drawImage(src, 0, 0, 64, 64, 0, 0, 64, 64);
        this.textures.addCanvas('ts_grass_tile', canvas);
      }
      this.add.tileSprite(W / 2, H / 2, W, H, 'ts_grass_tile').setDepth(-10);
    } else {
      this.add.rectangle(W / 2, H / 2, W, H, 0x4a8a3a).setDepth(-10);
    }

    // Map-specific terrain + base slots
    const result = map.generateTerrain(this, this.terrainMap);
    this._basePositions = result.basePositions;

    this.terrainMap.render();
  }

  createHud() {
    const D = 10000;
    const SW = this.scale.width;   // 1280
    const SH = this.scale.height;  // 720
    const barH = 130;
    const barY = SH - barH;
    const mmSize = 120;

    // === TOP: resource bar pinned to top ===
    this.add.rectangle(SW / 2, 14, SW, 28, 0x0c1018, 0.85).setScrollFactor(0).setDepth(D);
    this.resourceText = this.add.text(10, 4, '', {
      fontFamily: 'Verdana, sans-serif', fontSize: '13px', color: '#f6f0de',
    }).setScrollFactor(0).setDepth(D + 1);
    this.factionText = this.add.text(SW / 2, 4, '', {
      fontFamily: 'Georgia, serif', fontSize: '13px', color: '#d8e6ff', align: 'center',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D + 1);

    // === BOTTOM BAR pinned to bottom ===
    this.add.rectangle(SW / 2, barY + barH / 2, SW, barH, 0x0c1018, 0.94).setScrollFactor(0).setDepth(D);
    this.add.rectangle(SW / 2, barY, SW, 2, 0x8a7a4a, 0.7).setScrollFactor(0).setDepth(D + 1);

    // -- Left: Minimap --
    this.minimap = new MinimapSystem(this, mmSize / 2 + 8, barY + barH / 2, mmSize, mmSize * 0.6);

    // -- Center: Selection info --
    const infoX = mmSize + 24;
    const infoW = 460;
    // Info sub-panel with subtle border
    this.add.rectangle(infoX + infoW / 2, barY + barH / 2, infoW, barH - 8, 0x141a22, 0.7)
      .setStrokeStyle(1, 0x4a4a3a, 0.5).setScrollFactor(0).setDepth(D);
    this.selectionBody = this.add.text(infoX + 12, barY + 12, '', {
      fontFamily: 'Verdana, sans-serif', fontSize: '13px', color: '#f4ecd8',
      lineSpacing: 4, wordWrap: { width: infoW - 24 },
    }).setScrollFactor(0).setDepth(D + 1);

    // Store panel info for context buttons + portrait
    this.selectionPanel = {
      left: infoX, top: barY,
      width: infoW, height: barH,
      centerX: infoX + infoW / 2, centerY: barY + barH / 2,
    };

    // -- Right: Command card --
    const cmdX = infoX + infoW + 12;
    const cmdW = 1280 - cmdX - 8;
    // Command card sub-panel
    this.add.rectangle(cmdX + cmdW / 2, barY + barH / 2, cmdW, barH - 8, 0x141a22, 0.7)
      .setStrokeStyle(1, 0x4a4a3a, 0.5).setScrollFactor(0).setDepth(D);
    this.contextBody = this.add.text(cmdX + 12, barY + 12, '', {
      fontFamily: 'Verdana, sans-serif', fontSize: '12px', color: '#f4ecd8',
      lineSpacing: 4, wordWrap: { width: cmdW - 24 },
    }).setScrollFactor(0).setDepth(D + 1);

    this.contextPanel = {
      left: cmdX, top: barY,
      width: cmdW, height: barH,
      centerX: cmdX + cmdW / 2, centerY: barY + barH / 2,
    };

    // Toast (top center, below resource bar)
    this.toastText = this.add.text(640, 48, '', {
      fontFamily: 'Georgia, serif', fontSize: '16px', color: '#f8f1d8',
      backgroundColor: 'rgba(8, 14, 22, 0.5)',
      padding: { left: 10, right: 10, top: 3, bottom: 3 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D + 100);

    // Hint text (bottom of info panel)
    this.selectionHintText = this.add.text(infoX + infoW / 2, barY + barH - 8, '', {
      fontFamily: 'Verdana, sans-serif', fontSize: '11px', color: '#8a9ab4',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(D + 1);

    this.controlsText = this.add.text(0, 0, '').setVisible(false);

    // Register all UI elements: visible on uiCamera only, hidden from main camera
    this._registerUiElements();
  }

  _addUi(obj) {
    if (!obj) return obj;
    this._uiElements.push(obj);
    return obj;
  }

  _registerUiElements() {
    this._syncCameras();
  }

  _syncCameras() {
    if (!this.uiCamera) return;
    const allObjects = this.children.list;
    for (const obj of allObjects) {
      if (!obj) continue;
      const isUi = obj.scrollFactorX === 0 && obj.scrollFactorY === 0 && (obj.depth ?? 0) >= 10000;
      const wasUi = obj._cameraIsUi;
      if (wasUi === isUi) continue; // already correct
      obj._cameraIsUi = isUi;
      try {
        if (isUi) {
          this.cameras.main.ignore(obj);
        } else {
          this.uiCamera.ignore(obj);
        }
      } catch (e) { /* ignore if object already ignored */ }
    }
  }

  createPanel(centerX, centerY, width, height, title) {
    const panel = {
      centerX,
      centerY,
      width,
      height,
      left: centerX - width / 2,
      top: centerY - height / 2,
    };

    this.add.rectangle(centerX, centerY, width, height, 0x0c1420, 0.84)
      .setStrokeStyle(1, 0x7e92b0, 0.3)
      .setScrollFactor(0)
      .setDepth(10000);

    this.add.text(panel.left + 16, panel.top + 10, title, {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#f2e6c8',
    }).setScrollFactor(0).setDepth(10001);

    return panel;
  }

  createInputHandlers() {
    this.input.on('pointerdown', (pointer, gameObjects) => {
      if (this.isPointerOverUi(gameObjects)) {
        return;
      }

      if (this.matchState !== 'playing') {
        return;
      }

      if (this.placement) {
        if (pointer.rightButtonDown()) {
          this.cancelPlacement();
          return;
        }
        if (pointer.leftButtonDown()) {
          this.confirmPlacement(pointer.worldX, pointer.worldY);
          return;
        }
      }

      if (pointer.rightButtonDown()) {
        this.selectionSystem.issueCommand(pointer);
        return;
      }

      if (pointer.leftButtonDown()) {
        this.selectionSystem.begin(pointer);
      }
    });

    this.input.on('pointermove', (pointer) => {
      if (this.placement) {
        this.updatePlacementGhost(pointer.worldX, pointer.worldY);
        return;
      }
      this.selectionSystem.update(pointer);
    });

    this.input.on('pointerup', (pointer) => {
      this.selectionSystem.end(pointer);
    });

    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      this._wheelDelta = (this._wheelDelta || 0) + (deltaY > 0 ? -0.08 : 0.08);
    });
  }

  createKeyboardHandlers() {
    this.keys = this.input.keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      q: Phaser.Input.Keyboard.KeyCodes.Q,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
    });
  }

  update(time, delta) {
    const dt = delta / 1000;

    if (this.matchState !== 'playing') {
      return;
    }

    this.updateCamera(dt);
    this.resourceSystem.update(dt);
    this.productionSystem.update(dt);
    this._applyFactionPassives();
    this.combatSystem.update(dt);
    this.flockingSystem.update(dt);
    this.updateAI(dt);
    if (this.minimap) this.minimap.update();
    this._syncCameras();
    this._tickSelectionUi();
    this.refreshResourceUi();

    if (this.keys.q && Phaser.Input.Keyboard.JustDown(this.keys.q)) {
      this.useSelectedHeroAbility();
    }
    if (this.keys.esc && Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      if (this.placement) this.cancelPlacement();
    }
  }

  updateCamera(dt) {
    const cam = this.cameras.main;
    const baseSpeed = 960 / cam.zoom;
    let moveX = 0;
    let moveY = 0;

    if (this.keys.a.isDown || this.keys.left.isDown) {
      moveX -= 1;
    }
    if (this.keys.d.isDown || this.keys.right.isDown) {
      moveX += 1;
    }
    if (this.keys.w.isDown || this.keys.up.isDown) {
      moveY -= 1;
    }
    if (this.keys.s.isDown || this.keys.down.isDown) {
      moveY += 1;
    }

    const pointer = this.input.activePointer;
    const edge = 40;
    if (pointer.x <= edge) {
      moveX -= 1;
    }
    if (pointer.x >= this.scale.width - edge) {
      moveX += 1;
    }
    if (pointer.y <= edge) {
      moveY -= 1;
    }
    if (pointer.y >= this.scale.height - edge) {
      moveY += 1;
    }

    if (moveX !== 0 || moveY !== 0) {
      const length = Math.hypot(moveX, moveY) || 1;
      cam.scrollX += (moveX / length) * baseSpeed * dt;
      cam.scrollY += (moveY / length) * baseSpeed * dt;
      this.clampCamera();
    }

    // Mouse wheel zoom
    if (this._wheelDelta) {
      const newZoom = Phaser.Math.Clamp(cam.zoom + this._wheelDelta, 0.5, 2.0);
      cam.setZoom(newZoom);
      this.clampCamera();
      this._wheelDelta = 0;
    }
  }

  clampCamera() {
    const cam = this.cameras.main;
    const viewWidth = 1280 / cam.zoom;
    const viewHeight = 720 / cam.zoom;
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, this.worldWidth - viewWidth);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, this.worldHeight - viewHeight);
  }

  showLobby() {
    this.matchState = 'menu';
    this.selectionSystem?.setActive(false);
    this.clearContextButtons();
    this.hideLobby();

    const overlay = this.add.container(0, 0).setScrollFactor(0).setDepth(12000);
    const dim = this.add.rectangle(640, 360, 1280, 720, 0x0a1018, 0.94);
    const title = this.add.text(640, 50, 'KINGDOM WARS', {
      fontFamily: 'Georgia, serif', fontSize: '40px', color: '#f5ead0',
      stroke: '#2a1a08', strokeThickness: 4,
    }).setOrigin(0.5);
    const subtitle = this.add.text(640, 92, 'Match Setup', {
      fontFamily: 'Verdana, sans-serif', fontSize: '14px', color: '#8a9ab4',
    }).setOrigin(0.5);
    overlay.add([dim, title, subtitle]);

    this.menuOverlay = overlay;
    this.menuButtons = [];

    this._buildMapSelector();
    this._buildSlotList();
    this._buildLobbyButtons();
    this._refreshLobbyUI();
  }

  hideLobby() {
    if (this.menuOverlay) {
      this.menuOverlay.destroy();
      this.menuOverlay = null;
    }
    // Map cards / slot rows / start button were added to scene directly (not the overlay
    // container) because interactive children inside containers need extra plumbing.
    // So destroy each tracked object explicitly.
    for (const mc of (this._mapCards || [])) {
      [mc.card, mc.titleText, mc.descText, mc.click].forEach((o) => o && !o.destroyed && o.destroy());
    }
    for (const row of (this._slotRows || [])) {
      (row.objects || []).forEach((o) => o && !o.destroyed && o.destroy());
    }
    if (this._startBtn?.container && !this._startBtn.container.destroyed) {
      this._startBtn.container.destroy();
    }
    if (this._lobbyHint && !this._lobbyHint.destroyed) {
      this._lobbyHint.destroy();
    }
    for (const btn of (this.menuButtons || [])) {
      if (btn.container && !btn.container.destroyed) btn.container.destroy();
    }
    this.menuButtons = [];
    this._mapCards = [];
    this._slotRows = [];
    this._startBtn = null;
    this._lobbyHint = null;
  }

  _buildMapSelector() {
    const y = 150;
    const cardW = 280;
    const cardH = 70;
    const gap = 24;
    const totalW = MAP_ORDER.length * cardW + (MAP_ORDER.length - 1) * gap;
    const startX = 640 - totalW / 2 + cardW / 2;
    this._mapCards = [];

    MAP_ORDER.forEach((mid, i) => {
      const m = MAPS[mid];
      const cx = startX + i * (cardW + gap);
      const card = this.add.rectangle(cx, y, cardW, cardH, 0x1a2230, 0.95)
        .setStrokeStyle(2, 0x8a7a4a, 0.7)
        .setScrollFactor(0).setDepth(12100);
      const titleText = this.add.text(cx, y - 14, m.name, {
        fontFamily: 'Georgia, serif', fontSize: '16px', color: '#f4ecd8',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(12101);
      const descText = this.add.text(cx, y + 14, `${m.description} (${m.maxSlots}p)`, {
        fontFamily: 'Verdana, sans-serif', fontSize: '11px', color: '#a8b4c8',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(12101);
      const click = this.add.rectangle(cx, y, cardW, cardH, 0xffffff, 0.001)
        .setScrollFactor(0).setDepth(12500)
        .setInteractive({ useHandCursor: true });
      click.on('pointerdown', () => this._selectMap(mid));
      this._mapCards.push({ id: mid, card, titleText, descText, click });
      this.menuButtons.push({ container: click });
    });
  }

  _selectMap(mapId) {
    if (this.lobbyConfig.mapId === mapId) return;
    this.lobbyConfig = this._defaultLobbyConfig(mapId);
    // Rebuild slot list (count may change)
    this._destroySlotRows();
    this._buildSlotList();
    this._refreshLobbyUI();
  }

  _destroySlotRows() {
    for (const row of this._slotRows || []) {
      row.objects.forEach((o) => { if (!o.destroyed) o.destroy(); });
    }
    this._slotRows = [];
  }

  _buildSlotList() {
    const slots = this.lobbyConfig.slots;
    const rowH = 38;
    const rowGap = 8;
    const totalH = slots.length * rowH + (slots.length - 1) * rowGap;
    const startY = 260;
    this._slotRows = [];

    slots.forEach((slot, i) => {
      const y = startY + i * (rowH + rowGap);
      const rowBg = this.add.rectangle(640, y, 700, rowH, 0x141a22, 0.7)
        .setStrokeStyle(1, 0x4a4a3a, 0.5)
        .setScrollFactor(0).setDepth(12100);
      const slotLabel = this.add.text(640 - 320, y, `Slot ${i + 1}`, {
        fontFamily: 'Verdana, sans-serif', fontSize: '13px', color: '#d8c8a0',
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(12101);

      // Type cycle button
      const typeBtn = this._makeCycleButton(640 - 130, y, 220, 30, '', () => this._cycleSlotType(i));
      // Race cycle button
      const raceBtn = this._makeCycleButton(640 + 140, y, 200, 30, '', () => this._cycleSlotRace(i));
      // Color swatch
      const swatch = this.add.rectangle(640 + 280, y, 22, 22, 0xffffff, 1)
        .setStrokeStyle(1, 0x000000, 0.5)
        .setScrollFactor(0).setDepth(12101);

      this._slotRows.push({
        index: i,
        objects: [rowBg, slotLabel, typeBtn.bg, typeBtn.text, typeBtn.click, raceBtn.bg, raceBtn.text, raceBtn.click, swatch],
        typeText: typeBtn.text,
        raceText: raceBtn.text,
        swatch,
      });
      this.menuButtons.push({ container: typeBtn.click });
      this.menuButtons.push({ container: raceBtn.click });
    });
  }

  _makeCycleButton(x, y, w, h, label, onClick) {
    const bg = this.add.rectangle(x, y, w, h, 0x2a3140, 0.95)
      .setStrokeStyle(1, 0x6a7a94, 0.7)
      .setScrollFactor(0).setDepth(12100);
    const text = this.add.text(x, y, label, {
      fontFamily: 'Verdana, sans-serif', fontSize: '12px', color: '#f0e8d4',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12101);
    const click = this.add.rectangle(x, y, w, h, 0xffffff, 0.001)
      .setScrollFactor(0).setDepth(12500)
      .setInteractive({ useHandCursor: true });
    click.on('pointerover', () => bg.setFillStyle(0x3a4456, 1));
    click.on('pointerout', () => bg.setFillStyle(0x2a3140, 0.95));
    click.on('pointerdown', onClick);
    return { bg, text, click };
  }

  _cycleSlotType(slotIdx) {
    const order = ['closed', 'player', 'ai_easy', 'ai_med', 'ai_hard'];
    const cur = this.lobbyConfig.slots[slotIdx].type;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    // Only one player allowed
    if (next === 'player' && this.lobbyConfig.slots.some((s, i) => i !== slotIdx && s.type === 'player')) {
      this.lobbyConfig.slots[slotIdx].type = order[(order.indexOf(next) + 1) % order.length];
    } else {
      this.lobbyConfig.slots[slotIdx].type = next;
    }
    this._refreshLobbyUI();
  }

  _cycleSlotRace(slotIdx) {
    const order = ['england', 'france', 'germany', 'random'];
    const cur = this.lobbyConfig.slots[slotIdx].race;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    this.lobbyConfig.slots[slotIdx].race = next;
    this._refreshLobbyUI();
  }

  _buildLobbyButtons() {
    const startX = 640 - 110;
    const startY = 600;
    this._startBtn = this.createUiButton(startX, startY, 180, 48, 'START MATCH', () => this._startFromLobby(), {
      fill: 0x2c4738, stroke: 0xa7ddb7, hover: 0x355643,
    });
    this.menuButtons.push({ container: this._startBtn.container });

    const hint = this.add.text(640, 660, 'Click slot type/race to cycle. Need ≥2 active slots. Spectate = 0 player slots.', {
      fontFamily: 'Verdana, sans-serif', fontSize: '11px', color: '#6a7a94',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12101);
    this._lobbyHint = hint;
  }

  _refreshLobbyUI() {
    // Map cards: highlight selected
    for (const mc of (this._mapCards || [])) {
      const sel = mc.id === this.lobbyConfig.mapId;
      mc.card.setStrokeStyle(sel ? 3 : 2, sel ? 0xf4d97a : 0x8a7a4a, sel ? 1 : 0.7);
      mc.card.setFillStyle(sel ? 0x2a3650 : 0x1a2230, 0.95);
    }
    // Slot rows
    const TYPE_LABEL = { closed: 'Closed', player: 'Player', ai_easy: 'AI · Easy', ai_med: 'AI · Med', ai_hard: 'AI · Hard' };
    const RACE_LABEL = { england: 'England', france: 'France', germany: 'Germany', random: 'Random' };
    const RACE_COLOR = { england: 0x4c7bd9, france: 0xd94c4c, germany: 0xd9b84c, random: 0x9090a0 };
    for (const row of this._slotRows) {
      const slot = this.lobbyConfig.slots[row.index];
      row.typeText.setText(TYPE_LABEL[slot.type]);
      row.raceText.setText(RACE_LABEL[slot.race]);
      row.swatch.setFillStyle(RACE_COLOR[slot.race], 1);
      const dim = slot.type === 'closed' ? 0.4 : 1.0;
      row.typeText.setAlpha(dim);
      row.raceText.setAlpha(dim);
      row.swatch.setAlpha(dim);
    }
    // Start button enable state
    const active = this.lobbyConfig.slots.filter((s) => s.type !== 'closed').length;
    const valid = active >= 2;
    if (this._startBtn) {
      this._startBtn.bg.setAlpha(valid ? 1 : 0.4);
      this._startBtn.text.setAlpha(valid ? 1 : 0.4);
      this._startBtn.container.input.enabled = valid;
    }
  }

  _startFromLobby() {
    const active = this.lobbyConfig.slots.filter((s) => s.type !== 'closed');
    if (active.length < 2) return;
    this.startMatch(this.lobbyConfig);
  }

  showGameOverOverlay(victory) {
    if (this.gameOverOverlay) {
      this.gameOverOverlay.destroy();
    }

    const overlay = this.add.container(0, 0).setScrollFactor(0).setDepth(12000);
    const dim = this.add.rectangle(640, 360, 1280, 720, 0x050a10, 0.82);

    let titleText, subtitleText, titleColor, recapText;
    if (this.spectator) {
      const winnerId = this._spectatorWinner;
      const winner = winnerId ? FACTIONS[winnerId] : null;
      titleText = winner ? `${winner.name.toUpperCase()} WINS` : 'DRAW';
      titleColor = '#f2df8f';
      subtitleText = winner ? 'Last castle standing.' : 'No survivors.';
      recapText = 'Spectator mode — observe and tweak the lobby for the next match.';
    } else {
      titleText = victory ? 'VICTORY' : 'DEFEAT';
      titleColor = victory ? '#f2df8f' : '#e58a8a';
      subtitleText = victory ? 'All enemy castles have been destroyed!' : 'Your castle has fallen!';
      recapText = 'Build, conquer, and destroy all enemy castles to win.';
    }

    const title = this.add.text(640, 170, titleText, {
      fontFamily: 'Georgia, serif', fontSize: '60px', color: titleColor,
    }).setOrigin(0.5);
    const subtitle = this.add.text(640, 235, subtitleText, {
      fontFamily: 'Verdana, sans-serif', fontSize: '18px', color: '#d8e4f5',
    }).setOrigin(0.5);
    const recap = this.add.text(640, 286, recapText, {
      fontFamily: 'Verdana, sans-serif', fontSize: '14px', color: '#9fb1ca',
    }).setOrigin(0.5);

    overlay.add([dim, title, subtitle, recap]);

    const restart = this.createUiButton(640, 398, 330, 72, 'Restart Match\nSame setup, new game', () => this.restartMatch(), {
      fill: 0x2f3648,
      stroke: 0xd8e4f5,
      hover: 0x3a4258,
    });
    const menu = this.createUiButton(640, 490, 330, 72, 'Return to Lobby\nReconfigure match', () => this.returnToLobby(), {
      fill: 0x2c4738,
      stroke: 0xa7ddb7,
      hover: 0x355643,
    });

    overlay.add([restart.container, menu.container]);
    this.gameOverOverlay = overlay;
    this.gameOverButtons = [restart, menu];
  }

  hideGameOverOverlay() {
    if (this.gameOverOverlay) {
      this.gameOverOverlay.destroy();
      this.gameOverOverlay = null;
    }
    this.gameOverButtons = [];
  }

  createUiButton(x, y, width, height, label, onClick, colors = {}) {
    const container = this.add.container(x, y).setScrollFactor(0).setDepth(12200);
    container.isUiElement = true;
    // Hit area padded by 4px on each side — forgives clicks slightly off the visual edge.
    const padding = 4;
    const hitW = width + padding * 2;
    const hitH = height + padding * 2;
    container.setSize(hitW, hitH);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-hitW / 2, -hitH / 2, hitW, hitH),
      Phaser.Geom.Rectangle.Contains
    );
    container.input.cursor = 'pointer';

    const hasTsBtn = this.textures.exists('ts_btn_blue');
    let bg;
    if (hasTsBtn) {
      bg = this.add.image(0, 0, 'ts_btn_blue').setDisplaySize(width, height);
    } else {
      bg = this.add.rectangle(0, 0, width, height, colors.fill ?? 0x2a3140, 0.96)
        .setStrokeStyle(2, colors.stroke ?? 0xd5e2f3, 0.88);
    }

    const text = this.add.text(0, 0, label, {
      fontFamily: 'Verdana, sans-serif',
      fontSize: '11px',
      color: '#f0e8d4',
      align: 'center',
      lineSpacing: 3,
    }).setOrigin(0.5);

    container.add([bg, text]);

    let pressed = false;
    const setHover = () => {
      if (hasTsBtn && this.textures.exists('ts_btn_hover')) bg.setTexture('ts_btn_hover');
      else bg.setFillStyle?.(colors.hover ?? 0x3a4456, 1);
    };
    const setIdle = () => {
      if (hasTsBtn) bg.setTexture('ts_btn_blue');
      else bg.setFillStyle?.(colors.fill ?? 0x2a3140, 0.96);
      bg.setScale(1);
      text.setScale(1);
    };
    const setPressed = () => {
      if (hasTsBtn && this.textures.exists('ts_btn_blue_pressed')) bg.setTexture('ts_btn_blue_pressed');
      bg.setScale(0.95);
      text.setScale(0.95);
    };

    container.on('pointerover', setHover);
    container.on('pointerout', () => { setIdle(); pressed = false; });
    container.on('pointerdown', (pointer, localX, localY, event) => {
      event?.stopPropagation?.();
      pressed = true;
      setPressed();
    });
    // Fire onClick on both pointerup AND pointerupoutside (handles mouse drift during press).
    const handleRelease = (pointer, localX, localY, event) => {
      event?.stopPropagation?.();
      const wasPressed = pressed;
      pressed = false;
      setIdle();
      if (wasPressed) onClick?.();
    };
    container.on('pointerup', handleRelease);
    container.on('pointerupoutside', handleRelease);

    return { container, bg, text };
  }

  isPointerOverUi(gameObjects = []) {
    if (!Array.isArray(gameObjects)) {
      // Check pointer position as fallback
      const p = typeof gameObjects === 'object' && gameObjects.y !== undefined ? gameObjects : null;
      if (p && (p.y < 28 || p.y > this.scale.height - 130)) return true;
      return false;
    }
    // Bottom bar area (y > 540) or top bar (y < 32)
    const pointer = this.input.activePointer;
    if (pointer.y > this.scale.height - 130 || pointer.y < 28) return true;
    return gameObjects.some((obj) => obj?.isUiElement || obj?.parentContainer?.isUiElement);
  }

  startMatch(lobbyConfig) {
    if (this.placement) this.cancelPlacement();
    this.hideLobby();
    this.hideGameOverOverlay();
    this.clearWorldEntities();

    this.lobbyConfig = lobbyConfig;

    // Rebuild terrain if map changed
    if (lobbyConfig.mapId !== this.activeMapId) {
      this._rebuildBackdrop(lobbyConfig.mapId);
    }

    // Resolve slot races: 'random' picks unused race when possible, else any.
    const allRaces = ['england', 'france', 'germany'];
    const usedRaces = new Set(lobbyConfig.slots.filter((s) => s.type !== 'closed' && s.race !== 'random').map((s) => s.race));
    const resolvedSlots = lobbyConfig.slots
      .filter((s) => s.type !== 'closed')
      .map((s) => {
        let race = s.race;
        if (race === 'random') {
          const pool = allRaces.filter((r) => !usedRaces.has(r));
          race = (pool.length > 0 ? pool : allRaces)[Math.floor(Math.random() * (pool.length > 0 ? pool.length : allRaces.length))];
          usedRaces.add(race);
        }
        return { type: s.type, race };
      });

    // Determine player faction (if any) and enemy factions
    const playerSlot = resolvedSlots.find((s) => s.type === 'player');
    this.playerFactionId = playerSlot?.race ?? null;
    this.playerFaction = this.playerFactionId ? FACTIONS[this.playerFactionId] : null;
    this.spectator = !playerSlot;
    this.activeFactionIds = resolvedSlots.map((s) => s.race);
    this.enemyFactionIds = this.activeFactionIds.filter((id) => id !== this.playerFactionId);

    // Init resources
    this.resourceSystem.clear();
    for (const slot of resolvedSlots) {
      this.resourceSystem.resetFaction(slot.race, FACTIONS[slot.race].openingResources);
    }

    this.matchState = 'playing';
    this.selectionSystem.setActive(!this.spectator);
    this.selectionSystem.clear();

    // AI controllers for every non-player slot. In spectate, ALL slots get AI.
    const difficultyMap = { ai_easy: 'easy', ai_med: 'med', ai_hard: 'hard' };
    this.aiControllers = resolvedSlots
      .filter((s) => s.type !== 'player')
      .map((s) => new AIController(this, s.race, { difficulty: difficultyMap[s.type] || 'med' }));

    this.spawnBattlefield(resolvedSlots);
    this.cameraOnPlayerBase();
    this.refreshResourceUi();
    this.refreshSelectionUi([]);
    if (this.spectator) {
      this.showToast(`Spectating: ${this.activeFactionIds.map((id) => FACTIONS[id].name).join(' vs ')}`);
    } else {
      this.showToast(`Playing as ${this.playerFaction.name}`);
    }
  }

  _rebuildBackdrop(mapId) {
    // Remove all existing scene children below the UI overlay (depth < 9000)
    // and recreate terrain. Easiest: destroy children that aren't UI.
    const toRemove = [];
    for (const obj of this.children.list) {
      if (obj === this.menuOverlay) continue;
      if (obj._cameraIsUi) continue; // keep UI camera objects
      if ((obj.depth ?? 0) >= 10000) continue; // keep HUD
      toRemove.push(obj);
    }
    for (const obj of toRemove) {
      if (!obj.destroyed) obj.destroy();
    }
    this.createBackdrop(mapId);
  }

  restartMatch() {
    this.startMatch(this.lobbyConfig);
  }

  returnToLobby() {
    if (this.placement) this.cancelPlacement();
    this.hideGameOverOverlay();
    this.clearWorldEntities();
    this.resourceSystem.clear();
    this.selectionSystem.clear();
    this.showLobby();
    this.refreshSelectionUi([]);
    this.refreshResourceUi();
  }
  // Backwards-compatible alias for older callers
  returnToFactionSelect() { this.returnToLobby(); }

  clearWorldEntities() {
    this.isClearingEntities = true;
    // Release building terrain footprints before destroy so next match starts clean.
    for (const b of this.buildings) {
      if (b && !b.dead && this.terrainMap && b._footprintTiles) {
        this.terrainMap.releaseFootprint(b._footprintTiles);
        b._footprintTiles = null;
      }
    }
    const allEntities = [...this.units, ...this.buildings, ...this.resourceNodes];
    for (const entity of allEntities) {
      if (entity && !entity.destroyed) {
        entity.destroy();
      }
    }
    this.units = [];
    this.buildings = [];
    this.resourceNodes = [];
    this.mainBases = {};
    this.clearContextButtons();
    this.isClearingEntities = false;
  }

  spawnBattlefield(resolvedSlots) {
    const basePositions = this._basePositions || [];
    const map = MAPS[this.activeMapId];

    resolvedSlots.forEach((slot, i) => {
      const pos = basePositions[i];
      if (!pos) return;
      const layout = this.createFactionLayoutAt(slot.race, pos.x, pos.y, pos.side);
      this.mainBases[slot.race] = layout.townCenter;
      this.spawnStartingArmy(slot.race, layout, pos.side);
      this.spawnResourceLayoutAt(layout);
      this.autoAssignStartingWorkers(slot.race);
      this.resourceSystem.recomputeSupply(slot.race);
    });

    // Map-specific contested resources
    map.spawnContestedResources(this);
  }

  createFactionLayoutAt(factionId, baseX, baseY, side) {
    const faction = this.getFaction(factionId);
    const layout = {
      baseX, baseY, side,
      townCenter: this.spawnBuilding('townCenter', factionId, baseX, baseY, {
        side,
        factionColor: faction.accent,
      }),
      hero: null,
    };
    layout.hero = this.spawnHero(this.getHeroForFaction(factionId), factionId, baseX + 92, baseY, {
      side,
      factionColor: faction.accent,
    });
    return layout;
  }

  spawnResourceLayoutAt(layout) {
    const bx = layout.baseX;
    const by = layout.baseY;
    const cx = this.worldWidth / 2;
    const cy = this.worldHeight / 2;
    // Direction from base away from center (outward)
    const dx = bx - cx;
    const dy = by - cy;
    const dLen = Math.hypot(dx, dy) || 1;
    const ox = dx / dLen;  // outward unit vector
    const oy = dy / dLen;
    // Perpendicular (tangential) direction
    const px = -oy;
    const py = ox;

    // Resources placed in base's "rear" arc (outward + sideways)
    // Outward-left, outward-right, flank-left, flank-right
    this.spawnResourceNode('food', bx + ox * 300 + px * 250, by + oy * 300 + py * 250);
    this.spawnResourceNode('food', bx + ox * 300 - px * 250, by + oy * 300 - py * 250);
    this.spawnResourceNode('gold', bx + ox * 100 + px * 400, by + oy * 100 + py * 400);
    this.spawnResourceNode('gold', bx + ox * 100 - px * 400, by + oy * 100 - py * 400);
  }

  autoAssignStartingWorkers(factionId) {
    const workers = this.units.filter((u) => u.isWorker && u.factionId === factionId && !u.dead);
    workers.forEach((w, i) => {
      const nodeType = i < Math.ceil(workers.length / 2) ? 'food' : 'gold';
      const node = this.findNearestResourceNode(w.x, w.y, nodeType) || this.findNearestResourceNode(w.x, w.y, 'food');
      if (node) w.setHarvestTarget(node);
    });
  }

  spawnResourceLayout(layout, side) {
    const sign = side === 'left' ? 1 : -1;
    const baseX = layout.baseX;
    const baseY = layout.baseY;
    // Near-base resources
    const farmOffsets = [
      { x: 320, y: -300 },
      { x: 380, y: 260 },
      { x: 200, y: -500 },
    ];
    for (const o of farmOffsets) {
      this.spawnResourceNode('food', baseX + sign * o.x, baseY + o.y);
    }
    const mineOffsets = [
      { x: 450, y: -100 },
      { x: 280, y: 450 },
    ];
    for (const o of mineOffsets) {
      this.spawnResourceNode('gold', baseX + sign * o.x, baseY + o.y);
    }
    // Expansion resources (far from base, contested)
    const cx = this.worldWidth / 2;
    const cy = this.worldHeight / 2;
    if (side === 'left') {
      this.spawnResourceNode('food', cx - 600, cy - 400);
      this.spawnResourceNode('gold', cx - 400, cy + 300);
      this.spawnResourceNode('food', cx - 200, cy);
    } else {
      this.spawnResourceNode('food', cx + 600, cy + 400);
      this.spawnResourceNode('gold', cx + 400, cy - 300);
      this.spawnResourceNode('food', cx + 200, cy);
    }
  }

  spawnResourceNode(nodeType, x, y, opts = {}) {
    // Terrain check — shift to nearest walkable tile if on water/cliff
    if (this.terrainMap) {
      const tm = this.terrainMap;
      const { col, row } = tm.worldToTile(x, y);
      if (!tm.isWalkable(col, row)) {
        const alt = this._findNearestWalkableSpot(x, y);
        if (alt) { x = alt.x; y = alt.y; }
      }
    }
    const node = new ResourceNode(this, { nodeType, x, y, ...opts });
    this.resourceNodes.push(node);
    return node;
  }

  _findNearestWalkableSpot(x, y) {
    if (!this.terrainMap) return { x, y };
    const tm = this.terrainMap;
    for (let r = 1; r < 10; r += 1) {
      for (let angle = 0; angle < 8; angle += 1) {
        const a = (angle / 8) * Math.PI * 2;
        const nx = x + Math.cos(a) * r * tm.tileSize;
        const ny = y + Math.sin(a) * r * tm.tileSize;
        const t = tm.worldToTile(nx, ny);
        if (tm.isWalkable(t.col, t.row)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }

  removeResourceNode(node) {
    this.resourceNodes = this.resourceNodes.filter((n) => n !== node);
  }

  findNearestResourceNode(x, y, nodeType) {
    let best = null;
    let bestD = Infinity;
    for (const n of this.resourceNodes) {
      if (n.dead || n.depleted || n.nodeType !== nodeType || !n.canAssign()) continue;
      const d = Phaser.Math.Distance.Between(x, y, n.x, n.y);
      if (d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  getResourceNodeAt(x, y) {
    for (const n of this.resourceNodes) {
      if (!n.dead && n.containsWorldPoint(x, y)) return n;
    }
    return null;
  }

  createFactionLayout(side, factionId) {
    const isLeft = side === 'left';
    const baseX = isLeft ? 500 : this.worldWidth - 500;
    const baseY = this.worldHeight * 0.5;
    const sign = isLeft ? 1 : -1;
    const faction = this.getFaction(factionId);
    const layout = {
      baseX,
      baseY,
      sign,
      townCenter: this.spawnBuilding('townCenter', factionId, baseX, baseY, {
        side,
        factionColor: faction.accent,
      }),
      farms: [],
      barracks: null,
      archeryRange: null,
      monastery: null,
      hero: null,
    };

    layout.hero = this.spawnHero(this.getHeroForFaction(factionId), factionId, baseX + sign * 92, baseY, {
      side,
      factionColor: faction.accent,
    });

    return layout;
  }

  spawnStartingArmy(factionId, layout, side) {
    const baseX = layout.baseX;
    const baseY = layout.baseY;
    const faction = this.getFaction(factionId);

    const workerCount = faction.startingWorkers ?? 4;
    for (let i = 0; i < workerCount; i += 1) {
      const angle = (i / workerCount) * Math.PI * 2;
      const wx = baseX + Math.cos(angle) * 90;
      const wy = baseY + Math.sin(angle) * 90;
      const spot = this._ensureWalkableSpawn(wx, wy);
      this.spawnUnit('worker', factionId, spot.x, spot.y, {
        factionColor: faction.color,
      });
    }
  }

  _ensureWalkableSpawn(x, y) {
    if (!this.terrainMap) return { x, y };
    const tm = this.terrainMap;
    const { col, row } = tm.worldToTile(x, y);
    if (tm.isWalkable(col, row)) return { x, y };
    const alt = this._findNearestWalkableSpot(x, y);
    return alt || { x, y };
  }

  getOpposingFactionId(factionId) {
    // Return first opponent — for AI targeting, any non-self faction works
    const all = [this.playerFactionId, ...(this.enemyFactionIds || [])];
    const opponents = all.filter((id) => id !== factionId);
    return opponents[0] || this.playerFactionId;
  }

  isEnemyOf(factionA, factionB) {
    return factionA !== factionB;
  }

  getFaction(factionId) {
    return FACTIONS[factionId];
  }

  getHeroForFaction(factionId) {
    const heroMap = { england: 'lionheart', france: 'roland', germany: 'kaiser' };
    return heroMap[factionId] || 'lionheart';
  }

  applyFactionCost(cost, faction, isBuilding = false) {
    const multiplier = isBuilding
      ? (faction.modifiers.buildingCostMultiplier ?? 1)
      : (faction.modifiers.unitCostMultiplier ?? 1);
    return {
      food: Math.max(0, Math.round((cost.food ?? 0) * multiplier)),
      gold: Math.max(0, Math.round((cost.gold ?? 0) * multiplier)),
      supply: cost.supply ?? 0,
    };
  }

  applyFactionUnitStats(unitTypeId, faction) {
    const base = UNIT_TYPES[unitTypeId];
    const bonus = faction.unitBonuses?.[unitTypeId] || {};
    const stats = {
      ...base,
      hp: Math.round(base.hp * (faction.modifiers.unitHpMultiplier ?? 1) * (bonus.hp ?? 1)),
      damage: Math.round(base.damage * (faction.modifiers.unitDamageMultiplier ?? 1) * (bonus.damage ?? 1)),
      moveSpeed: Math.round(base.moveSpeed * (bonus.moveSpeed ?? 1)),
      attackSpeed: base.attackSpeed * (bonus.attackSpeed ?? 1),
      attackRange: Math.round(base.attackRange * (bonus.attackRange ?? 1)),
      sightRange: base.sightRange,
      armor: (base.armor ?? 0) + (bonus.armor ?? 0),
      bonusVs: base.bonusVs ? { ...base.bonusVs } : null,
      healAmount: base.healAmount ? Math.round(base.healAmount * (bonus.healAmount ?? 1)) : 0,
      healRange: base.healRange ? Math.round(base.healRange * (bonus.healRange ?? 1)) : 0,
      healCooldown: base.healCooldown ?? 0,
      harvestTime: base.harvestTime ? base.harvestTime * (bonus.harvestTime ?? 1) : 0,
      buildSpeedMultiplier: bonus.buildSpeedMultiplier ?? 1,
    };
    return stats;
  }

  applyFactionHeroStats(heroId, faction) {
    const base = HEROES[heroId];
    return {
      ...base,
      hp: Math.round(base.hp * (faction.modifiers.heroHpMultiplier ?? 1)),
      damage: Math.round(base.damage * (faction.modifiers.heroDamageMultiplier ?? 1)),
      moveSpeed: Math.round(base.moveSpeed * (faction.modifiers.heroSpeedMultiplier ?? 1)),
      attackSpeed: base.attackSpeed,
      attackRange: base.attackRange,
      sightRange: base.sightRange,
      armor: heroId === 'roland' ? 2 : 1,
    };
  }

  startPlacement(buildingTypeId, workers) {
    if (this.placement) this.cancelPlacement();
    const type = BUILDING_TYPES[buildingTypeId];
    if (!type || !type.buildable) return;

    const cost = this.applyFactionCost(type.cost ?? { food: 0, gold: 0 }, this.playerFaction, true);
    if (!this.resourceSystem.canAfford(this.playerFactionId, cost)) {
      this.showToast('Not enough resources');
      return;
    }

    const key = `building_${buildingTypeId}`;
    const ghost = this.textures.exists(key)
      ? this.add.sprite(0, 0, key).setDisplaySize(type.size.width * 1.25, type.size.height * 1.35)
      : this.add.rectangle(0, 0, type.size.width, type.size.height, type.fill, 0.5);
    ghost.setAlpha(0.55);
    ghost.setDepth(4000);

    const outline = this.add.rectangle(0, 0, type.size.width + 8, type.size.height + 8, 0x00ff88, 0.12)
      .setStrokeStyle(2, 0x66ff99, 0.9)
      .setDepth(4001);

    this.placement = {
      buildingTypeId,
      workers: workers.slice(),
      ghost,
      outline,
      cost,
      valid: false,
    };
    this.showToast(`Place ${type.name} — click to build (right-click cancel)`);
  }

  updatePlacementGhost(x, y) {
    if (!this.placement) return;
    this.placement.ghost.setPosition(x, y);
    this.placement.outline.setPosition(x, y);
    const valid = this.isPlacementValid(this.placement.buildingTypeId, x, y);
    this.placement.valid = valid;
    this.placement.outline.setStrokeStyle(2, valid ? 0x66ff99 : 0xff6666, 0.9);
    this.placement.outline.setFillStyle(valid ? 0x00ff88 : 0xff4444, 0.12);
  }

  isPlacementValid(buildingTypeId, x, y) {
    const type = BUILDING_TYPES[buildingTypeId];
    if (!type) return false;
    const w = type.size.width;
    const h = type.size.height;
    if (x - w / 2 < 20 || x + w / 2 > this.worldWidth - 20) return false;
    if (y - h / 2 < 20 || y + h / 2 > this.worldHeight - 20) return false;
    const rect = new Phaser.Geom.Rectangle(x - w / 2 - 6, y - h / 2 - 6, w + 12, h + 12);
    for (const b of this.buildings) {
      if (b.dead) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, b.getWorldBounds())) return false;
    }
    for (const n of this.resourceNodes) {
      if (n.dead) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, n.getWorldBounds())) return false;
    }
    // Terrain check — all tiles under building must be walkable grass
    if (this.terrainMap) {
      const tm = this.terrainMap;
      const ts = tm.tileSize;
      const c1 = Math.floor((x - w / 2) / ts);
      const r1 = Math.floor((y - h / 2) / ts);
      const c2 = Math.floor((x + w / 2) / ts);
      const r2 = Math.floor((y + h / 2) / ts);
      for (let r = r1; r <= r2; r += 1) {
        for (let c = c1; c <= c2; c += 1) {
          if (!tm.isWalkable(c, r)) return false;
        }
      }
    }
    return true;
  }

  confirmPlacement(x, y) {
    if (!this.placement) return;
    if (!this.placement.valid) {
      this.showToast('Cannot build here');
      return;
    }
    const { buildingTypeId, workers, cost } = this.placement;
    if (!this.resourceSystem.spend(this.playerFactionId, cost)) {
      this.showToast('Not enough resources');
      this.cancelPlacement();
      return;
    }
    const building = this.spawnBuilding(buildingTypeId, this.playerFactionId, x, y, {
      side: 'left',
      factionColor: this.playerFaction.accent,
      underConstruction: true,
    });
    const livingWorkers = workers.filter((w) => w instanceof Unit && w.isWorker && !w.dead);
    for (const w of livingWorkers) {
      w.setBuildTarget(building);
    }
    const type = BUILDING_TYPES[buildingTypeId];
    this.showToast(`${type.name} construction started (${type.buildTime}s)`);
    this.cancelPlacement();
  }

  cancelPlacement() {
    if (!this.placement) return;
    this.placement.ghost.destroy();
    this.placement.outline.destroy();
    this.placement = null;
  }

  spawnBuilding(buildingTypeId, factionId, x, y, options = {}) {
    const faction = this.getFaction(factionId);
    const building = new Building(this, {
      buildingTypeId,
      factionId,
      x,
      y,
      side: options.side,
      factionColor: options.factionColor ?? faction.accent,
      strokeColor: faction.color,
      productionSpeedMultiplier: faction.modifiers.productionSpeedMultiplier ?? 1,
      hpMultiplier: faction.modifiers.buildingHpMultiplier ?? 1,
      underConstruction: options.underConstruction,
    });
    building.rallyPoint = options.rallyPoint || null;
    this.buildings.push(building);
    return building;
  }

  spawnUnit(unitTypeId, factionId, x, y, options = {}) {
    const faction = this.getFaction(factionId);
    const stats = this.applyFactionUnitStats(unitTypeId, faction);
    const unit = new Unit(this, {
      unitTypeId,
      factionId,
      x,
      y,
      stats,
      label: UNIT_TYPES[unitTypeId].shortName,
      bodyColor: UNIT_TYPES[unitTypeId].color,
      strokeColor: faction.color,
    });
    this.units.push(unit);

    if (options.attackTarget) {
      unit.setAttackTarget(options.attackTarget);
    } else if (options.moveTarget) {
      unit.setMoveTarget(options.moveTarget.x, options.moveTarget.y);
    }

    return unit;
  }

  spawnHero(heroId, factionId, x, y, options = {}) {
    const faction = this.getFaction(factionId);
    const stats = this.applyFactionHeroStats(heroId, faction);
    const hero = new Hero(this, {
      heroId,
      factionId,
      x,
      y,
      stats,
      label: HEROES[heroId].shortName,
      bodyColor: HEROES[heroId].color,
      strokeColor: faction.color,
    });
    this.units.push(hero);
    if (options.attackTarget) {
      hero.setAttackTarget(options.attackTarget);
    }
    return hero;
  }

  spawnUnitFromProduction(building, unitTypeId) {
    if (!building || building.dead) {
      return null;
    }

    const factionId = building.factionId;
    const isWorkerUnit = unitTypeId === 'worker';
    const enemyBase = this.mainBases[this.getOpposingFactionId(factionId)];
    const spawn = building.getSpawnPoint();
    const offset = Phaser.Math.Between(-10, 10);
    const unit = this.spawnUnit(unitTypeId, factionId, spawn.x, spawn.y + offset,
      isWorkerUnit ? {} : { attackTarget: enemyBase }
    );
    if (isWorkerUnit) {
      // Balance gold/food workers. Target ~2:1 food:gold (gold is slower and cap-limited).
      const factionWorkers = this.units.filter((u) => u.isWorker && !u.dead && u.factionId === factionId && u !== unit);
      let goldCount = 0;
      let foodCount = 0;
      for (const w of factionWorkers) {
        const t = w.harvestTarget?.nodeType;
        if (t === 'gold') goldCount += 1;
        else if (t === 'food') foodCount += 1;
      }
      const desiredType = (goldCount * 2 < foodCount && goldCount < 8) ? 'gold' : 'food';
      const nearest = this.findNearestResourceNode(unit.x, unit.y, desiredType)
        || this.findNearestResourceNode(unit.x, unit.y, desiredType === 'gold' ? 'food' : 'gold');
      if (nearest) unit.setHarvestTarget(nearest);
    }
    if (factionId === this.playerFactionId) {
      this.showToast(`${unit.unitName} deployed from ${building.displayName}`);
    }
    return unit;
  }

  getMainBase(factionId) {
    return this.mainBases[factionId] || this.buildings.find((building) => building.factionId === factionId && building.isMainBase && !building.dead) || null;
  }

  getBuildingsForFaction(factionId) {
    return this.buildings.filter((building) => !building.dead && building.factionId === factionId);
  }

  getUnitsForFaction(factionId) {
    return this.units.filter((unit) => !unit.dead && unit.factionId === factionId);
  }

  getSelectableEntities() {
    return [...this.units, ...this.buildings].filter((entity) => entity && !entity.dead && entity.factionId === this.playerFactionId);
  }

  getPlayerEntitiesInRect(rect) {
    return this.getSelectableEntities().filter((entity) => entity.intersectsWorldRect(rect));
  }

  getPlayerSelectableAt(x, y) {
    const entities = [...this.getSelectableEntities()].sort((a, b) => (b.depth ?? b.y) - (a.depth ?? a.y));
    return entities.find((entity) => entity.containsWorldPoint(x, y)) || null;
  }

  getEnemyTargetAt(x, y) {
    const enemyEntities = [...this.units, ...this.buildings]
      .filter((entity) => entity && !entity.dead && entity.factionId !== this.playerFactionId)
      .sort((a, b) => (b.depth ?? b.y) - (a.depth ?? a.y));
    return enemyEntities.find((entity) => entity.containsWorldPoint(x, y)) || null;
  }

  issueMoveCommand(selectedEntities, x, y) {
    const mobile = selectedEntities.filter((entity) => entity instanceof Unit);
    if (mobile.length === 0) {
      if (selectedEntities.length === 1 && selectedEntities[0] instanceof Building) {
        this.showToast('Buildings cannot move');
      }
      return;
    }

    const offsets = this.getFormationOffsets(mobile.length);
    mobile.forEach((entity, index) => {
      const offset = offsets[index] || { x: 0, y: 0 };
      entity.setMoveTarget(x + offset.x, y + offset.y);
    });
  }

  issueAttackCommand(selectedEntities, target) {
    const mobile = selectedEntities.filter((entity) => entity instanceof Unit);
    for (const entity of mobile) {
      entity.setAttackTarget(target);
    }
  }

  issueHarvestCommand(selectedEntities, node) {
    const workers = selectedEntities.filter((e) => e instanceof Unit && e.isWorker && !e.dead);
    if (workers.length === 0) return false;
    for (const w of workers) {
      if (node.canAssign()) {
        w.setHarvestTarget(node);
      } else {
        const alt = this.findNearestResourceNode(w.x, w.y, node.nodeType);
        if (alt) w.setHarvestTarget(alt);
      }
    }
    this.showToast(`${workers.length} worker(s) sent to harvest`);
    return true;
  }

  getFormationOffsets(count) {
    if (count <= 1) {
      return [{ x: 0, y: 0 }];
    }

    const offsets = [];
    offsets.push({ x: 0, y: 0 });
    for (let i = 1; i < count; i += 1) {
      const ring = Math.floor((i - 1) / 6) + 1;
      const indexInRing = (i - 1) % 6;
      const radius = 18 + ring * 24;
      const angle = (indexInRing / 6) * Math.PI * 2;
      offsets.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }
    return offsets;
  }

  refreshSelectionUi(selected = this.selectionSystem.selected) {
    // Clear previous portrait
    if (this._portrait) { this._portrait.destroy(); this._portrait = null; }

    if (!selected || selected.length === 0) {
      this.selectionBody.setText([
        'Select a unit or building.',
        '',
        'Controls',
        'Left-click: Select',
        'Drag: Multi-select',
        'Right-click: Move/Attack',
      ]);
      this.contextBody.setText('Nothing selected.');
      this.clearContextButtons();
      this.selectionHintText.setText('');
      return;
    }

    if (selected.length > 1) {
      const counts = this.groupSelectionSummary(selected);
      const lines = [`Selected: ${selected.length}`, ''];
      for (const [name, count] of counts.entries()) {
        lines.push(`${name} x${count}`);
      }
      lines.push('');
      lines.push('Right-click: Move/Attack all');
      this.selectionBody.setText(lines);

      const allWorkers = selected.every((e) => e instanceof Unit && e.isWorker);
      if (allWorkers) {
        this.contextBody.setText('');
        this.setContextButtons(this._buildButtonDefs(selected));
        this.selectionHintText.setText('Click build button, then click map to place');
      } else {
        this.contextBody.setText('');
        this.clearContextButtons();
        this.selectionHintText.setText('');
      }
      return;
    }

    const entity = selected[0];
    this._showPortrait(entity);
    if (entity instanceof Hero) {
      const lines = [
        `${entity.heroName} / ${entity.heroTitle}`,
        `HP ${Math.ceil(entity.hp)} / ${entity.maxHp}`,
        `ATK ${Math.round(entity.baseDamage)}  Range ${Math.round(entity.baseAttackRange)}`,
        `Speed ${Math.round(entity.getMoveSpeed())}`,
        '',
        ...entity.traits.map((trait) => `- ${trait}`),
      ];
      this.selectionBody.setText(lines);
      this.contextBody.setText('');
      this.setContextButtons([
        {
          label: `${entity.ability.name}  [Q]\n${entity.ability.description}`,
          onClick: () => this.useSelectedHeroAbility(),
          fill: 0x334766,
          stroke: 0xa9d0ff,
          hover: 0x445c82,
        },
      ]);
      this.selectionHintText.setText(`CD: ${entity.abilityCooldown.toFixed(1)}s — Press Q or click`);
      return;
    }

    if (entity instanceof Building) {
      const productionNames = entity.buildingType.produces.map((unitTypeId) => UNIT_TYPES[unitTypeId].name).join(', ') || 'None';
      const queueLabel = entity.activeProduction
        ? `Training: ${UNIT_TYPES[entity.activeProduction.unitTypeId].name} ${entity.activeProduction.remaining.toFixed(1)}s`
        : `Queue: ${entity.productionQueue.length}`;
      const lines = [
        `${entity.displayName}`,
        `HP ${Math.ceil(entity.hp)} / ${entity.maxHp}`,
        `Armor ${entity.armor}`,
        `Produces: ${productionNames}`,
        '',
        queueLabel,
      ];
      this.selectionBody.setText(lines);
      this.contextBody.setText('');

      if (entity.factionId === this.playerFactionId && entity.buildingType.produces.length > 0) {
        const buttons = entity.buildingType.produces.map((unitTypeId) => {
          const unitDef = UNIT_TYPES[unitTypeId];
          const cost = this.applyFactionCost(unitDef.cost, this.playerFaction);
          return {
            label: `${unitDef.name}\n${cost.food}F / ${cost.gold}G`,
            onClick: () => this.productionSystem.queueUnit(entity, unitTypeId),
            fill: 0x304454,
            stroke: 0xb8c7da,
            hover: 0x435a6d,
          };
        });
        this.setContextButtons(buttons);
        this.selectionHintText.setText('Click buttons to train units');
      } else {
        this.clearContextButtons();
        this.selectionHintText.setText('');
      }
      return;
    }

    const unit = entity;
    const orderLabel = unit.orderType === 'attack' ? 'Attack'
      : unit.orderType === 'move' ? 'Move'
      : unit.orderType === 'harvest' ? 'Harvest'
      : unit.orderType === 'build' ? 'Build'
      : 'Idle';
    const lines = [
      `${unit.unitName}${unit.isHero ? ` / ${unit.heroName}` : ''}`,
      `HP ${Math.ceil(unit.hp)} / ${unit.maxHp}`,
      `ATK ${Math.round(unit.baseDamage)}  Range ${Math.round(unit.baseAttackRange)}`,
      `Speed ${Math.round(unit.getMoveSpeed())}`,
      `Order: ${orderLabel}`,
    ];
    if (unit.isWorker && unit.carrying) {
      lines.push(`Carrying: ${unit.carrying.type === 'gold' ? 'Gold' : 'Food'} ${unit.carrying.amount}`);
    }
    this.selectionBody.setText(lines);

    if (unit.isWorker && unit.factionId === this.playerFactionId) {
      this.contextBody.setText('');
      this.setContextButtons(this._buildButtonDefs([unit]));
      this.selectionHintText.setText('Right-click: Move/Harvest — Build buttons → click map (ESC cancel)');
    } else {
      this.contextBody.setText('');
      this.clearContextButtons();
      this.selectionHintText.setText('Right-click to move or attack');
    }
  }

  refreshEnemyInfoUi(entity) {
    if (!entity) return;
    const isHero = entity instanceof Hero;
    const isBuilding = entity instanceof Building;
    const name = isHero ? entity.heroName : (isBuilding ? entity.displayName : entity.unitName);
    const faction = this.getFaction(entity.factionId);
    const factionName = faction ? faction.name : '???';
    const lines = [
      `[Enemy] ${name}`,
      `Faction: ${factionName}`,
      `HP ${Math.ceil(entity.hp)} / ${entity.maxHp}`,
    ];
    if (!isBuilding) {
      lines.push(`ATK ${Math.round(entity.baseDamage ?? 0)}`);
    }
    this.selectionBody.setText(lines);
    this.contextBody.setText('');
    this.clearContextButtons();
    this.selectionHintText.setText('Right-click with your units to attack this target');
  }

  _showPortrait(entity) {
    if (this._portrait) { this._portrait.destroy(); this._portrait = null; }
    let key = null;
    if (entity instanceof Hero) {
      key = `custom_hero_${entity.heroId}`;
    } else if (entity instanceof Unit) {
      key = `custom_${entity.unitTypeId}`;
    }
    if (!key || !this.textures.exists(key)) return;
    const px = this.selectionPanel.left + this.selectionPanel.width - 52;
    const py = this.selectionPanel.top + 44;
    const portrait = this.add.image(px, py, key)
      .setDisplaySize(56, 56)
      .setScrollFactor(0)
      .setDepth(10002);
    // Gold border frame
    const frame = this.add.rectangle(px, py, 60, 60)
      .setStrokeStyle(2, 0xd4a23a, 1)
      .setFillStyle(0x000000, 0)
      .setScrollFactor(0)
      .setDepth(10003);
    const container = this.add.container(0, 0, [portrait, frame]).setScrollFactor(0).setDepth(10002);
    this._portrait = container;
  }

  _applyFactionPassives() {
    for (const u of this.units) {
      if (u.dead) continue;
      // Reset passive bonuses each frame
      u._passiveRangeBonus = 0;
      u._passiveDamageBonus = 0;
      u._passiveArmorBonus = 0;
    }
    const allFactionIds = this.activeFactionIds && this.activeFactionIds.length
      ? this.activeFactionIds
      : [this.playerFactionId, ...(this.enemyFactionIds || [])].filter(Boolean);
    for (const fid of allFactionIds) {
      const faction = this.getFaction(fid);
      if (!faction?.passive) continue;
      const p = faction.passive;

      if (p.id === 'longbow_doctrine') {
        // England: archers near 3+ other archers gain range bonus
        const archers = this.units.filter((u) => !u.dead && u.factionId === fid && u.category === 'ranged');
        for (const a of archers) {
          const nearby = archers.filter((o) => o !== a
            && Phaser.Math.Distance.Between(a.x, a.y, o.x, o.y) < (p.archerGroupRadius || 200)
          );
          if (nearby.length >= (p.archerGroupMinCount || 3) - 1) {
            a._passiveRangeBonus = (p.archerGroupRange || 1.1) - 1;
          }
        }
      }

      if (p.id === 'chivalry') {
        // France: warriors near hero gain damage bonus
        const hero = this.units.find((u) => u.isHero && u.factionId === fid && !u.dead);
        if (hero) {
          const nearby = this.units.filter(
            (u) => !u.dead && u.factionId === fid && !u.isHero && u.category === 'infantry'
              && Phaser.Math.Distance.Between(u.x, u.y, hero.x, hero.y) < (p.heroAuraRadius || 200)
          );
          for (const u of nearby) {
            u._passiveDamageBonus = (p.heroAuraDamage || 1.08) - 1;
          }
        }
      }

      if (p.id === 'teutonic_discipline') {
        // Germany: units near 3+ allies gain armor
        const armyUnits = this.units.filter((u) => !u.dead && u.factionId === fid && !u.isWorker);
        for (const u of armyUnits) {
          const nearby = armyUnits.filter((o) => o !== u
            && Phaser.Math.Distance.Between(u.x, u.y, o.x, o.y) < (p.groupRadius || 150)
          );
          if (nearby.length >= (p.groupMinCount || 3) - 1) {
            u._passiveArmorBonus = p.groupArmorBonus || 1;
          }
        }
      }
    }
  }

  _tickSelectionUi() {
    const sel = this.selectionSystem?.selected;
    if (!sel || sel.length !== 1) return;
    const e = sel[0];
    if (e instanceof Hero && !e.dead) {
      const cd = e.abilityCooldown;
      const ready = cd <= 0 ? 'READY!' : `CD: ${cd.toFixed(1)}s`;
      this.selectionHintText?.setText(`${ready} — Press Q or click button`);
    }
  }

  _buildButtonDefs(selectedWorkers) {
    return BUILDABLE_ORDER.map((bid) => {
      const t = BUILDING_TYPES[bid];
      const cost = this.applyFactionCost(t.cost ?? { food: 0, gold: 0 }, this.playerFaction, true);
      return {
        label: `${t.name}\n${cost.food}F / ${cost.gold}G`,
        onClick: () => this.startPlacement(bid, selectedWorkers),
        fill: 0x384a2a,
        stroke: 0x9bd17d,
        hover: 0x4d6a3d,
      };
    });
  }

  groupSelectionSummary(selected) {
    const summary = new Map();
    for (const entity of selected) {
      const key = entity instanceof Building ? entity.displayName : entity.unitName;
      summary.set(key, (summary.get(key) || 0) + 1);
    }
    return summary;
  }

  setContextButtons(definitions) {
    this.clearContextButtons();
    const cols = 3;
    const btnW = Math.min(120, (this.contextPanel.width - 40) / cols);
    const btnH = 42;
    const gap = 5;
    const startX = this.contextPanel.left + 20;
    const startY = this.contextPanel.top + 14;

    definitions.forEach((definition, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const button = this.createUiButton(
        startX + col * (btnW + gap) + btnW / 2,
        startY + row * (btnH + gap) + btnH / 2,
        btnW,
        btnH,
        definition.label,
        definition.onClick,
        definition
      );
      this.contextButtons.push(button);
    });
  }

  clearContextButtons() {
    for (const button of this.contextButtons) {
      button.container.destroy();
    }
    this.contextButtons = [];
  }

  refreshResourceUi() {
    if (this.spectator) {
      // Show all factions' resource lines in spectate
      const lines = (this.activeFactionIds || []).map((fid) => {
        const r = this.resourceSystem.getResources(fid);
        const f = FACTIONS[fid];
        return `${f?.name || fid}: F${Math.floor(r.food)} G${Math.floor(r.gold)} S${r.supplyUsed}/${r.supplyCap}`;
      });
      this.resourceText.setText(lines.join('   '));
      this.factionText.setText('SPECTATING');
      return;
    }
    if (!this.playerFactionId) {
      this.resourceText.setText('');
      this.factionText.setText('');
      return;
    }
    const p = this.resourceSystem.getResources(this.playerFactionId);
    this.resourceText.setText(
      `Food ${Math.floor(p.food)}   Gold ${Math.floor(p.gold)}   Supply ${p.supplyUsed}/${p.supplyCap}`
    );
    const enemies = (this.enemyFactionIds || []).map((eid) => FACTIONS[eid]?.name || eid).join(' & ');
    this.factionText.setText(`${this.playerFaction?.name || ''} vs ${enemies}`);
  }

  showToast(message) {
    if (this.toastTween) {
      this.toastTween.stop();
    }
    this.toastText.setText(message);
    this.toastText.setAlpha(1);
    this.toastTween = this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      duration: 1300,
      delay: 800,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.toastText.setText('');
        this.toastText.setAlpha(1);
      },
    });
  }

  spawnAttackEffect(attacker, target) {
    if (!attacker || !target) return;
    const ranged = attacker.category === 'ranged' || attacker.baseAttackRange > 90;
    if (ranged && this.textures.exists('fx_arrow')) {
      const angle = Phaser.Math.Angle.Between(attacker.x, attacker.y, target.x, target.y);
      const arrow = this.add.sprite(attacker.x, attacker.y - 6, 'fx_arrow')
        .setRotation(angle)
        .setDepth(2600);
      const dist = Phaser.Math.Distance.Between(attacker.x, attacker.y, target.x, target.y);
      const duration = Phaser.Math.Clamp(dist * 2.2, 120, 420);
      this.tweens.add({
        targets: arrow,
        x: target.x,
        y: target.y - 6,
        duration,
        ease: 'Sine.easeOut',
        onComplete: () => {
          this.spawnHitSpark(target.x, target.y - 6);
          arrow.destroy();
        },
      });
    } else {
      this.spawnHitSpark(target.x, target.y - 4);
    }
  }

  spawnHitSpark(x, y) {
    if (!this.textures.exists('fx_spark')) return;
    const spark = this.add.sprite(x, y, 'fx_spark')
      .setDepth(2700)
      .setScale(0.4)
      .setAlpha(0.95);
    this.tweens.add({
      targets: spark,
      scale: 1.1,
      alpha: 0,
      duration: 220,
      ease: 'Sine.easeOut',
      onComplete: () => spark.destroy(),
    });
  }

  _applyGameCursors() {
    // Build CSS url() for each cursor variant; Phaser's setDefaultCursor takes raw CSS.
    const base = 'assets/tiny-swords/fp/UI Elements/UI Elements/Cursors';
    this._cursors = {
      default: `url("${base}/Cursor_01.png") 0 0, auto`,
      attack: `url("${base}/Cursor_03.png") 16 16, crosshair`,  // red target
      harvest: `url("${base}/Cursor_04.png") 16 16, pointer`,   // resource
      move: `url("${base}/Cursor_02.png") 16 16, pointer`,       // command
    };
    this.input.setDefaultCursor(this._cursors.default);
    this._currentCursor = this._cursors.default;

    // Swap cursor based on what's under the pointer (only when units selected).
    // Cache last applied cursor so we don't touch canvas.style.cursor every mousemove.
    this.input.on('pointermove', (pointer) => {
      if (!this.selectionSystem || this.matchState !== 'playing') return;
      let next;
      if (this.selectionSystem.selected.length === 0 || this.isPointerOverUi(pointer)) {
        next = this._cursors.default;
      } else if (this.getEnemyTargetAt(pointer.worldX, pointer.worldY)) {
        next = this._cursors.attack;
      } else if (this.getResourceNodeAt(pointer.worldX, pointer.worldY)) {
        next = this._cursors.harvest;
      } else {
        next = this._cursors.move;
      }
      if (next !== this._currentCursor) {
        this.input.setDefaultCursor(next);
        this._currentCursor = next;
      }
    });
  }

  spawnCommandRipple(x, y, color) {
    // Two concentric rings expanding + fading — visible feedback for right-click commands.
    const outer = this.add.circle(x, y, 6, 0, 0).setStrokeStyle(3, color, 1).setDepth(2600);
    const inner = this.add.circle(x, y, 3, 0, 0).setStrokeStyle(2, color, 0.9).setDepth(2601);
    this.tweens.add({
      targets: outer,
      scale: 3.8,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => outer.destroy(),
    });
    this.tweens.add({
      targets: inner,
      scale: 2.4,
      alpha: 0,
      duration: 280,
      ease: 'Cubic.easeOut',
      onComplete: () => inner.destroy(),
    });
  }

  spawnDamageText(x, y, amount, color) {
    const text = this.add.text(x, y, `${Math.max(1, Math.round(amount))}`, {
      fontFamily: 'Georgia, serif',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#08111d',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2800);
    text.setTint(color);

    this.tweens.add({
      targets: text,
      y: y - 26,
      alpha: 0,
      duration: 750,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  flashStructureHit(building) {
    building.bodyShape.setAlpha(0.72);
    if (building.bodyShape.setTintFill) {
      building.bodyShape.setTintFill(0xffffff);
    }
    this.time.delayedCall(90, () => {
      if (!building.dead) {
        building.bodyShape.setAlpha(1);
        if (building.bodyShape.clearTint) {
          building.bodyShape.clearTint();
        }
      }
    });
  }

  useSelectedHeroAbility() {
    const selected = this.selectionSystem.selected;
    if (selected.length !== 1 || !(selected[0] instanceof Hero)) {
      this.showToast('Select a hero to use ability');
      return;
    }

    const hero = selected[0];
    if (hero.useAbility(this.combatSystem)) {
      this.showToast(`${hero.heroName} ability activated!`);
      this.refreshSelectionUi(selected);
    } else {
      this.showToast('Ability is on cooldown');
    }
  }

  updateAI(dt) {
    if (this.matchState !== 'playing') return;
    if (!this.aiControllers) return;
    for (const ai of this.aiControllers) {
      ai.update(dt);
    }

    // Hero abilities for all AI-controlled factions — only when worth it.
    const aiFactionIds = (this.aiControllers || []).map((ai) => ai.factionId);
    for (const eid of aiFactionIds) {
      const hero = this.units.find((u) => u instanceof Hero && u.factionId === eid && !u.dead);
      if (!hero || !hero.canUseAbility()) continue;
      const enemiesNear = this.combatSystem.findEnemiesInRange(hero, 220)
        .filter((e) => !(e instanceof Building));
      const lowHp = hero.hp / hero.maxHp < 0.5;
      // Use when surrounded (3+ targets) OR low HP with at least 1 nearby enemy.
      if (enemiesNear.length >= 3 || (lowHp && enemiesNear.length >= 1)) {
        hero.useAbility(this.combatSystem);
      }
    }
  }

  cameraOnPlayerBase() {
    if (this.spectator) {
      // Center on map middle for spectators
      this.cameras.main.centerOn(this.worldWidth / 2, this.worldHeight / 2);
      this.clampCamera();
      return;
    }
    const base = this.getMainBase(this.playerFactionId);
    if (base) {
      this.cameras.main.centerOn(base.x, base.y);
      this.clampCamera();
    }
  }

  onEntityDestroyed(entity, attacker) {
    if (this.isClearingEntities) {
      this.units = this.units.filter((item) => item !== entity);
      this.buildings = this.buildings.filter((item) => item !== entity);
      this.selectionSystem?.remove(entity);
      return;
    }

    this.units = this.units.filter((item) => item !== entity);
    this.buildings = this.buildings.filter((item) => item !== entity);
    this.selectionSystem.remove(entity);

    if (entity instanceof Building && entity.isMainBase && this.matchState === 'playing') {
      const faction = this.getFaction(entity.factionId);
      this.showToast(`${faction?.name || 'Faction'} has been eliminated!`);
      // Spectate: end when only 1 (or 0) base remains.
      if (this.spectator) {
        const basesAlive = this.buildings.filter((b) => b.isMainBase && !b.dead);
        if (basesAlive.length <= 1) {
          this._spectatorWinner = basesAlive[0]?.factionId ?? null;
          this.endMatch(true);
        }
        return;
      }
      // Player mode: lose if own TC dies, win if all enemy TCs dead.
      if (entity.factionId === this.playerFactionId) {
        this.endMatch(false);
        return;
      }
      const enemyBasesAlive = this.buildings.filter(
        (b) => b.isMainBase && !b.dead && b.factionId !== this.playerFactionId
      );
      if (enemyBasesAlive.length === 0) {
        this.endMatch(true);
      }
      return;
    }

    if (entity instanceof Hero) {
      const owner = entity.factionId === this.playerFactionId ? 'Ally' : 'Enemy';
      this.showToast(`${owner} hero ${entity.heroName} has fallen`);
    }
  }

  endMatch(victory) {
    if (this.matchState !== 'playing') {
      return;
    }

    this.matchState = 'ended';
    if (this.placement) this.cancelPlacement();
    this.selectionSystem.setActive(false);
    this.clearContextButtons();
    this.showGameOverOverlay(victory);
    this.showToast(victory ? 'VICTORY!' : 'DEFEAT!');
  }
}
