import Phaser from '../phaser.js';
import { buildAllTextures } from '../art/TextureFactory.js';

const FP = 'assets/tiny-swords/fp';     // Free Pack
const TP = 'assets/tiny-swords-full/ts'; // Full Pack

const COLORS = {
  Blue: 'england', Red: 'france', Yellow: 'germany',
};
const COLOR_DIRS = { england: 'Blue', france: 'Red', germany: 'Yellow' };

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.cameras.main.setBackgroundColor('#08111d');
    const cx = 640, cy = 360;
    const bar = this.add.rectangle(cx, cy + 40, 300, 16, 0x1a2a3a).setStrokeStyle(1, 0x627792);
    const fill = this.add.rectangle(cx - 148, cy + 40, 4, 12, 0xd4a23a).setOrigin(0, 0.5);
    this.load.on('progress', (v) => { fill.width = 296 * v; });
    this.add.text(cx, cy - 10, 'Loading Kingdom Wars...', {
      fontFamily: 'Georgia, serif', fontSize: '22px', color: '#f1e7d0',
    }).setOrigin(0.5);

    // =============================================
    // FREE PACK: Units (separate Idle/Run/Attack PNGs)
    // =============================================
    for (const [color, fid] of Object.entries(COLORS)) {
      const U = `${FP}/Units/${color} Units`;
      // Warrior 192x192
      this.load.spritesheet(`fp_warrior_idle_${fid}`, `${U}/Warrior/Warrior_Idle.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_warrior_run_${fid}`, `${U}/Warrior/Warrior_Run.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_warrior_atk_${fid}`, `${U}/Warrior/Warrior_Attack1.png`, { frameWidth: 192, frameHeight: 192 });
      // Archer 192x192
      this.load.spritesheet(`fp_archer_idle_${fid}`, `${U}/Archer/Archer_Idle.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_archer_run_${fid}`, `${U}/Archer/Archer_Run.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_archer_atk_${fid}`, `${U}/Archer/Archer_Shoot.png`, { frameWidth: 192, frameHeight: 192 });
      // Lancer 320x320
      this.load.spritesheet(`fp_lancer_idle_${fid}`, `${U}/Lancer/Lancer_Idle.png`, { frameWidth: 320, frameHeight: 320 });
      this.load.spritesheet(`fp_lancer_run_${fid}`, `${U}/Lancer/Lancer_Run.png`, { frameWidth: 320, frameHeight: 320 });
      this.load.spritesheet(`fp_lancer_atk_${fid}`, `${U}/Lancer/Lancer_Right_Attack.png`, { frameWidth: 320, frameHeight: 320 });
      // Monk 192x192
      this.load.spritesheet(`fp_monk_idle_${fid}`, `${U}/Monk/Idle.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_monk_run_${fid}`, `${U}/Monk/Run.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_monk_atk_${fid}`, `${U}/Monk/Heal.png`, { frameWidth: 192, frameHeight: 192 });
      // Pawn 192x192
      this.load.spritesheet(`fp_pawn_idle_${fid}`, `${U}/Pawn/Pawn_Idle.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_pawn_run_${fid}`, `${U}/Pawn/Pawn_Run.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_pawn_carry_${fid}`, `${U}/Pawn/Pawn_Run Gold.png`, { frameWidth: 192, frameHeight: 192 });
      // Militia (Pawn+Axe) and Brawler (Pawn+Hammer)
      this.load.spritesheet(`fp_militia_idle_${fid}`, `${U}/Pawn/Pawn_Idle Axe.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_militia_run_${fid}`, `${U}/Pawn/Pawn_Run Axe.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_militia_atk_${fid}`, `${U}/Pawn/Pawn_Interact Axe.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_bulwark_idle_${fid}`, `${U}/Pawn/Pawn_Idle Hammer.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_bulwark_run_${fid}`, `${U}/Pawn/Pawn_Run Hammer.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`fp_bulwark_atk_${fid}`, `${U}/Pawn/Pawn_Interact Hammer.png`, { frameWidth: 192, frameHeight: 192 });
    }

    // =============================================
    // FREE PACK: Buildings (static images, per color)
    // =============================================
    for (const [color, fid] of Object.entries(COLORS)) {
      const B = `${FP}/Buildings/${color} Buildings`;
      this.load.image(`fp_castle_${fid}`, `${B}/Castle.png`);
      this.load.image(`fp_barracks_${fid}`, `${B}/Barracks.png`);
      this.load.image(`fp_archery_${fid}`, `${B}/Archery.png`);
      this.load.image(`fp_monastery_${fid}`, `${B}/Monastery.png`);
      this.load.image(`fp_house_${fid}`, `${B}/House1.png`);
      this.load.image(`fp_tower_${fid}`, `${B}/Tower.png`);
    }

    // =============================================
    // FREE PACK: UI Elements
    // =============================================
    const UI = `${FP}/UI Elements/UI Elements`;
    this.load.image('fp_bar_base', `${UI}/Bars/BigBar_Base.png`);
    this.load.image('fp_bar_fill', `${UI}/Bars/BigBar_Fill.png`);
    this.load.image('fp_btn_blue', `${UI}/Buttons/BigBlueButton_Regular.png`);
    this.load.image('fp_btn_blue_pressed', `${UI}/Buttons/BigBlueButton_Pressed.png`);
    this.load.image('fp_btn_red', `${UI}/Buttons/BigRedButton_Regular.png`);
    this.load.image('fp_btn_red_pressed', `${UI}/Buttons/BigRedButton_Pressed.png`);
    for (let i = 1; i <= 4; i += 1) {
      this.load.image(`fp_avatar_${i}`, `${UI}/Human Avatars/Avatars_0${i}.png`);
      this.load.image(`fp_cursor_${i}`, `${UI}/Cursors/Cursor_0${i}.png`);
    }
    this.load.image('fp_banner', `${UI}/Banners/Banner.png`);
    this.load.image('fp_paper', `${UI}/Papers/Paper.png`);

    // =============================================
    // FREE PACK: Terrain
    // =============================================
    this.load.image('fp_tileset', `${FP}/Terrain/Tileset/Tileset.png`);

    // =============================================
    // FREE PACK: Terrain tiles + decorations
    // =============================================
    const TER = `${FP}/Terrain`;
    this.load.image('fp_tilemap_1', `${TER}/Tileset/Tilemap_color1.png`);
    this.load.image('fp_tilemap_2', `${TER}/Tileset/Tilemap_color2.png`);
    this.load.image('fp_tilemap_3', `${TER}/Tileset/Tilemap_color3.png`);
    this.load.image('fp_tilemap_4', `${TER}/Tileset/Tilemap_color4.png`);
    this.load.image('fp_tilemap_5', `${TER}/Tileset/Tilemap_color5.png`);
    this.load.image('fp_water_bg', `${TER}/Tileset/Water Background color.png`);
    this.load.image('fp_water_foam', `${TER}/Tileset/Water Foam.png`);
    this.load.image('fp_shadow', `${TER}/Tileset/Shadow.png`);
    for (let i = 1; i <= 4; i += 1) {
      this.load.image(`fp_bush_${i}`, `${TER}/Decorations/Bushes/Bushe${i}.png`);
      this.load.image(`fp_rock_${i}`, `${TER}/Decorations/Rocks/Rock${i}.png`);
      this.load.image(`fp_water_rock_${i}`, `${TER}/Decorations/Rocks in the Water/Water Rocks_0${i}.png`);
      this.load.image(`fp_tree_${i}`, `${TER}/Resources/Wood/Trees/Tree${i}.png`);
      this.load.image(`fp_stump_${i}`, `${TER}/Resources/Wood/Trees/Stump ${i}.png`);
    }
    for (let i = 1; i <= 6; i += 1) {
      this.load.image(`fp_gold_stone_${i}`, `${TER}/Resources/Gold/Gold Stones/Gold Stone ${i}.png`);
    }
    this.load.image('fp_gold_resource', `${TER}/Resources/Gold/Gold Resource/Gold_Resource.png`);
    this.load.image('fp_wood_resource', `${TER}/Resources/Wood/Wood Resource/Wood Resource.png`);
    this.load.image('fp_meat_resource', `${TER}/Resources/Meat/Meat Resource/Meat Resource.png`);
    this.load.spritesheet('fp_sheep_idle', `${TER}/Resources/Meat/Sheep/Sheep_Idle.png`, { frameWidth: 128, frameHeight: 128 });

    // =============================================
    // FULL PACK: Goblins (for neutral monsters)
    // =============================================
    const gobColors = { Blue: 'england', Red: 'france', Yellow: 'germany' };
    for (const [color, fid] of Object.entries(gobColors)) {
      this.load.spritesheet(`tp_torch_${fid}`, `${TP}/Factions/Goblins/Troops/Torch/${color}/Torch_${color}.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`tp_tnt_${fid}`, `${TP}/Factions/Goblins/Troops/TNT/${color}/TNT_${color}.png`, { frameWidth: 192, frameHeight: 192 });
      this.load.spritesheet(`tp_barrel_${fid}`, `${TP}/Factions/Goblins/Troops/Barrel/${color}/Barrel_${color}.png`, { frameWidth: 192, frameHeight: 192 });
    }

    // FULL PACK: Terrain + Resources + Effects
    this.load.image('ts_water', `${TP}/Terrain/Water/Water.png`);
    this.load.image('ts_elevation', `${TP}/Terrain/Ground/Tilemap_Elevation.png`);
    this.load.image('ts_bridge', `${TP}/Terrain/Bridge/Bridge_All.png`);
    this.load.image('ts_goldmine', `${TP}/Resources/Gold Mine/GoldMine_Active.png`);
    this.load.image('ts_wheat', `${TP}/Resources/Resources/W_Idle.png`);
    this.load.image('ts_tree', `${TP}/Resources/Trees/Tree.png`);
    for (let i = 1; i <= 4; i += 1) {
      this.load.image(`ts_rock_${i}`, `${TP}/Terrain/Water/Rocks/Rocks_0${i}.png`);
    }
    this.load.spritesheet('ts_explosion', `${TP}/Effects/Explosion/Explosions.png`, { frameWidth: 192, frameHeight: 192 });

    // FULL PACK: Deco
    for (let i = 1; i <= 18; i += 1) {
      this.load.image(`ts_deco_${String(i).padStart(2, '0')}`, `${TP}/Deco/${String(i).padStart(2, '0')}.png`);
    }

    // Grass tile (from Full Pack tilemap)
    this.load.image('ts_tilemap_flat', `${TP}/Terrain/Ground/Tilemap_Flat.png`);
  }

  create() {
    buildAllTextures(this);
    this._createAnimations();
    this.scene.start('GameScene');
  }

  _createAnimations() {
    const fids = ['england', 'france', 'germany'];

    for (const fid of fids) {
      // Free Pack units: separate idle/run/attack sheets
      const unitTypes = ['warrior', 'archer', 'lancer', 'monk', 'pawn', 'militia', 'bulwark'];
      for (const ut of unitTypes) {
        const idleKey = `fp_${ut}_idle_${fid}`;
        const runKey = `fp_${ut}_run_${fid}`;
        const atkKey = `fp_${ut}_atk_${fid}`;

        if (this.textures.exists(idleKey)) {
          const total = this.textures.get(idleKey).frameTotal - 1;
          this.anims.create({ key: `${ut}_idle_${fid}`, frames: this.anims.generateFrameNumbers(idleKey, { start: 0, end: Math.max(0, total - 1) }), frameRate: 8, repeat: -1 });
        }
        if (this.textures.exists(runKey)) {
          const total = this.textures.get(runKey).frameTotal - 1;
          this.anims.create({ key: `${ut}_run_${fid}`, frames: this.anims.generateFrameNumbers(runKey, { start: 0, end: Math.max(0, total - 1) }), frameRate: 10, repeat: -1 });
        }
        if (this.textures.exists(atkKey)) {
          const total = this.textures.get(atkKey).frameTotal - 1;
          this.anims.create({ key: `${ut}_attack_${fid}`, frames: this.anims.generateFrameNumbers(atkKey, { start: 0, end: Math.max(0, total - 1) }), frameRate: 12, repeat: 0 });
        }
      }

      // Full Pack Goblin units (grid sheets — estimate rows)
      for (const gt of ['torch', 'tnt', 'barrel']) {
        const key = `tp_${gt}_${fid}`;
        if (this.textures.exists(key)) {
          const total = this.textures.get(key).frameTotal - 1;
          const third = Math.floor(total / 3);
          this.anims.create({ key: `${gt}_idle_${fid}`, frames: this.anims.generateFrameNumbers(key, { start: 0, end: Math.min(5, third) }), frameRate: 8, repeat: -1 });
          this.anims.create({ key: `${gt}_run_${fid}`, frames: this.anims.generateFrameNumbers(key, { start: 0, end: Math.min(5, third) }), frameRate: 12, repeat: -1 });
          this.anims.create({ key: `${gt}_attack_${fid}`, frames: this.anims.generateFrameNumbers(key, { start: third, end: Math.min(third + 5, total) }), frameRate: 14, repeat: 0 });
        }
      }
    }

    // Explosion
    if (this.textures.exists('ts_explosion')) {
      this.anims.create({ key: 'fx_explosion', frames: this.anims.generateFrameNumbers('ts_explosion', { start: 0, end: 6 }), frameRate: 14, repeat: 0 });
    }
  }
}
