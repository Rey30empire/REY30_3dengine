// ============================================
// Character Auto Validation Pipeline
// Checks polycount, UVs, degenerate/flipped faces, rig coverage.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

type Vec3 = { x: number; y: number; z: number };
type Face = [number, number, number];
type UV = { u: number; v: number };
type MeshData = {
  vertices: Vec3[];
  faces: Face[];
  uvs?: UV[];
  weights?: number[][];
  boneIndices?: number[][];
};
type RigBone = { name: string; parent: string | null; position: Vec3 };

type RequestBody = {
  path?: string;
  mesh?: MeshData;
  rig?: RigBone[];
  target?: 'game' | 'cinematic' | 'mobile';
  maxPolycount?: number;
  failOnError?: boolean;
};

type ValidationIssue = { type: string; severity: 'info' | 'warn' | 'error'; detail: string };

const ASSET_ROOT = process.env.REY30_ASSET_ROOT || path.join(process.cwd(), 'download', 'assets');

function resolveMeshPath(inputPath: string): string {
  const trimmed = inputPath.trim();
  const normalized = trimmed.replace(/^\.?[\\/]+/, '');
  const absolute = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(ASSET_ROOT, normalized);
  const rel = path.relative(ASSET_ROOT, absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid mesh path');
  }
  if (path.extname(absolute).toLowerCase() !== '.json') {
    throw new Error('Only .json mesh files are allowed');
  }
  return absolute;
}

function loadMeshFromFile(abs: string): Promise<MeshData> {
  return fs.readFile(abs, 'utf-8').then((txt) => JSON.parse(txt));
}

function checkPolycount(mesh: MeshData, target: RequestBody['target'], maxPoly?: number): ValidationIssue[] {
  const tris = mesh.faces.length;
  const limit = maxPoly ?? (target === 'mobile' ? 5000 : target === 'cinematic' ? 50000 : 20000);
  if (tris > limit) {
    return [{ type: 'polycount', severity: 'warn', detail: `Polycount ${tris} > límite ${limit}` }];
  }
  return [{ type: 'polycount', severity: 'info', detail: `Polycount OK (${tris}/${limit})` }];
}

function checkUVs(mesh: MeshData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!mesh.uvs) {
    issues.push({ type: 'uv', severity: 'error', detail: 'No hay UVs' });
    return issues;
  }
  if (mesh.uvs.length !== mesh.vertices.length) {
    issues.push({
      type: 'uv',
      severity: 'warn',
      detail: `UV count ${mesh.uvs.length} != vertices ${mesh.vertices.length}`,
    });
  }
  mesh.uvs.forEach((uv, i) => {
    if (uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1) {
      issues.push({ type: 'uv', severity: 'warn', detail: `UV fuera de [0,1] en índice ${i}` });
    }
  });
  mesh.faces.forEach((f, idx) => {
    const [a, b, c] = f;
    const ua = mesh.uvs![a];
    const ub = mesh.uvs![b];
    const uc = mesh.uvs![c];
    const area = Math.abs((ub.u - ua.u) * (uc.v - ua.v) - (ub.v - ua.v) * (uc.u - ua.u)) / 2;
    if (area < 1e-6) {
      issues.push({ type: 'uv', severity: 'warn', detail: `UV degenerada en cara ${idx}` });
    }
  });
  if (!issues.length) issues.push({ type: 'uv', severity: 'info', detail: 'UVs OK' });
  return issues;
}

function checkGeometry(mesh: MeshData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  mesh.faces.forEach((f, idx) => {
    const [a, b, c] = f;
    const va = mesh.vertices[a];
    const vb = mesh.vertices[b];
    const vc = mesh.vertices[c];
    const ab = { x: vb.x - va.x, y: vb.y - va.y, z: vb.z - va.z };
    const ac = { x: vc.x - va.x, y: vc.y - va.y, z: vc.z - va.z };
    const cross = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x,
    };
    const area = Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z) / 2;
    if (area < 1e-8) {
      issues.push({ type: 'geometry', severity: 'error', detail: `Cara degenerada ${idx}` });
    }
  });
  if (!issues.length) issues.push({ type: 'geometry', severity: 'info', detail: 'Sin caras degeneradas' });
  return issues;
}

function checkFlippedFaces(mesh: MeshData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (mesh.faces.length === 0) return issues;

  const centroid = mesh.vertices.reduce(
    (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y, z: acc.z + v.z }),
    { x: 0, y: 0, z: 0 }
  );
  centroid.x /= mesh.vertices.length;
  centroid.y /= mesh.vertices.length;
  centroid.z /= mesh.vertices.length;

  let flipped = 0;
  mesh.faces.forEach((f) => {
    const [a, b, c] = f;
    const va = mesh.vertices[a];
    const vb = mesh.vertices[b];
    const vc = mesh.vertices[c];
    const ab = { x: vb.x - va.x, y: vb.y - va.y, z: vb.z - va.z };
    const ac = { x: vc.x - va.x, y: vc.y - va.y, z: vc.z - va.z };
    const normal = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x,
    };
    const faceCenter = {
      x: (va.x + vb.x + vc.x) / 3,
      y: (va.y + vb.y + vc.y) / 3,
      z: (va.z + vb.z + vc.z) / 3,
    };
    const toFace = {
      x: faceCenter.x - centroid.x,
      y: faceCenter.y - centroid.y,
      z: faceCenter.z - centroid.z,
    };
    const dot = normal.x * toFace.x + normal.y * toFace.y + normal.z * toFace.z;
    if (dot < 0) flipped += 1;
  });

  if (flipped > 0) {
    const ratio = flipped / mesh.faces.length;
    issues.push({
      type: 'flipped_faces',
      severity: ratio > 0.25 ? 'error' : 'warn',
      detail: `Caras potencialmente invertidas: ${flipped}/${mesh.faces.length}`,
    });
  } else {
    issues.push({ type: 'flipped_faces', severity: 'info', detail: 'Sin caras invertidas detectadas' });
  }

  return issues;
}

function checkBoundsOutliers(mesh: MeshData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (mesh.vertices.length === 0) return issues;

  const centroid = mesh.vertices.reduce(
    (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y, z: acc.z + v.z }),
    { x: 0, y: 0, z: 0 }
  );
  centroid.x /= mesh.vertices.length;
  centroid.y /= mesh.vertices.length;
  centroid.z /= mesh.vertices.length;

  const distances = mesh.vertices.map((v) => {
    const dx = v.x - centroid.x;
    const dy = v.y - centroid.y;
    const dz = v.z - centroid.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  });
  const mean = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / distances.length;
  const std = Math.sqrt(variance);
  const threshold = mean + 3 * std;
  const outliers = distances.filter((d) => d > threshold).length;

  if (outliers > 0) {
    issues.push({
      type: 'bounds_outliers',
      severity: outliers / mesh.vertices.length > 0.05 ? 'warn' : 'info',
      detail: `Vertices fuera de rango (>${threshold.toFixed(3)}): ${outliers}/${mesh.vertices.length}`,
    });
  } else {
    issues.push({ type: 'bounds_outliers', severity: 'info', detail: 'Sin outliers en bounding box' });
  }

  return issues;
}

function checkWeights(mesh: MeshData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!mesh.weights || mesh.weights.length === 0) {
    issues.push({ type: 'weights', severity: 'warn', detail: 'Sin pesos de skin; no se puede validar normalización' });
    return issues;
  }

  let invalid = 0;
  mesh.weights.forEach((weights, idx) => {
    const sum = weights.reduce((acc, w) => acc + w, 0);
    if (weights.some((w) => w < 0) || Math.abs(sum - 1) > 0.02) {
      invalid += 1;
    }
  });

  if (invalid > 0) {
    const ratio = invalid / mesh.weights.length;
    issues.push({
      type: 'weights',
      severity: ratio > 0.1 ? 'error' : 'warn',
      detail: `Pesos no normalizados en ${invalid}/${mesh.weights.length} vertices`,
    });
  } else {
    issues.push({ type: 'weights', severity: 'info', detail: 'Pesos normalizados' });
  }

  return issues;
}

function checkRig(rig?: RigBone[]): ValidationIssue[] {
  if (!rig) return [{ type: 'rig', severity: 'warn', detail: 'Sin rig provisto' }];
  const required = ['Hips', 'Spine', 'Chest', 'Neck', 'Head'];
  const missing = required.filter((r) => !rig.find((b) => b.name === r));
  const issues: ValidationIssue[] = [];
  if (missing.length) {
    issues.push({ type: 'rig', severity: 'error', detail: `Huesos faltantes: ${missing.join(', ')}` });
  } else {
    issues.push({ type: 'rig', severity: 'info', detail: 'Rig base presente' });
  }
  const pairs: Array<[string, string]> = [
    ['Arm.L', 'Arm.R'],
    ['Forearm.L', 'Forearm.R'],
    ['Hand.L', 'Hand.R'],
    ['Leg.L', 'Leg.R'],
    ['Shin.L', 'Shin.R'],
    ['Foot.L', 'Foot.R'],
  ];
  pairs.forEach(([l, r]) => {
    const hasL = rig.some((b) => b.name === l);
    const hasR = rig.some((b) => b.name === r);
    if (hasL !== hasR) {
      issues.push({ type: 'rig', severity: 'warn', detail: `Par incompleto: ${l}/${r}` });
    }
  });
  const names = new Set(rig.map((b) => b.name));
  const orphans = rig.filter((b) => b.parent && !names.has(b.parent));
  if (orphans.length) {
    issues.push({
      type: 'rig',
      severity: 'warn',
      detail: `Huesos huérfanos (parent faltante): ${orphans.map((b) => b.name).join(', ')}`,
    });
  }
  return issues;
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as RequestBody;
    let mesh: MeshData | undefined = body.mesh;

    if (!mesh && body.path) {
      const abs = resolveMeshPath(body.path);
      mesh = await loadMeshFromFile(abs);
    }

    if (!mesh) {
      return NextResponse.json({ success: false, error: 'Se requiere mesh o path' }, { status: 400 });
    }

    const target = body.target || 'game';
    const poly = checkPolycount(mesh, target, body.maxPolycount);
    const uv = checkUVs(mesh);
    const geom = checkGeometry(mesh);
    const flipped = checkFlippedFaces(mesh);
    const bounds = checkBoundsOutliers(mesh);
    const rigIssues = checkRig(body.rig);
    const weights = checkWeights(mesh);

    const issues = [...poly, ...uv, ...geom, ...flipped, ...bounds, ...rigIssues, ...weights];
    const severityRank: Record<ValidationIssue['severity'], number> = { info: 0, warn: 1, error: 2 };
    const worst = issues.reduce<ValidationIssue['severity']>(
      (acc, i) => (severityRank[i.severity] > severityRank[acc] ? i.severity : acc),
      'info'
    );

    if (body.failOnError && worst === 'error') {
      return NextResponse.json(
        {
          success: false,
          summary: `Validación falló. Severidad máxima: ${worst}`,
          issues,
          worstSeverity: worst,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      summary: `Validación completa. Severidad máxima: ${worst}`,
      issues,
      worstSeverity: worst,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('Validation error', error);
    return NextResponse.json({ success: false, error: 'Validation failed' }, { status: 500 });
  }
}
