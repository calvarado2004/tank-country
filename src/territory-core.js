export const NEUTRAL = 0;
export const PLAYER = 1;
export const ENEMY = 2;

export const OWNER_MIN = 0.045;
export const CONTEST_MIN = 0.055;
export const CONTEST_MARGIN = 0.055;

export function influenceAt(sources, x, z) {
  let player = 0;
  let enemy = 0;
  for (const source of sources) {
    const d = Math.hypot(x - source.x, z - source.z);
    if (d >= source.radius) continue;
    const t = 1 - d / source.radius;
    const value = t * t * source.strength;
    if (source.faction === 'player') player += value;
    else enemy += value;
  }
  return { player, enemy };
}

export function classifyCell(player, enemy) {
  if (player <= OWNER_MIN && enemy <= OWNER_MIN) {
    return { owner: NEUTRAL, contested: false };
  }
  const owner = player >= enemy ? PLAYER : ENEMY;
  const contested = player > CONTEST_MIN
    && enemy > CONTEST_MIN
    && Math.abs(player - enemy) < CONTEST_MARGIN;
  return { owner, contested };
}

// Fill an n x n ownership grid in world space. Pure data in, pure data out;
// Territory.js only adds the meshes and the canvas on top.
export function computeOwnership({ sources, half, n }) {
  const cell = (half * 2) / n;
  const owner = new Uint8Array(n * n);
  const contested = new Uint8Array(n * n);
  let players = 0;
  let enemies = 0;
  let contestedCount = 0;
  for (let j = 0; j < n; j++) {
    const z = -half + (j + 0.5) * cell;
    for (let i = 0; i < n; i++) {
      const x = -half + (i + 0.5) * cell;
      const { player, enemy } = influenceAt(sources, x, z);
      const result = classifyCell(player, enemy);
      const idx = j * n + i;
      owner[idx] = result.owner;
      contested[idx] = result.contested ? 1 : 0;
      if (result.contested) contestedCount++;
      else if (result.owner === PLAYER) players++;
      else if (result.owner === ENEMY) enemies++;
    }
  }
  const total = n * n;
  return {
    owner,
    contested,
    cell,
    total,
    players,
    enemies,
    contestedCount,
    playerShare: players / total,
    enemyShare: enemies / total,
    contestedShare: contestedCount / total,
  };
}
