// Simple Roblox-style walking script
// Moves the entity forward in a loop so it "walks" in place.

let z = 0;
let dir = 1;

export function update(ctx: { deltaTime: number; setTransform: (t: { x?: number; y?: number; z?: number }) => void }) {
  const speed = 1.2;
  z += dir * speed * ctx.deltaTime;

  if (z > 4) {
    z = 4;
    dir = -1;
  } else if (z < -4) {
    z = -4;
    dir = 1;
  }

  ctx.setTransform({ z });
}
