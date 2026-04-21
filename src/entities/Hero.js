import Phaser from '../phaser.js';
import Unit from './Unit.js';
import { HEROES } from '../data/heroes.js';

export default class Hero extends Unit {
  constructor(scene, config) {
    const heroTemplate = HEROES[config.heroId];
    super(scene, {
      ...config,
      unitTypeId: heroTemplate.id,
      label: heroTemplate.shortName || heroTemplate.name,
      size: config.size || 32,
      stats: config.stats,
      bodyColor: config.bodyColor,
      strokeColor: config.strokeColor,
      isHero: true,
    });

    this.heroId = heroTemplate.id;
    this.heroName = heroTemplate.name;
    this.heroTitle = heroTemplate.title;
    this.ability = heroTemplate.ability;
    this.traits = heroTemplate.traits || [];
    this.abilityCooldown = 0;
    this.heroPulse = 0;
    this.heroPassiveBurst = 0;
  }

  getMoveSpeed() {
    let speed = super.getMoveSpeed();
    if (this.heroId === 'lionheart' && this.hp / this.maxHp <= 0.45) {
      speed *= 1.15;
    }
    return speed;
  }

  getArmor() {
    let armor = super.getArmor();
    if (this.heroId === 'roland' && this.hp / this.maxHp <= 0.4) {
      armor += 2;
    }
    return armor;
  }

  update(dt, combatSystem) {
    if (this.dead) {
      return;
    }

    this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    if (this.heroPulse > 0) {
      this.heroPulse = Math.max(0, this.heroPulse - dt);
    }

    super.update(dt, combatSystem);
  }

  canUseAbility() {
    return this.abilityCooldown <= 0 && !this.dead;
  }

  useAbility(combatSystem) {
    if (!this.canUseAbility()) {
      return false;
    }

    if (this.heroId === 'lionheart') {
      const target = combatSystem.findNearestEnemy(this, 260);
      if (target) {
        this.setAttackTarget(target);
        combatSystem.dealDamage(this, target, this.getAttackDamage(target) * 2.25);
        const splash = combatSystem.findEnemiesInRange(target, 58, this.factionId);
        for (const enemy of splash) {
          if (enemy !== target) {
            combatSystem.dealDamage(this, enemy, this.getAttackDamage(enemy) * 0.7);
          }
        }
      }
      this.applyBuff({
        moveMultiplier: 1.28,
        damageMultiplier: 1.12,
        armorBonus: 1,
        duration: 4,
      });
    } else if (this.heroId === 'kaiser') {
      // Imperial Decree — buff nearby allies
      const nearbyAllies = this.scene.units.filter(
        (u) => !u.dead && u.factionId === this.factionId && u !== this
          && Phaser.Math.Distance.Between(u.x, u.y, this.x, this.y) < 200
      );
      for (const ally of nearbyAllies) {
        ally.applyBuff({ damageMultiplier: 1.25, armorBonus: 1, duration: 5 });
      }
      this.applyBuff({ damageMultiplier: 1.15, armorBonus: 2, duration: 5 });
    } else if (this.heroId === 'roland') {
      const enemies = combatSystem.findEnemiesInRange(this, 170, this.factionId);
      for (const enemy of enemies) {
        combatSystem.dealDamage(this, enemy, this.getAttackDamage(enemy) * 1.15);
      }
      this.applyBuff({
        moveMultiplier: 1.05,
        damageMultiplier: 1.2,
        armorBonus: 2,
        duration: 4.5,
      });
    }

    this.abilityCooldown = this.ability.cooldown;
    this.heroPulse = 0.6;
    this.flashHit();
    return true;
  }
}
