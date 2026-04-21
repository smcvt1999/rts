export const FACTIONS = {
  england: {
    id: 'england',
    name: 'England',
    leader: 'King Edward',
    playable: true,
    focus: 'Ranged Dominance / Economy',
    color: 0x4c7bd9,
    accent: 0xcbd9ff,
    banner: 0x1c2f57,
    openingResources: { food: 220, gold: 150 },
    startingWorkers: 4,
    economy: { harvestRateMultiplier: 1.12 },
    modifiers: {
      unitCostMultiplier: 1.0,
      productionSpeedMultiplier: 1.0,
      unitHpMultiplier: 1.0,
      unitDamageMultiplier: 1.0,
      heroHpMultiplier: 1.08,
      heroDamageMultiplier: 1.03,
      heroSpeedMultiplier: 1.0,
      buildingCostMultiplier: 0.92,
    },
    unitBonuses: {
      archer: { attackRange: 1.25, attackSpeed: 1.10, hp: 1.0, damage: 1.0 },
      swordsman: { hp: 0.90, moveSpeed: 1.08, damage: 1.0 },
      lancer: {},
      monk: { healAmount: 0.85 },
      worker: { harvestTime: 0.88 },
    },
    passive: {
      id: 'longbow_doctrine',
      name: 'Longbow Doctrine',
      description: 'Archers gain +10% range when 3+ archers are nearby',
      archerGroupRange: 1.10,
      archerGroupMinCount: 3,
      archerGroupRadius: 200,
    },
    aiProfile: {
      preferredUnits: ['archer', 'swordsman', 'lancer', 'monk'],
      aggression: 0.6,
    },
  },
  france: {
    id: 'france',
    name: 'France',
    leader: 'King Philippe',
    playable: true,
    focus: 'Melee Burst / Hero-centric',
    color: 0xd94c4c,
    accent: 0xffd2d2,
    banner: 0x571c1c,
    openingResources: { food: 220, gold: 150 },
    startingWorkers: 4,
    economy: { harvestRateMultiplier: 1.0 },
    modifiers: {
      unitCostMultiplier: 1.0,
      productionSpeedMultiplier: 1.10,
      unitHpMultiplier: 1.0,
      unitDamageMultiplier: 1.0,
      heroHpMultiplier: 1.22,
      heroDamageMultiplier: 1.18,
      heroSpeedMultiplier: 1.08,
      buildingCostMultiplier: 1.0,
    },
    unitBonuses: {
      swordsman: { damage: 1.18, hp: 1.08 },
      lancer: { damage: 1.10 },
      archer: {},
      monk: { healAmount: 1.30, healRange: 1.15 },
      worker: {},
    },
    passive: {
      id: 'chivalry',
      name: 'Chivalry',
      description: 'Warriors near hero gain +8% damage',
      heroAuraDamage: 1.08,
      heroAuraRadius: 200,
    },
    aiProfile: {
      preferredUnits: ['swordsman', 'monk', 'archer', 'lancer'],
      aggression: 0.75,
    },
  },
  germany: {
    id: 'germany',
    name: 'Germany',
    leader: 'Kaiser Friedrich',
    playable: true,
    focus: 'Heavy Defense / Late-game',
    color: 0xd9b84c,
    accent: 0xfff2c5,
    banner: 0x574a14,
    openingResources: { food: 220, gold: 150 },
    startingWorkers: 4,
    economy: { harvestRateMultiplier: 1.0 },
    modifiers: {
      unitCostMultiplier: 1.0,
      productionSpeedMultiplier: 0.92,
      unitHpMultiplier: 1.0,
      unitDamageMultiplier: 1.0,
      heroHpMultiplier: 1.0,
      heroDamageMultiplier: 1.0,
      heroSpeedMultiplier: 1.0,
      buildingCostMultiplier: 1.0,
      buildingHpMultiplier: 1.15,
    },
    unitBonuses: {
      lancer: { hp: 1.15, armor: 2, damage: 1.08 },
      swordsman: { hp: 1.12, moveSpeed: 0.92 },
      archer: {},
      monk: { healAmount: 1.10 },
      worker: { buildSpeedMultiplier: 1.20 },
    },
    passive: {
      id: 'teutonic_discipline',
      name: 'Teutonic Discipline',
      description: 'Units near 3+ allies gain +1 armor',
      groupArmorBonus: 1,
      groupMinCount: 3,
      groupRadius: 150,
    },
    aiProfile: {
      preferredUnits: ['lancer', 'swordsman', 'monk', 'archer'],
      aggression: 0.55,
    },
  },
};

export const PLAYABLE_FACTIONS = Object.values(FACTIONS).filter((f) => f.playable);

export function getOpposingFactions(factionId) {
  return ['england', 'france', 'germany'].filter((id) => id !== factionId);
}

export function getOpposingPlayableFaction(factionId) {
  return getOpposingFactions(factionId)[0];
}
