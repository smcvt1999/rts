function jitter(center, pct) {
  const delta = center * pct * (Math.random() * 2 - 1);
  return Math.max(1, Math.round(center + delta));
}
function jitterFloat(center, pct) {
  const delta = center * pct * (Math.random() * 2 - 1);
  return Math.max(0.1, center + delta);
}
function perturbWeights(baseWeights, pct = 0.25) {
  const out = {};
  for (const [k, v] of Object.entries(baseWeights)) {
    out[k] = jitterFloat(v, pct);
  }
  return out;
}

export const AI_PROFILES = {
  rush: {
    id: 'rush',
    name: 'Early Rush',
    roll() {
      return {
        workerTarget: jitter(7, 0.2),
        firstWaveThreshold: jitter(5, 0.25),
        nextWaveThreshold: jitter(7, 0.2),
        buildCooldown: jitterFloat(1.8, 0.15),
        unitWeights: perturbWeights({ swordsman: 1.4, lancer: 0.8, archer: 0.4, monk: 0.2 }),
        buildOrder: ['barracks', 'house', 'archeryRange', 'monastery'],
      };
    },
  },
  boom: {
    id: 'boom',
    name: 'Economic Boom',
    roll() {
      return {
        workerTarget: jitter(14, 0.18),
        firstWaveThreshold: jitter(14, 0.2),
        nextWaveThreshold: jitter(18, 0.15),
        buildCooldown: jitterFloat(2.5, 0.15),
        unitWeights: perturbWeights({ swordsman: 1.0, lancer: 1.0, archer: 1.0, monk: 0.8 }),
        buildOrder: ['house', 'barracks', 'archeryRange', 'monastery'],
      };
    },
  },
  tech: {
    id: 'tech',
    name: 'Tech Focus',
    roll() {
      const bias = Math.random() < 0.5 ? 'archer' : 'lancer';
      const weights = bias === 'archer'
        ? { swordsman: 0.6, lancer: 0.5, archer: 1.6, monk: 0.6 }
        : { swordsman: 0.5, lancer: 1.6, archer: 0.5, monk: 0.8 };
      const buildOrder = bias === 'archer'
        ? ['barracks', 'archeryRange', 'house', 'monastery']
        : ['barracks', 'monastery', 'house', 'archeryRange'];
      return {
        workerTarget: jitter(9, 0.2),
        firstWaveThreshold: jitter(8, 0.2),
        nextWaveThreshold: jitter(10, 0.2),
        buildCooldown: jitterFloat(2.2, 0.15),
        unitWeights: perturbWeights(weights),
        buildOrder,
        techBias: bias,
      };
    },
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced',
    roll() {
      return {
        workerTarget: jitter(10, 0.2),
        firstWaveThreshold: jitter(9, 0.2),
        nextWaveThreshold: jitter(12, 0.2),
        buildCooldown: jitterFloat(2.2, 0.15),
        unitWeights: perturbWeights({ swordsman: 1.0, lancer: 0.9, archer: 0.9, monk: 0.7 }),
        buildOrder: ['barracks', 'house', 'archeryRange', 'monastery'],
      };
    },
  },
};

const PROFILE_WEIGHTS = { rush: 1, boom: 1, tech: 1, balanced: 1.3 };

export function pickRandomAiProfile() {
  const entries = Object.entries(PROFILE_WEIGHTS);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [id, w] of entries) {
    if ((roll -= w) <= 0) return id;
  }
  return 'balanced';
}
