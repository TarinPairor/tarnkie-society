// Advance with actual travel, so running speeds up the gait and collisions stop it.
export function advanceWalk(actor, distance) {
  actor.walkDistance = actor.walking && distance > 0 ? (actor.walkDistance || 0) + distance : 0;
}
export function walkingSprite(actor, kind) {
  if(actor.hugging&&['tarin','amy'].includes(kind))return `${kind}-hug`;
  if (!actor.walking || !['tarin', 'amy'].includes(kind)) return kind;
  const stride = kind === 'tarin' ? 14 : 6;
  return `${kind}-walk-${Math.floor((actor.walkDistance || 0) / stride) % 2 + 1}`;
}

// Tarin's supplied artwork faces left; the other sprites use a right-facing base.
// actor.flip records intended leftward facing, independently of source artwork.
export function spriteFlip(actor,kind){return kind==='tarin'?!actor.flip:!!actor.flip;}
