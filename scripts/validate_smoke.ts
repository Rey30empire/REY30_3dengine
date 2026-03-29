import { POST } from '../src/app/api/character/validate/route';

const mesh = {
  vertices: [
    { x: -1, y: -1, z: -1 },
    { x: 1, y: -1, z: -1 },
    { x: 1, y: 1, z: -1 },
    { x: -1, y: 1, z: -1 },
    { x: -1, y: -1, z: 1 },
    { x: 1, y: -1, z: 1 },
    { x: 1, y: 1, z: 1 },
    { x: -1, y: 1, z: 1 },
  ],
  faces: [
    // front (+Z)
    [4, 5, 6],
    [4, 6, 7],
    // back (-Z)
    [0, 2, 1],
    [0, 3, 2],
    // right (+X)
    [1, 2, 6],
    [1, 6, 5],
    // left (-X)
    [0, 7, 3],
    [0, 4, 7],
    // top (+Y)
    [3, 6, 2],
    [3, 7, 6],
    // bottom (-Y)
    [0, 1, 5],
    [0, 5, 4],
  ],
  uvs: [
    { u: 0.0, v: 0.0 },
    { u: 0.4, v: 0.1 },
    { u: 0.8, v: 0.0 },
    { u: 1.0, v: 0.3 },
    { u: 0.0, v: 0.7 },
    { u: 0.3, v: 1.0 },
    { u: 0.7, v: 0.9 },
    { u: 1.0, v: 1.0 },
  ],
  weights: Array.from({ length: 8 }, () => [1]),
  boneIndices: Array.from({ length: 8 }, () => [0]),
};

const rig = [
  { name: 'Hips', parent: null, position: { x: 0, y: 0, z: 0 } },
  { name: 'Spine', parent: 'Hips', position: { x: 0, y: 0.5, z: 0 } },
  { name: 'Chest', parent: 'Spine', position: { x: 0, y: 1.0, z: 0 } },
  { name: 'Neck', parent: 'Chest', position: { x: 0, y: 1.3, z: 0 } },
  { name: 'Head', parent: 'Neck', position: { x: 0, y: 1.6, z: 0 } },
];

const body = {
  mesh,
  rig,
  target: 'game',
  failOnError: true,
};

async function main() {
  const req = new Request('http://localhost/api/character/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const res = await POST(req as any);
  const data = await res.json();

  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
