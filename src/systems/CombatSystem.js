import Phaser from '../phaser.js';

export default class CombatSystem {
  constructor(scene) {
    this.scene = scene;
  }

  update(dt) {
    const units = [...this.scene.units];
    for (const unit of units) {
      unit.update(dt, this);
    }

    const buildings = [...this.scene.buildings];
    for (const building of buildings) {
      building.update(dt, this);
    }
  }

  resolveTarget(target) {
    if (!target || target.dead) {
      return null;
    }

    return target;
  }

  isEnemy(entity, other) {
    return entity && other && !other.dead && entity.factionId !== other.factionId;
  }

  findEnemiesInRange(entity, range, factionId = entity.factionId) {
    const enemies = [];
    const rangeSq = range * range;
    const ex = entity.x;
    const ey = entity.y;

    for (const other of this.scene.units) {
      if (!other || other.dead || other.factionId === factionId) continue;
      const dx = other.x - ex;
      const dy = other.y - ey;
      if (dx * dx + dy * dy <= rangeSq) enemies.push(other);
    }
    for (const other of this.scene.buildings) {
      if (!other || other.dead || other.factionId === factionId) continue;
      const dx = other.x - ex;
      const dy = other.y - ey;
      if (dx * dx + dy * dy <= rangeSq) enemies.push(other);
    }

    return enemies;
  }

  findNearestEnemy(entity, range) {
    const rangeSq = range * range;
    const ex = entity.x;
    const ey = entity.y;
    let best = null;
    let bestSq = rangeSq;
    const factionId = entity.factionId;

    for (const other of this.scene.units) {
      if (!other || other.dead || other.factionId === factionId) continue;
      const dx = other.x - ex;
      const dy = other.y - ey;
      const sq = dx * dx + dy * dy;
      if (sq <= bestSq) { bestSq = sq; best = other; }
    }
    for (const other of this.scene.buildings) {
      if (!other || other.dead || other.factionId === factionId) continue;
      const dx = other.x - ex;
      const dy = other.y - ey;
      const sq = dx * dx + dy * dy;
      if (sq <= bestSq) { bestSq = sq; best = other; }
    }
    return best;
  }

  dealDamage(attacker, target, amount) {
    if (!attacker || !target || attacker.dead || target.dead) {
      return 0;
    }

    const dealt = target.takeDamage(amount, attacker);
    this.scene.spawnDamageText(target.x, target.y - 18, dealt, target.factionId === this.scene.playerFactionId ? 0xffd87d : 0xff9b90);
    if (target.dead && attacker?.isHero && attacker.heroId === 'lionheart') {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + 6);
      attacker.updateVisuals();
    }
    return dealt;
  }
}
