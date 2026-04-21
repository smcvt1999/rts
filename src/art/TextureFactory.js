import Phaser from '../phaser.js';

// Fallback procedural textures — used only if Tiny Swords sprites fail to load.
// Unit keys kept minimal to match the current data/units.js roster.
const UNIT_KEYS = ['swordsman', 'lancer', 'archer', 'worker', 'militia', 'bulwark', 'monk'];
const BUILDING_KEYS = ['townCenter', 'farm', 'house', 'barracks', 'archeryRange', 'monastery'];

export function buildAllTextures(scene) {
  if (scene.textures.exists('unit_swordsman')) {
    return;
  }
  for (const k of UNIT_KEYS) buildUnitTexture(scene, `unit_${k}`, k);
  // Heroes always use the generic fallback now (lionheart/roland/kaiser — no per-hero art).
  for (const heroId of ['lionheart', 'roland', 'kaiser']) {
    buildHeroTexture(scene, `hero_${heroId}`, heroId);
  }
  for (const k of BUILDING_KEYS) buildBuildingTexture(scene, `building_${k}`, k);
  buildArrowTexture(scene);
  buildSparkTexture(scene);
  buildGrassTuftTexture(scene);
  buildTreeTexture(scene);
  buildRockTexture(scene);
  buildBannerTexture(scene);
  buildFarmZoneTexture(scene);
  buildGoldMineTexture(scene);
  buildCarryIconTexture(scene, 'carry_food', 0xe8c656);
  buildCarryIconTexture(scene, 'carry_gold', 0xf2d24f);
  buildGrassTileTexture(scene);
  buildDirtPatchTexture(scene);
}

function buildGrassTileTexture(scene) {
  const s = 64;
  bake(scene, 'tile_grass', s, s, (g) => {
    // base
    g.fillStyle(0x2e4a2a, 1);
    g.fillRect(0, 0, s, s);
    // lighter patches
    g.fillStyle(0x3a5e33, 1);
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 97) % s;
      const y = (i * 53) % s;
      g.fillRect(x, y, 6 + (i % 3) * 2, 4 + (i % 2) * 2);
    }
    // blades
    g.fillStyle(0x4c7a3a, 0.9);
    for (let i = 0; i < 40; i += 1) {
      const x = (i * 13 + 7) % s;
      const y = (i * 31 + 5) % s;
      g.fillTriangle(x, y + 3, x + 1, y - 1, x + 2, y + 3);
    }
    // dark specks
    g.fillStyle(0x1f341c, 0.55);
    for (let i = 0; i < 26; i += 1) {
      const x = (i * 17 + 11) % s;
      const y = (i * 23 + 13) % s;
      g.fillRect(x, y, 1, 1);
    }
    // subtle edge shade to hint tile boundary at scale
    g.fillStyle(0x162416, 0.08);
    g.fillRect(0, 0, s, 2);
    g.fillRect(0, 0, 2, s);
  });
}

function buildDirtPatchTexture(scene) {
  const w = 220;
  const h = 140;
  bake(scene, 'env_dirt_patch', w, h, (g) => {
    g.fillStyle(0x5a4228, 0.75);
    g.fillEllipse(w / 2, h / 2, w, h);
    g.fillStyle(0x6e5334, 0.6);
    g.fillEllipse(w * 0.45, h * 0.4, w * 0.7, h * 0.55);
    g.fillStyle(0x3c2a1a, 0.5);
    for (let i = 0; i < 20; i += 1) {
      const x = (i * 19) % w;
      const y = (i * 37) % h;
      g.fillRect(x, y, 2, 2);
    }
  });
}

function buildCarryIconTexture(scene, key, color) {
  const s = 10;
  bake(scene, key, s, s, (g) => {
    g.fillStyle(0x000000, 0.4);
    g.fillCircle(s / 2, s / 2 + 1, s * 0.42);
    g.fillStyle(color, 1);
    g.fillCircle(s / 2, s / 2, s * 0.38);
    g.lineStyle(1, 0x2a1a0e, 0.9);
    g.strokeCircle(s / 2, s / 2, s * 0.38);
  });
}

function bake(scene, key, w, h, draw) {
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  draw(g, w, h);
  g.generateTexture(key, w, h);
  g.destroy();
}

function drawSoldierBase(g, w, h, bodyColor, outline = 0x0b1520, options = {}) {
  const { helmet = true } = options;
  const cx = w / 2;
  // shadow
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(cx, h - 3, w * 0.75, 5);
  // legs
  g.fillStyle(shade(bodyColor, -0.35), 1);
  g.fillRect(cx - w * 0.22, h * 0.58, w * 0.16, h * 0.30);
  g.fillRect(cx + w * 0.06, h * 0.58, w * 0.16, h * 0.30);
  // torso
  g.fillStyle(bodyColor, 1);
  g.fillRoundedRect(cx - w * 0.32, h * 0.30, w * 0.64, h * 0.36, 3);
  // belt
  g.fillStyle(shade(bodyColor, -0.45), 1);
  g.fillRect(cx - w * 0.32, h * 0.60, w * 0.64, 2);
  // head
  g.fillStyle(0xecc89a, 1);
  g.fillCircle(cx, h * 0.22, w * 0.17);
  if (helmet) {
    // helmet
    g.fillStyle(shade(bodyColor, -0.55), 1);
    g.fillRoundedRect(cx - w * 0.22, h * 0.08, w * 0.44, h * 0.14, 3);
    g.fillTriangle(cx, h * 0.02, cx - w * 0.08, h * 0.09, cx + w * 0.08, h * 0.09);
  }
  // outline
  g.lineStyle(1.5, outline, 0.9);
  g.strokeRoundedRect(cx - w * 0.32, h * 0.30, w * 0.64, h * 0.36, 3);
  g.strokeCircle(cx, h * 0.22, w * 0.17);
}

function buildUnitTexture(scene, key, type) {
  const w = 40;
  const h = 48;
  const colors = {
    swordsman: 0xcfd7e3,
    lancer: 0x92d1a1,
    archer: 0xe3be75,
    worker: 0xc9b88a,
    militia: 0xb8a47a,
    bulwark: 0x8a7a5a,
    monk: 0xd4b8e8,
  };
  const bodyColor = colors[type] ?? 0xcfd7e3;
  bake(scene, key, w, h, (g) => {
    if (type === 'worker') {
      drawSoldierBase(g, w, h, bodyColor, 0x0b1520, { helmet: false });
      // hoe shaft
      g.fillStyle(0x6a4a2a, 1);
      g.fillRect(w * 0.82, h * 0.08, 3, h * 0.56);
      g.fillStyle(0xbfc5cb, 1);
      g.fillRect(w * 0.74, h * 0.04, 8, 4);
      g.lineStyle(1.2, 0x0b1520, 0.9);
      g.strokeRect(w * 0.74, h * 0.04, 8, 4);
    } else {
      drawSoldierBase(g, w, h, bodyColor);
      if (type === 'archer') {
        // recurve bow
        g.lineStyle(2.2, 0x4a2e14, 1);
        g.beginPath();
        g.arc(w * 0.82, h * 0.46, h * 0.28, Phaser.Math.DegToRad(240), Phaser.Math.DegToRad(120), false);
        g.strokePath();
        g.lineStyle(1, 0xe8e4d2, 0.9);
        g.lineBetween(w * 0.84, h * 0.18, w * 0.84, h * 0.74);
        // quiver
        g.fillStyle(0x5a3a1a, 1);
        g.fillRoundedRect(w * 0.1, h * 0.34, w * 0.11, h * 0.28, 2);
      }
      // swordsman/lancer/militia/bulwark/monk: generic soldier silhouette (from drawSoldierBase).
    }
  });
}

function buildHeroTexture(scene, key) {
  const w = 52;
  const h = 62;
  buildHeroGeneric(scene, key, w, h);
}

function buildHeroGeneric(scene, key, w, h) {
  const bodyColor = 0xd8dde5;
  bake(scene, key, w, h, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(w / 2, h - 3, w * 0.8, 6);
    drawSoldierBase(g, w, h, bodyColor);
  });
}

// Chinese swooping-eave roof. Draws a trapezoid body with upturned corner horns.
function drawChineseRoof(g, leftX, rightX, topY, baseY, mainColor, ridgeColor) {
  const cx = (leftX + rightX) / 2;
  const span = rightX - leftX;
  const eaveOverhang = span * 0.08;
  const hornUp = (baseY - topY) * 0.22;
  // base trapezoid
  g.fillStyle(mainColor, 1);
  g.fillTriangle(leftX - eaveOverhang, baseY, rightX + eaveOverhang, baseY, cx, topY);
  // flat ridge strip at top for layered feel
  g.fillStyle(ridgeColor, 1);
  const ridgeY = topY + (baseY - topY) * 0.18;
  g.fillTriangle(leftX + span * 0.12, ridgeY, rightX - span * 0.12, ridgeY, cx, topY);
  // upturned horns (커진 처마)
  g.fillStyle(mainColor, 1);
  g.fillTriangle(leftX - eaveOverhang, baseY, leftX - eaveOverhang, baseY - hornUp, leftX + span * 0.08, baseY - hornUp * 0.3);
  g.fillTriangle(rightX + eaveOverhang, baseY, rightX + eaveOverhang, baseY - hornUp, rightX - span * 0.08, baseY - hornUp * 0.3);
  // outline
  g.lineStyle(1.2, 0x0b1520, 0.85);
  g.strokeTriangle(leftX - eaveOverhang, baseY, rightX + eaveOverhang, baseY, cx, topY);
  // roof tile rows
  g.lineStyle(1, shade(mainColor, -0.25), 0.9);
  for (let i = 1; i <= 3; i += 1) {
    const yy = topY + (baseY - topY) * (i / 4);
    const shrink = (1 - i / 4);
    g.lineBetween(cx - span * 0.45 * shrink, yy, cx + span * 0.45 * shrink, yy);
  }
}

function drawRedPillar(g, x, y, height, width = 4) {
  g.fillStyle(0x9c2a2a, 1);
  g.fillRect(x - width / 2, y, width, height);
  g.lineStyle(0.8, 0x0b1520, 0.7);
  g.strokeRect(x - width / 2, y, width, height);
}

function drawHangingBanner(g, x, y, width, height, color) {
  g.fillStyle(color, 1);
  g.fillRect(x - width / 2, y, width, height);
  // bottom notch (swallow tail)
  g.fillStyle(0x2e4a2a, 1);
  g.fillTriangle(x - width / 2, y + height, x + width / 2, y + height, x, y + height * 0.75);
  g.lineStyle(0.8, 0x0b1520, 0.8);
  g.strokeRect(x - width / 2, y, width, height);
}

function buildBuildingTexture(scene, key, type) {
  const sizes = {
    townCenter: { w: 120, h: 104 },
    farm: { w: 72, h: 54 },
    house: { w: 72, h: 60 },
    barracks: { w: 92, h: 74 },
    archeryRange: { w: 92, h: 74 },
    monastery: { w: 92, h: 74 },
  };
  const { w, h } = sizes[type];
  bake(scene, key, w, h, (g) => {
    // shadow
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(w / 2, h - 4, w * 0.82, 8);

    if (type === 'townCenter') {
      const roofColor = 0x3d3a35;
      const roofRidge = 0x7a6a55;
      const wallColor = 0xefdfc0;
      // upper (second-tier) roof
      drawChineseRoof(g, w * 0.24, w * 0.76, h * 0.06, h * 0.22, roofColor, roofRidge);
      // middle wall band (small second story)
      g.fillStyle(wallColor, 1);
      g.fillRect(w * 0.32, h * 0.22, w * 0.36, h * 0.1);
      g.lineStyle(1, 0x6a4a2a, 0.7);
      g.strokeRect(w * 0.32, h * 0.22, w * 0.36, h * 0.1);
      // main lower roof
      drawChineseRoof(g, w * 0.1, w * 0.9, h * 0.3, h * 0.48, roofColor, roofRidge);
      // main walls
      g.fillStyle(wallColor, 1);
      g.fillRect(w * 0.14, h * 0.48, w * 0.72, h * 0.44);
      g.lineStyle(1, 0x6a4a2a, 0.7);
      g.strokeRect(w * 0.14, h * 0.48, w * 0.72, h * 0.44);
      // red pillars
      drawRedPillar(g, w * 0.2, h * 0.48, h * 0.44);
      drawRedPillar(g, w * 0.36, h * 0.48, h * 0.44);
      drawRedPillar(g, w * 0.64, h * 0.48, h * 0.44);
      drawRedPillar(g, w * 0.8, h * 0.48, h * 0.44);
      // gate (dark double-door)
      g.fillStyle(0x3c2a18, 1);
      g.fillRect(w * 0.42, h * 0.62, w * 0.16, h * 0.3);
      // gold door studs
      g.fillStyle(0xd4a23a, 1);
      for (let i = 0; i < 3; i += 1) {
        g.fillCircle(w * 0.46, h * 0.7 + i * h * 0.06, 1);
        g.fillCircle(w * 0.54, h * 0.7 + i * h * 0.06, 1);
      }
      g.lineStyle(1, 0x0b1520, 0.9);
      g.strokeRect(w * 0.42, h * 0.62, w * 0.16, h * 0.3);
      // name plaque (현판) above gate
      g.fillStyle(0x6a3018, 1);
      g.fillRect(w * 0.38, h * 0.52, w * 0.24, h * 0.08);
      g.fillStyle(0xd4a23a, 1);
      g.fillRect(w * 0.4, h * 0.54, w * 0.2, h * 0.04);
      g.lineStyle(1, 0x0b1520, 0.8);
      g.strokeRect(w * 0.38, h * 0.52, w * 0.24, h * 0.08);
      // flag pole + banner on top
      g.lineStyle(1.5, 0x2a1a0e, 1);
      g.lineBetween(w * 0.5, h * -0.02, w * 0.5, h * 0.1);
      drawHangingBanner(g, w * 0.56, h * 0.0, 6, 14, 0xc23636);
    } else if (type === 'farm') {
      // field
      g.fillStyle(0x6a4a2a, 1);
      g.fillRoundedRect(w * 0.06, h * 0.28, w * 0.88, h * 0.66, 4);
      // wheat rows
      g.fillStyle(0xcf9f3c, 1);
      for (let i = 0; i < 4; i += 1) {
        g.fillRect(w * 0.1, h * 0.36 + i * (h * 0.14), w * 0.8, h * 0.06);
      }
      g.fillStyle(0xe8c656, 1);
      for (let i = 0; i < 4; i += 1) {
        g.fillRect(w * 0.1, h * 0.36 + i * (h * 0.14), w * 0.8, 2);
      }
      g.lineStyle(1.5, 0x2a1a0e, 0.9);
      g.strokeRoundedRect(w * 0.06, h * 0.28, w * 0.88, h * 0.66, 4);
    } else if (type === 'house') {
      const roofColor = 0x4a4038;
      const roofRidge = 0x7a6a55;
      const wallColor = 0xe9d4a6;
      // Chinese tiled roof
      drawChineseRoof(g, w * 0.04, w * 0.96, h * 0.1, h * 0.42, roofColor, roofRidge);
      // walls
      g.fillStyle(wallColor, 1);
      g.fillRect(w * 0.12, h * 0.42, w * 0.76, h * 0.48);
      g.lineStyle(1, 0x6a4a2a, 0.8);
      g.strokeRect(w * 0.12, h * 0.42, w * 0.76, h * 0.48);
      // wood beams at edges
      g.fillStyle(0x5c3a1e, 1);
      g.fillRect(w * 0.12, h * 0.42, w * 0.04, h * 0.48);
      g.fillRect(w * 0.84, h * 0.42, w * 0.04, h * 0.48);
      // round window
      g.fillStyle(0x2a3544, 1);
      g.fillCircle(w * 0.28, h * 0.58, 4);
      g.lineStyle(0.8, 0xd4a23a, 1);
      g.strokeCircle(w * 0.28, h * 0.58, 4);
      // dark wood door with red frame
      g.fillStyle(0x8a2e2e, 1);
      g.fillRect(w * 0.48, h * 0.6, w * 0.16, h * 0.3);
      g.fillStyle(0x3c2a18, 1);
      g.fillRect(w * 0.5, h * 0.62, w * 0.12, h * 0.26);
      g.fillStyle(0xd4a23a, 1);
      g.fillCircle(w * 0.54, h * 0.76, 1);
      g.fillCircle(w * 0.58, h * 0.76, 1);
      g.lineStyle(1, 0x0b1520, 0.9);
      g.strokeRect(w * 0.48, h * 0.6, w * 0.16, h * 0.3);
    } else if (type === 'barracks') {
      const roofColor = 0x3d3a35;
      const roofRidge = 0x6a5a45;
      const wallColor = 0xc59a62;
      drawChineseRoof(g, w * 0.04, w * 0.96, h * 0.12, h * 0.38, roofColor, roofRidge);
      // walls
      g.fillStyle(wallColor, 1);
      g.fillRect(w * 0.12, h * 0.38, w * 0.76, h * 0.52);
      g.lineStyle(1, 0x6a4a2a, 0.7);
      g.strokeRect(w * 0.12, h * 0.38, w * 0.76, h * 0.52);
      // red pillars at corners
      drawRedPillar(g, w * 0.16, h * 0.38, h * 0.52);
      drawRedPillar(g, w * 0.84, h * 0.38, h * 0.52);
      // weapon rack inside (vertical spears)
      g.fillStyle(0x3a2a18, 1);
      g.fillRect(w * 0.3, h * 0.66, w * 0.4, 2);
      g.fillStyle(0x6a3018, 1);
      for (let i = 0; i < 5; i += 1) {
        const sx = w * 0.34 + i * w * 0.08;
        g.fillRect(sx - 0.5, h * 0.48, 1, h * 0.2);
        g.fillStyle(0xe8e4d2, 1);
        g.fillTriangle(sx - 1.5, h * 0.48, sx + 1.5, h * 0.48, sx, h * 0.44);
        g.fillStyle(0x6a3018, 1);
      }
      // red banner hanging on right
      drawHangingBanner(g, w * 0.84, h * 0.42, 6, 18, 0xc23636);
      drawHangingBanner(g, w * 0.16, h * 0.42, 6, 18, 0xc23636);
    } else if (type === 'archeryRange') {
      const roofColor = 0x3d3a35;
      const roofRidge = 0x6a5a45;
      const wallColor = 0xb7cadc;
      drawChineseRoof(g, w * 0.04, w * 0.96, h * 0.12, h * 0.38, roofColor, roofRidge);
      // walls
      g.fillStyle(wallColor, 1);
      g.fillRect(w * 0.12, h * 0.38, w * 0.76, h * 0.52);
      g.lineStyle(1, 0x6a4a2a, 0.7);
      g.strokeRect(w * 0.12, h * 0.38, w * 0.76, h * 0.52);
      // red pillars
      drawRedPillar(g, w * 0.16, h * 0.38, h * 0.52);
      drawRedPillar(g, w * 0.84, h * 0.38, h * 0.52);
      // target in front (round, concentric)
      g.fillStyle(0xf4f0dd, 1);
      g.fillCircle(w * 0.5, h * 0.66, h * 0.14);
      g.fillStyle(0xc23636, 1);
      g.fillCircle(w * 0.5, h * 0.66, h * 0.09);
      g.fillStyle(0xf4f0dd, 1);
      g.fillCircle(w * 0.5, h * 0.66, h * 0.04);
      g.fillStyle(0xc23636, 1);
      g.fillCircle(w * 0.5, h * 0.66, 1);
      // target stand (wood sticks)
      g.fillStyle(0x5c3a1e, 1);
      g.fillRect(w * 0.38, h * 0.82, 2, h * 0.1);
      g.fillRect(w * 0.6, h * 0.82, 2, h * 0.1);
      // arrows stuck in target
      g.fillStyle(0x5c3a1e, 1);
      g.fillRect(w * 0.46, h * 0.66 - 1, 6, 1);
      g.fillRect(w * 0.5, h * 0.66 + 3, 5, 1);
    } else if (type === 'monastery') {
      const roofColor = 0x4a3020;
      const roofRidge = 0x6a4a30;
      const wallColor = 0x8f6540;
      drawChineseRoof(g, w * 0.04, w * 0.96, h * 0.12, h * 0.38, roofColor, roofRidge);
      // walls
      g.fillStyle(wallColor, 1);
      g.fillRect(w * 0.12, h * 0.38, w * 0.76, h * 0.52);
      g.lineStyle(1, 0x3a2a1a, 0.8);
      g.strokeRect(w * 0.12, h * 0.38, w * 0.76, h * 0.52);
      // dark open stall
      g.fillStyle(0x2a1a10, 1);
      g.fillRect(w * 0.22, h * 0.5, w * 0.24, h * 0.38);
      g.fillRect(w * 0.54, h * 0.5, w * 0.24, h * 0.38);
      // horse silhouette in right stall
      g.fillStyle(0x5c3a1e, 1);
      g.fillRoundedRect(w * 0.58, h * 0.68, w * 0.18, h * 0.12, 3);
      g.fillRect(w * 0.74, h * 0.62, 4, 8);
      g.fillRect(w * 0.6, h * 0.8, 2, 6);
      g.fillRect(w * 0.66, h * 0.8, 2, 6);
      g.fillRect(w * 0.72, h * 0.8, 2, 6);
      // hay in left stall
      g.fillStyle(0xd4a23a, 0.8);
      g.fillRect(w * 0.26, h * 0.82, w * 0.16, 3);
      g.fillRect(w * 0.26, h * 0.78, w * 0.14, 2);
      // red pillars
      drawRedPillar(g, w * 0.16, h * 0.38, h * 0.52);
      drawRedPillar(g, w * 0.5, h * 0.38, h * 0.52);
      drawRedPillar(g, w * 0.84, h * 0.38, h * 0.52);
    }
  });
}

function buildFarmZoneTexture(scene) {
  const w = 160;
  const h = 110;
  bake(scene, 'node_farmZone', w, h, (g) => {
    // soil base
    g.fillStyle(0x5d3f24, 1);
    g.fillRect(10, 12, w - 20, h - 24);
    g.fillStyle(0x6d4a2a, 1);
    for (let y = 20; y < h - 20; y += 12) {
      g.fillRect(14, y, w - 28, 4);
      g.fillStyle(shade(0x6d4a2a, -0.12), 1);
      g.fillRect(14, y + 4, w - 28, 1);
      g.fillStyle(0x6d4a2a, 1);
    }

    // wheat rows
    const rows = [26, 40, 54, 68, 82];
    rows.forEach((rowY, rowIndex) => {
      for (let x = 20 + (rowIndex % 2) * 6; x < w - 18; x += 14) {
        g.fillStyle(0xcf9f3c, 1);
        g.fillRect(x, rowY, 2, 11);
        g.fillStyle(0xe8c656, 1);
        g.fillTriangle(x - 2, rowY + 1, x + 3, rowY + 1, x + 1, rowY + 7);
        g.fillTriangle(x - 1, rowY + 5, x + 4, rowY + 5, x + 1, rowY + 11);
      }
    });

    // worn fence posts
    g.fillStyle(0x6b4a2a, 1);
    const topPosts = [18, 40, 62, 84, 108, 130, 150];
    topPosts.forEach((x, i) => {
      const ph = i % 3 === 0 ? 14 : i % 3 === 1 ? 11 : 9;
      g.fillRect(x, 10, 4, ph);
      g.fillStyle(0x8a6235, 1);
      g.fillRect(x + 1, 10, 2, 2);
      g.fillStyle(0x6b4a2a, 1);
    });
    const bottomPosts = [24, 48, 72, 96, 120, 144];
    bottomPosts.forEach((x, i) => {
      const ph = i % 2 === 0 ? 12 : 9;
      g.fillRect(x, h - 22, 4, ph);
      g.fillStyle(0x8a6235, 1);
      g.fillRect(x + 1, h - 22, 2, 2);
      g.fillStyle(0x6b4a2a, 1);
    });
    const leftPosts = [22, 44, 66, 88];
    leftPosts.forEach((y, i) => {
      const pw = i % 2 === 0 ? 12 : 9;
      g.fillRect(10, y, 4, pw);
      g.fillStyle(0x8a6235, 1);
      g.fillRect(10, y + 1, 2, 2);
      g.fillStyle(0x6b4a2a, 1);
    });
    const rightPosts = [18, 42, 66, 90];
    rightPosts.forEach((y, i) => {
      const pw = i % 2 === 0 ? 12 : 9;
      g.fillRect(w - 14, y, 4, pw);
      g.fillStyle(0x8a6235, 1);
      g.fillRect(w - 14, y + 1, 2, 2);
      g.fillStyle(0x6b4a2a, 1);
    });

    g.lineStyle(1.5, 0x0b1520, 0.9);
    g.strokeRect(10, 12, w - 20, h - 24);
  });
}

function buildGoldMineTexture(scene) {
  const w = 90;
  const h = 80;
  bake(scene, 'node_goldMine', w, h, (g) => {
    // base shadow
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(w / 2, h - 3, w * 0.8, 7);

    // rocky outcrop
    g.fillStyle(0x646d79, 1);
    g.fillEllipse(w * 0.5, h * 0.48, w * 0.76, h * 0.64);
    g.fillStyle(0x7d8591, 1);
    g.fillCircle(w * 0.24, h * 0.36, 13);
    g.fillCircle(w * 0.47, h * 0.28, 16);
    g.fillCircle(w * 0.72, h * 0.38, 12);
    g.fillStyle(0x9098a4, 1);
    g.fillCircle(w * 0.34, h * 0.58, 10);
    g.fillCircle(w * 0.63, h * 0.6, 11);

    // mine opening
    g.fillStyle(0x161316, 1);
    g.fillEllipse(w * 0.5, h * 0.56, w * 0.28, h * 0.24);

    // wooden support beam
    g.fillStyle(0x6a4a2a, 1);
    g.fillRect(w * 0.36, h * 0.36, 5, h * 0.22);
    g.fillRect(w * 0.59, h * 0.36, 5, h * 0.22);
    g.fillRect(w * 0.34, h * 0.36, w * 0.3, 4);
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(w * 0.34, h * 0.36, w * 0.3, 2);

    // gold veins
    g.fillStyle(0xd6b23a, 1);
    g.fillRect(w * 0.2, h * 0.28, 3, 16);
    g.fillRect(w * 0.3, h * 0.2, 4, 24);
    g.fillRect(w * 0.43, h * 0.18, 3, 22);
    g.fillRect(w * 0.58, h * 0.22, 4, 18);
    g.fillRect(w * 0.72, h * 0.42, 3, 14);
    g.fillStyle(0xf0d86a, 1);
    g.fillTriangle(w * 0.24, h * 0.28, w * 0.29, h * 0.24, w * 0.32, h * 0.33);
    g.fillTriangle(w * 0.46, h * 0.18, w * 0.52, h * 0.22, w * 0.48, h * 0.3);
    g.fillTriangle(w * 0.64, h * 0.28, w * 0.7, h * 0.31, w * 0.66, h * 0.38);

    g.lineStyle(1.5, 0x0b1520, 0.9);
    g.strokeEllipse(w * 0.5, h * 0.48, w * 0.76, h * 0.64);
    g.strokeEllipse(w * 0.5, h * 0.56, w * 0.28, h * 0.24);
  });
}

function buildArrowTexture(scene) {
  const w = 28;
  const h = 6;
  bake(scene, 'fx_arrow', w, h, (g) => {
    g.fillStyle(0x6a4a2a, 1);
    g.fillRect(4, h / 2 - 1, w - 10, 2);
    g.fillStyle(0xe8e4d2, 1);
    g.fillTriangle(w - 6, 0, w, h / 2, w - 6, h);
    g.fillStyle(0xc23636, 1);
    g.fillTriangle(0, 0, 5, h / 2, 0, h);
  });
}

function buildSparkTexture(scene) {
  const s = 18;
  bake(scene, 'fx_spark', s, s, (g) => {
    g.fillStyle(0xffe58a, 1);
    g.fillCircle(s / 2, s / 2, 3);
    g.lineStyle(2, 0xffe58a, 0.9);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const r1 = 3;
      const r2 = 8;
      g.lineBetween(s / 2 + Math.cos(a) * r1, s / 2 + Math.sin(a) * r1, s / 2 + Math.cos(a) * r2, s / 2 + Math.sin(a) * r2);
    }
  });
}

function buildGrassTuftTexture(scene) {
  const w = 20;
  const h = 10;
  bake(scene, 'env_grass', w, h, (g) => {
    g.fillStyle(0x3a5e2e, 0.9);
    g.fillTriangle(2, h, 6, 0, 10, h);
    g.fillTriangle(8, h, 12, 2, 16, h);
    g.fillStyle(0x4c7a3a, 0.9);
    g.fillTriangle(4, h, 8, 3, 12, h);
  });
}

function buildTreeTexture(scene) {
  const w = 34;
  const h = 44;
  bake(scene, 'env_tree', w, h, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(w / 2, h - 3, w * 0.7, 6);
    g.fillStyle(0x3a2a18, 1);
    g.fillRect(w / 2 - 3, h * 0.55, 6, h * 0.35);
    g.fillStyle(0x2e4a22, 1);
    g.fillCircle(w / 2, h * 0.38, w * 0.42);
    g.fillStyle(0x4a6e30, 1);
    g.fillCircle(w / 2 - 4, h * 0.3, w * 0.28);
    g.fillCircle(w / 2 + 5, h * 0.34, w * 0.24);
    g.lineStyle(1, 0x1a2a12, 0.6);
    g.strokeCircle(w / 2, h * 0.38, w * 0.42);
  });
}

function buildRockTexture(scene) {
  const w = 26;
  const h = 18;
  bake(scene, 'env_rock', w, h, (g) => {
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(w / 2, h - 2, w * 0.8, 4);
    g.fillStyle(0x6b7280, 1);
    g.fillEllipse(w / 2, h / 2, w * 0.9, h * 0.85);
    g.fillStyle(0x8a93a0, 1);
    g.fillEllipse(w * 0.42, h * 0.38, w * 0.5, h * 0.35);
    g.lineStyle(1, 0x2b313a, 0.7);
    g.strokeEllipse(w / 2, h / 2, w * 0.9, h * 0.85);
  });
}

function buildBannerTexture(scene) {
  const w = 16;
  const h = 24;
  bake(scene, 'env_banner', w, h, (g) => {
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(w / 2 - 1, 0, 2, h);
    g.fillStyle(0xd4bd87, 1);
    g.fillTriangle(w / 2 + 1, 2, w / 2 + 1, 14, w - 1, 8);
  });
}

function shade(color, amount) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const adjust = (c) => {
    const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return (adjust(r) << 16) | (adjust(g) << 8) | adjust(b);
}
