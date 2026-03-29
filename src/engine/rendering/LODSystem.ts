import * as THREE from 'three';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Represents a single LOD level with mesh and distance threshold
 */
export interface LODLevel {
  mesh: THREE.Mesh | THREE.BufferGeometry;
  distance: number;
  screenCoverage?: number;
  transitionDuration?: number;
  hysteresis?: number;
  triangleCount?: number;
  isImpostor?: boolean;
  impostorTexture?: THREE.Texture;
}

/**
 * Configuration for LOD system behavior
 */
export interface LODConfig {
  levels: LODLevel[];
  fadeMode: 'none' | 'crossfade' | 'pop';
  fadeDuration: number;
  updateInterval: number;
  bias: number;
  useScreenCoverage: boolean;
  screenCoverageThreshold: number;
  autoGenerate: boolean;
  simplificationRatio: number[];
  hysteresis: number;
  dynamicLoading: boolean;
  unloadDistance: number;
}

/**
 * Statistics for LOD performance monitoring
 */
export interface LODStats {
  totalObjects: number;
  activeLODs: Map<string, number>;
  triangleCountSavings: number;
  drawCallsReduction: number;
  memoryUsage: number;
  averageLODLevel: number;
  objectsAtLOD: number[];
  impostorCount: number;
  streamedLODCount: number;
}

/**
 * Streaming LOD item for priority queue
 */
export interface StreamingLODItem {
  id: string;
  lod: THREE.LOD;
  distance: number;
  priority: number;
  requiredLevel: number;
  loadedLevels: Set<number>;
  status: 'pending' | 'loading' | 'loaded' | 'unloading';
}

/**
 * Impostor render data
 */
export interface ImpostorData {
  texture: THREE.Texture;
  renderTargets: THREE.WebGLRenderTarget[];
  angles: THREE.Vector3[];
  frames: number;
  resolution: number;
  billboardMesh?: THREE.Mesh;
}

/**
 * LOD group configuration
 */
export interface LODGroupConfig {
  id: string;
  objects: THREE.LOD[];
  baseDistance: number;
  distanceScale: number;
  relativeDistances: boolean;
}

// ============================================================================
// LOD PRESETS
// ============================================================================

export const LODPresets = {
  high: {
    distances: [0, 50, 100, 200, 400],
    simplificationRatios: [1, 0.5, 0.25, 0.125, 0.0625],
    fadeDuration: 0.3,
    updateInterval: 50
  },
  medium: {
    distances: [0, 30, 60, 120, 240],
    simplificationRatios: [1, 0.5, 0.25, 0.125, 0.0625],
    fadeDuration: 0.2,
    updateInterval: 100
  },
  low: {
    distances: [0, 20, 40, 80, 160],
    simplificationRatios: [1, 0.5, 0.25, 0.125, 0.0625],
    fadeDuration: 0.1,
    updateInterval: 150
  },
  impostor: {
    distances: [0, 10, 20, 40, 80, 160],
    simplificationRatios: [1, 0.5, 0.25, 0.125, 0.0625, 'billboard'],
    fadeDuration: 0.15,
    updateInterval: 100
  }
} as const;

// ============================================================================
// LOD GENERATOR - Geometry Simplification
// ============================================================================

export class LODGenerator {
  private static instance: LODGenerator;
  
  public static getInstance(): LODGenerator {
    if (!LODGenerator.instance) {
      LODGenerator.instance = new LODGenerator();
    }
    return LODGenerator.instance;
  }

  /**
   * Simplify geometry using quadric error mesh decimation
   */
  public simplifyGeometry(
    geometry: THREE.BufferGeometry,
    ratio: number,
    preserveUVs: boolean = true,
    preserveNormals: boolean = true
  ): THREE.BufferGeometry {
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const indices = geometry.getIndex();
    
    if (!positions || !indices) {
      console.warn('LODGenerator: Geometry missing positions or indices');
      return geometry.clone();
    }

    const targetVertexCount = Math.floor(positions.count * ratio);
    
    if (targetVertexCount < 3) {
      return this.createMinimalGeometry(geometry);
    }

    // Build adjacency data structure
    const meshData = this.buildMeshData(geometry);
    
    // Compute quadric error metrics for each vertex
    const quadrics = this.computeQuadrics(meshData);
    
    // Build edge collapse priority queue
    const edgeQueue = this.buildEdgeQueue(meshData, quadrics);
    
    // Collapse edges until target is reached
    const simplified = this.collapseEdges(meshData, edgeQueue, targetVertexCount, preserveUVs);
    
    // Reconstruct geometry
    const newGeometry = this.reconstructGeometry(simplified, geometry, preserveUVs, preserveNormals);
    
    return newGeometry;
  }

  /**
   * Build internal mesh data structure
   */
  private buildMeshData(geometry: THREE.BufferGeometry): MeshData {
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const uvs = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const indices = geometry.getIndex()!;
    
    const vertices: Vertex[] = [];
    const triangles: Triangle[] = [];
    
    // Extract vertices
    for (let i = 0; i < positions.count; i++) {
      vertices.push({
        position: new THREE.Vector3(
          positions.getX(i),
          positions.getY(i),
          positions.getZ(i)
        ),
        normal: normals ? new THREE.Vector3(
          normals.getX(i),
          normals.getY(i),
          normals.getZ(i)
        ) : undefined,
        uv: uvs ? new THREE.Vector2(
          uvs.getX(i),
          uvs.getY(i)
        ) : undefined,
        index: i,
        quadric: new QuadricMatrix()
      });
    }
    
    // Extract triangles
    for (let i = 0; i < indices.count; i += 3) {
      triangles.push({
        v1: indices.getX(i),
        v2: indices.getX(i + 1),
        v3: indices.getX(i + 2),
        normal: this.computeTriangleNormal(vertices, indices.getX(i), indices.getX(i + 1), indices.getX(i + 2))
      });
    }
    
    return { vertices, triangles };
  }

  /**
   * Compute quadric error metrics
   */
  private computeQuadrics(meshData: MeshData): QuadricMatrix[] {
    const quadrics: QuadricMatrix[] = meshData.vertices.map(() => new QuadricMatrix());
    
    for (const tri of meshData.triangles) {
      const v1 = meshData.vertices[tri.v1].position;
      const v2 = meshData.vertices[tri.v2].position;
      const v3 = meshData.vertices[tri.v3].position;
      
      // Compute plane equation
      const plane = this.computePlane(v1, v2, v3);
      const q = QuadricMatrix.fromPlane(plane);
      
      quadrics[tri.v1].add(q);
      quadrics[tri.v2].add(q);
      quadrics[tri.v3].add(q);
    }
    
    return quadrics;
  }

  /**
   * Build priority queue of collapsible edges
   */
  private buildEdgeQueue(meshData: MeshData, quadrics: QuadricMatrix[]): EdgeCollapse[] {
    const edges: Map<string, EdgeCollapse> = new Map();
    
    for (const tri of meshData.triangles) {
      this.addEdgeIfNeeded(edges, tri.v1, tri.v2, meshData, quadrics);
      this.addEdgeIfNeeded(edges, tri.v2, tri.v3, meshData, quadrics);
      this.addEdgeIfNeeded(edges, tri.v3, tri.v1, meshData, quadrics);
    }
    
    return Array.from(edges.values()).sort((a, b) => a.cost - b.cost);
  }

  /**
   * Add edge to queue if not exists
   */
  private addEdgeIfNeeded(
    edges: Map<string, EdgeCollapse>,
    v1: number,
    v2: number,
    meshData: MeshData,
    quadrics: QuadricMatrix[]
  ): void {
    const key = v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
    
    if (!edges.has(key)) {
      const q = QuadricMatrix.add(quadrics[v1], quadrics[v2]);
      const optimal = q.optimalPosition(meshData.vertices[v1].position, meshData.vertices[v2].position);
      const cost = q.evaluate(optimal);
      
      edges.set(key, {
        v1,
        v2,
        cost,
        newPosition: optimal,
        key
      });
    }
  }

  /**
   * Collapse edges iteratively
   */
  private collapseEdges(
    meshData: MeshData,
    edgeQueue: EdgeCollapse[],
    targetCount: number,
    preserveUVs: boolean
  ): MeshData {
    const vertexMap: number[] = meshData.vertices.map((_, i) => i);
    const validTriangles = new Set(meshData.triangles.map((_, i) => i));
    let currentCount = meshData.vertices.length;
    
    for (const edge of edgeQueue) {
      if (currentCount <= targetCount) break;
      
      const mappedV1 = this.findRoot(vertexMap, edge.v1);
      const mappedV2 = this.findRoot(vertexMap, edge.v2);
      
      if (mappedV1 === mappedV2) continue;
      if (!this.isEdgeCollapsible(meshData, mappedV1, mappedV2, validTriangles)) continue;
      
      // Collapse edge
      this.collapseEdge(meshData, vertexMap, mappedV1, mappedV2, edge.newPosition, validTriangles, preserveUVs);
      currentCount--;
    }
    
    return meshData;
  }

  /**
   * Find root in union-find structure
   */
  private findRoot(parents: number[], v: number): number {
    if (parents[v] !== v) {
      parents[v] = this.findRoot(parents, parents[v]);
    }
    return parents[v];
  }

  /**
   * Check if edge can be collapsed without causing mesh errors
   */
  private isEdgeCollapsible(
    meshData: MeshData,
    v1: number,
    v2: number,
    validTriangles: Set<number>
  ): boolean {
    // Check for triangle flips
    const sharedTriangles: number[] = [];
    const v1Triangles: number[] = [];
    const v2Triangles: number[] = [];
    
    meshData.triangles.forEach((tri, idx) => {
      if (!validTriangles.has(idx)) return;
      
      const hasV1 = tri.v1 === v1 || tri.v2 === v1 || tri.v3 === v1;
      const hasV2 = tri.v1 === v2 || tri.v2 === v2 || tri.v3 === v2;
      
      if (hasV1 && hasV2) {
        sharedTriangles.push(idx);
      } else if (hasV1) {
        v1Triangles.push(idx);
      } else if (hasV2) {
        v2Triangles.push(idx);
      }
    });
    
    // Check for link condition
    const v1Neighbors = this.getVertexNeighbors(meshData, v1, validTriangles);
    const v2Neighbors = this.getVertexNeighbors(meshData, v2, validTriangles);
    
    const sharedNeighbors = [...v1Neighbors].filter(n => v2Neighbors.has(n) && n !== v1 && n !== v2);
    
    // Link condition: shared neighbors should equal shared triangles * 2
    return sharedNeighbors.length === sharedTriangles.length;
  }

  /**
   * Get neighboring vertices
   */
  private getVertexNeighbors(meshData: MeshData, v: number, validTriangles: Set<number>): Set<number> {
    const neighbors = new Set<number>();
    
    meshData.triangles.forEach((tri, idx) => {
      if (!validTriangles.has(idx)) return;
      
      if (tri.v1 === v) {
        neighbors.add(tri.v2);
        neighbors.add(tri.v3);
      } else if (tri.v2 === v) {
        neighbors.add(tri.v1);
        neighbors.add(tri.v3);
      } else if (tri.v3 === v) {
        neighbors.add(tri.v1);
        neighbors.add(tri.v2);
      }
    });
    
    return neighbors;
  }

  /**
   * Perform edge collapse
   */
  private collapseEdge(
    meshData: MeshData,
    vertexMap: number[],
    v1: number,
    v2: number,
    newPosition: THREE.Vector3,
    validTriangles: Set<number>,
    preserveUVs: boolean
  ): void {
    // Update vertex position
    meshData.vertices[v1].position.copy(newPosition);
    
    // Merge UVs if needed
    if (preserveUVs && meshData.vertices[v1].uv && meshData.vertices[v2].uv) {
      meshData.vertices[v1].uv!.lerp(meshData.vertices[v2].uv!, 0.5);
    }
    
    // Union vertices
    vertexMap[v2] = v1;
    
    // Update triangles
    meshData.triangles.forEach((tri, idx) => {
      if (!validTriangles.has(idx)) return;
      
      if (tri.v1 === v2) tri.v1 = v1;
      if (tri.v2 === v2) tri.v2 = v1;
      if (tri.v3 === v2) tri.v3 = v1;
      
      // Remove degenerate triangles
      if (tri.v1 === tri.v2 || tri.v2 === tri.v3 || tri.v3 === tri.v1) {
        validTriangles.delete(idx);
      }
    });
  }

  /**
   * Reconstruct Three.js geometry from simplified mesh data
   */
  private reconstructGeometry(
    meshData: MeshData,
    originalGeometry: THREE.BufferGeometry,
    preserveUVs: boolean,
    preserveNormals: boolean
  ): THREE.BufferGeometry {
    const vertexMap = new Map<string, number>();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    
    let newIndex = 0;
    
    for (const tri of meshData.triangles) {
      const triIndices: number[] = [];
      
      for (const vIdx of [tri.v1, tri.v2, tri.v3]) {
        const vertex = meshData.vertices[vIdx];
        const key = this.vertexKey(vertex, preserveUVs);
        
        if (!vertexMap.has(key)) {
          vertexMap.set(key, newIndex);
          positions.push(vertex.position.x, vertex.position.y, vertex.position.z);
          
          if (preserveNormals && vertex.normal) {
            normals.push(vertex.normal.x, vertex.normal.y, vertex.normal.z);
          }
          
          if (preserveUVs && vertex.uv) {
            uvs.push(vertex.uv.x, vertex.uv.y);
          }
          
          newIndex++;
        }
        
        triIndices.push(vertexMap.get(key)!);
      }
      
      indices.push(...triIndices);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    
    if (normals.length > 0) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    } else {
      geometry.computeVertexNormals();
    }
    
    if (uvs.length > 0) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    
    // Copy other attributes if they exist
    this.copyAdditionalAttributes(originalGeometry, geometry);
    
    return geometry;
  }

  /**
   * Generate vertex key for deduplication
   */
  private vertexKey(vertex: Vertex, includeUV: boolean): string {
    const pos = `${vertex.position.x.toFixed(4)},${vertex.position.y.toFixed(4)},${vertex.position.z.toFixed(4)}`;
    if (includeUV && vertex.uv) {
      return `${pos}_${vertex.uv.x.toFixed(4)},${vertex.uv.y.toFixed(4)}`;
    }
    return pos;
  }

  /**
   * Copy additional attributes from original geometry
   */
  private copyAdditionalAttributes(source: THREE.BufferGeometry, target: THREE.BufferGeometry): void {
    const attrNames = ['color', 'uv2', 'tangent'];
    for (const name of attrNames) {
      if (source.hasAttribute(name)) {
        target.setAttribute(name, source.getAttribute(name).clone());
      }
    }
  }

  /**
   * Create minimal geometry for extreme simplification
   */
  private createMinimalGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Create a simple tetrahedron
    const tetraGeom = new THREE.TetrahedronGeometry(maxDim * 0.5);
    tetraGeom.translate(center.x, center.y, center.z);
    
    return tetraGeom;
  }

  /**
   * Compute triangle normal
   */
  private computeTriangleNormal(vertices: Vertex[], i1: number, i2: number, i3: number): THREE.Vector3 {
    const v1 = vertices[i1].position;
    const v2 = vertices[i2].position;
    const v3 = vertices[i3].position;
    
    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);
    
    return new THREE.Vector3().crossVectors(edge1, edge2).normalize();
  }

  /**
   * Compute plane equation from three points
   */
  private computePlane(p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3): number[] {
    const v1 = new THREE.Vector3().subVectors(p2, p1);
    const v2 = new THREE.Vector3().subVectors(p3, p1);
    const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
    
    const d = -normal.dot(p1);
    return [normal.x, normal.y, normal.z, d];
  }

  /**
   * Generate all LOD levels from a single mesh
   */
  public async generateLODLevels(
    mesh: THREE.Mesh,
    ratios: number[],
    distances: number[]
  ): Promise<LODLevel[]> {
    const levels: LODLevel[] = [];
    const geometry = mesh.geometry as THREE.BufferGeometry;
    
    for (let i = 0; i < ratios.length; i++) {
      let lodMesh: THREE.Mesh;
      
      if (i === 0) {
        // LOD0 is original mesh
        lodMesh = mesh.clone();
      } else {
        const ratio = ratios[i];
        
        if (typeof ratio === 'string' && ratio === 'billboard') {
          // Will be handled by impostor system
          continue;
        }
        
        const simplifiedGeom = this.simplifyGeometry(geometry, ratio as number, true, true);
        lodMesh = new THREE.Mesh(simplifiedGeom, mesh.material);
      }
      
      lodMesh.castShadow = mesh.castShadow;
      lodMesh.receiveShadow = mesh.receiveShadow;
      
      levels.push({
        mesh: lodMesh,
        distance: distances[i],
        triangleCount: this.getTriangleCount(lodMesh)
      });
    }
    
    return levels;
  }

  /**
   * Get triangle count from mesh
   */
  private getTriangleCount(mesh: THREE.Mesh): number {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const indices = geometry.getIndex();
    return indices ? indices.count / 3 : geometry.getAttribute('position').count / 3;
  }
}

// ============================================================================
// INTERNAL TYPES FOR SIMPLIFICATION
// ============================================================================

interface Vertex {
  position: THREE.Vector3;
  normal?: THREE.Vector3;
  uv?: THREE.Vector2;
  index: number;
  quadric: QuadricMatrix;
}

interface Triangle {
  v1: number;
  v2: number;
  v3: number;
  normal: THREE.Vector3;
}

interface MeshData {
  vertices: Vertex[];
  triangles: Triangle[];
}

interface EdgeCollapse {
  v1: number;
  v2: number;
  cost: number;
  newPosition: THREE.Vector3;
  key: string;
}

/**
 * Quadric error matrix for mesh simplification
 */
class QuadricMatrix {
  private m: number[];
  
  constructor() {
    this.m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }
  
  static fromPlane(plane: number[]): QuadricMatrix {
    const [a, b, c, d] = plane;
    const q = new QuadricMatrix();
    q.m = [
      a * a, a * b, a * c, a * d,
      b * b, b * c, b * d,
      c * c, c * d,
      d * d
    ];
    return q;
  }
  
  static add(q1: QuadricMatrix, q2: QuadricMatrix): QuadricMatrix {
    const result = new QuadricMatrix();
    for (let i = 0; i < 10; i++) {
      result.m[i] = q1.m[i] + q2.m[i];
    }
    return result;
  }
  
  add(other: QuadricMatrix): void {
    for (let i = 0; i < 10; i++) {
      this.m[i] += other.m[i];
    }
  }
  
  evaluate(v: THREE.Vector3): number {
    const [a2, ab, ac, ad, b2, bc, bd, c2, cd, d2] = this.m;
    const x = v.x, y = v.y, z = v.z;
    
    return a2 * x * x + 2 * ab * x * y + 2 * ac * x * z + 2 * ad * x +
           b2 * y * y + 2 * bc * y * z + 2 * bd * y +
           c2 * z * z + 2 * cd * z +
           d2;
  }
  
  optimalPosition(v1: THREE.Vector3, v2: THREE.Vector3): THREE.Vector3 {
    // Simplified: use midpoint as fallback
    // Full implementation would solve linear system
    return new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
  }
}

// ============================================================================
// IMPOSTOR SYSTEM - Billboard Generation
// ============================================================================

export class ImpostorSystem {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private impostorCache: Map<string, ImpostorData> = new Map();
  
  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
  }

  /**
   * Generate impostor textures from multiple angles
   */
  public generateImpostor(
    mesh: THREE.Mesh,
    resolution: number = 256,
    angles: number = 8
  ): ImpostorData {
    const id = mesh.uuid;
    
    if (this.impostorCache.has(id)) {
      return this.impostorCache.get(id)!;
    }
    
    // Compute bounding sphere
    mesh.geometry.computeBoundingSphere();
    const sphere = mesh.geometry.boundingSphere!;
    const radius = sphere.radius * 1.5;
    
    // Create render targets for each angle
    const renderTargets: THREE.WebGLRenderTarget[] = [];
    const angleVectors: THREE.Vector3[] = [];
    
    this.scene.add(mesh);
    
    for (let i = 0; i < angles; i++) {
      const angle = (i / angles) * Math.PI * 2;
      const renderTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: true
      });
      
      // Position camera
      this.camera.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );
      this.camera.lookAt(sphere.center);
      this.camera.near = 0.1;
      this.camera.far = radius * 3;
      this.camera.updateProjectionMatrix();
      
      // Clear and render
      this.renderer.setRenderTarget(renderTarget);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, this.camera);
      
      renderTargets.push(renderTarget);
      angleVectors.push(new THREE.Vector3(
        Math.cos(angle),
        0,
        Math.sin(angle)
      ));
    }
    
    this.scene.remove(mesh);
    
    // Create texture atlas
    const atlasTexture = this.createAtlasTexture(renderTargets, resolution, angles);
    
    const data: ImpostorData = {
      texture: atlasTexture,
      renderTargets,
      angles: angleVectors,
      frames: angles,
      resolution
    };
    
    // Create billboard mesh
    data.billboardMesh = this.createBillboardMesh(mesh, atlasTexture, angles);
    
    this.impostorCache.set(id, data);
    return data;
  }

  /**
   * Create texture atlas from render targets
   */
  private createAtlasTexture(
    renderTargets: THREE.WebGLRenderTarget[],
    resolution: number,
    angles: number
  ): THREE.Texture {
    const atlasSize = Math.ceil(Math.sqrt(angles));
    const canvas = document.createElement('canvas');
    canvas.width = resolution * atlasSize;
    canvas.height = resolution * atlasSize;
    const ctx = canvas.getContext('2d')!;
    
    for (let i = 0; i < renderTargets.length; i++) {
      const x = (i % atlasSize) * resolution;
      const y = Math.floor(i / atlasSize) * resolution;
      
      // Read pixels from render target
      const buffer = new Uint8Array(resolution * resolution * 4);
      this.renderer.readRenderTargetPixels(renderTargets[i], 0, 0, resolution, resolution, buffer);
      
      const imageData = new ImageData(new Uint8ClampedArray(buffer), resolution, resolution);
      ctx.putImageData(imageData, x, y);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    return texture;
  }

  /**
   * Create billboard mesh for impostor rendering
   */
  private createBillboardMesh(
    originalMesh: THREE.Mesh,
    texture: THREE.Texture,
    frames: number
  ): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(
      originalMesh.geometry.boundingSphere!.radius * 2,
      originalMesh.geometry.boundingSphere!.radius * 2
    );
    
    // Create custom shader material for impostor
    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        frames: { value: frames },
        frameIndex: { value: 0 },
        atlasSize: { value: Math.ceil(Math.sqrt(frames)) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform float frames;
        uniform float frameIndex;
        uniform float atlasSize;
        varying vec2 vUv;
        
        void main() {
          float frameX = mod(frameIndex, atlasSize);
          float frameY = floor(frameIndex / atlasSize);
          vec2 uv = (vUv + vec2(frameX, frameY)) / atlasSize;
          gl_FragColor = texture2D(map, uv);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    });
    
    const billboard = new THREE.Mesh(geometry, material);
    billboard.frustumCulled = false;
    
    return billboard;
  }

  /**
   * Update billboard to face camera and select correct frame
   */
  public updateBillboard(
    billboard: THREE.Mesh,
    cameraPosition: THREE.Vector3,
    objectPosition: THREE.Vector3,
    impostorData: ImpostorData
  ): void {
    // Face camera
    billboard.lookAt(cameraPosition);
    
    // Select frame based on camera angle
    const toCamera = new THREE.Vector3()
      .subVectors(cameraPosition, objectPosition)
      .normalize();
    
    let bestAngle = 0;
    let bestDot = -Infinity;
    
    for (let i = 0; i < impostorData.angles.length; i++) {
      const dot = toCamera.dot(impostorData.angles[i]);
      if (dot > bestDot) {
        bestDot = dot;
        bestAngle = i;
      }
    }
    
    // Update shader uniform
    const material = billboard.material as THREE.ShaderMaterial;
    material.uniforms.frameIndex.value = bestAngle;
  }

  /**
   * Dispose impostor resources
   */
  public disposeImpostor(id: string): void {
    const data = this.impostorCache.get(id);
    if (!data) return;
    
    data.texture.dispose();
    data.renderTargets.forEach(rt => rt.dispose());
    data.billboardMesh?.geometry.dispose();
    (data.billboardMesh?.material as THREE.Material).dispose();
    
    this.impostorCache.delete(id);
  }

  /**
   * Dispose all impostors
   */
  public dispose(): void {
    for (const id of this.impostorCache.keys()) {
      this.disposeImpostor(id);
    }
  }
}

// ============================================================================
// STREAMING LOD - On-Demand Loading
// ============================================================================

export class StreamingLOD {
  private loadQueue: StreamingLODItem[] = [];
  private loading: Map<string, boolean> = new Map();
  private loadedLODs: Map<string, Map<number, THREE.Object3D>> = new Map();
  private priorityComparator = (a: StreamingLODItem, b: StreamingLODItem) => b.priority - a.priority;
  
  private maxConcurrentLoads: number = 4;
  private currentLoads: number = 0;
  private unloadDelay: number = 5000; // 5 seconds before unloading
  private unloadTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Add LOD to streaming queue
   */
  public queueLOD(
    id: string,
    lod: THREE.LOD,
    distance: number,
    requiredLevel: number
  ): void {
    const priority = 1 / (distance + 1);
    
    const existing = this.loadQueue.find(item => item.id === id);
    if (existing) {
      existing.priority = priority;
      existing.requiredLevel = requiredLevel;
      this.loadQueue.sort(this.priorityComparator);
      return;
    }
    
    this.loadQueue.push({
      id,
      lod,
      distance,
      priority,
      requiredLevel,
      loadedLevels: new Set(),
      status: 'pending'
    });
    
    this.loadQueue.sort(this.priorityComparator);
    this.processQueue();
  }

  /**
   * Process loading queue
   */
  private async processQueue(): Promise<void> {
    while (this.loadQueue.length > 0 && this.currentLoads < this.maxConcurrentLoads) {
      const item = this.loadQueue.shift();
      if (!item) break;
      
      this.currentLoads++;
      item.status = 'loading';
      
      try {
        await this.loadLODLevel(item);
        item.status = 'loaded';
      } catch (error) {
        console.error('Failed to load LOD:', error);
        item.status = 'pending';
        this.loadQueue.push(item);
      }
      
      this.currentLoads--;
    }
  }

  /**
   * Load a specific LOD level
   */
  private async loadLODLevel(item: StreamingLODItem): Promise<void> {
    const generator = LODGenerator.getInstance();
    const levels = item.lod.levels;
    
    // Find the level to load
    const levelToLoad = item.requiredLevel;
    
    if (item.loadedLevels.has(levelToLoad)) {
      return; // Already loaded
    }
    
    // Get or create loaded LODs map
    if (!this.loadedLODs.has(item.id)) {
      this.loadedLODs.set(item.id, new Map());
    }
    
    const loadedMap = this.loadedLODs.get(item.id)!;
    
    // Get source geometry from LOD0
    const lod0Object = levels[0].object;
    let sourceGeometry: THREE.BufferGeometry;
    
    if (lod0Object instanceof THREE.Mesh) {
      sourceGeometry = lod0Object.geometry as THREE.BufferGeometry;
    } else {
      return; // Cannot simplify non-mesh
    }
    
    // Generate simplified geometry
    const ratio = 1 / Math.pow(2, levelToLoad);
    const simplifiedGeom = generator.simplifyGeometry(sourceGeometry, ratio, true, true);
    
    // Create mesh with original material
    const material = (lod0Object as THREE.Mesh).material;
    const newMesh = new THREE.Mesh(simplifiedGeom, material);
    
    loadedMap.set(levelToLoad, newMesh);
    item.loadedLevels.add(levelToLoad);
    
    // Update LOD object
    this.updateLODObject(item.lod, levelToLoad, newMesh);
  }

  /**
   * Update LOD object with new level
   */
  private updateLODObject(lod: THREE.LOD, level: number, mesh: THREE.Mesh): void {
    const distances = LODPresets.medium.distances;
    if (level < distances.length) {
      lod.addLevel(mesh, distances[level]);
    }
  }

  /**
   * Unload LOD levels that are too far
   */
  public unloadDistantLODs(
    cameraPosition: THREE.Vector3,
    maxDistance: number
  ): void {
    for (const [id, loadedMap] of this.loadedLODs) {
      let allFar = true;
      
      for (const [level, object] of loadedMap) {
        if (level === 0) {
          allFar = false;
          continue;
        }
        
        // Check if any level is still needed
        if (object.parent) {
          const worldPos = new THREE.Vector3();
          object.getWorldPosition(worldPos);
          const distance = worldPos.distanceTo(cameraPosition);
          
          if (distance < maxDistance * 0.8) {
            allFar = false;
            break;
          }
        }
      }
      
      if (allFar) {
        // Schedule unload
        if (!this.unloadTimers.has(id)) {
          const timer = setTimeout(() => {
            this.unloadLOD(id);
            this.unloadTimers.delete(id);
          }, this.unloadDelay);
          this.unloadTimers.set(id, timer);
        }
      } else {
        // Cancel unload
        const timer = this.unloadTimers.get(id);
        if (timer) {
          clearTimeout(timer);
          this.unloadTimers.delete(id);
        }
      }
    }
  }

  /**
   * Unload a specific LOD
   */
  private unloadLOD(id: string): void {
    const loadedMap = this.loadedLODs.get(id);
    if (!loadedMap) return;
    
    for (const [level, object] of loadedMap) {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    }
    
    this.loadedLODs.delete(id);
  }

  /**
   * Get streaming statistics
   */
  public getStats(): {
    queueLength: number;
    currentLoads: number;
    loadedCount: number;
  } {
    return {
      queueLength: this.loadQueue.length,
      currentLoads: this.currentLoads,
      loadedCount: this.loadedLODs.size
    };
  }

  /**
   * Dispose all resources
   */
  public dispose(): void {
    for (const id of this.loadedLODs.keys()) {
      this.unloadLOD(id);
    }
    this.loadQueue = [];
    this.unloadTimers.forEach(timer => clearTimeout(timer));
    this.unloadTimers.clear();
  }
}

// ============================================================================
// LOD GROUP - Batch Management
// ============================================================================

export class LODGroup {
  private id: string;
  private objects: THREE.LOD[] = [];
  private baseDistance: number = 100;
  private distanceScale: number = 1;
  private relativeDistances: boolean = true;
  private boundingSphere: THREE.Sphere = new THREE.Sphere();
  
  constructor(config: LODGroupConfig) {
    this.id = config.id;
    this.objects = config.objects;
    this.baseDistance = config.baseDistance;
    this.distanceScale = config.distanceScale;
    this.relativeDistances = config.relativeDistances;
    this.computeBoundingSphere();
  }

  /**
   * Compute combined bounding sphere
   */
  private computeBoundingSphere(): void {
    if (this.objects.length === 0) return;
    
    const centers: THREE.Vector3[] = [];
    let maxRadius = 0;
    
    for (const lod of this.objects) {
      const pos = new THREE.Vector3();
      lod.getWorldPosition(pos);
      centers.push(pos);
      
      // Get bounding sphere from first level
      const firstLevel = lod.levels[0]?.object;
      if (firstLevel instanceof THREE.Mesh && firstLevel.geometry.boundingSphere) {
        maxRadius = Math.max(maxRadius, firstLevel.geometry.boundingSphere.radius);
      }
    }
    
    // Compute center
    const center = new THREE.Vector3();
    for (const c of centers) {
      center.add(c);
    }
    center.divideScalar(centers.length);
    
    // Compute radius
    let radius = 0;
    for (const c of centers) {
      radius = Math.max(radius, center.distanceTo(c) + maxRadius);
    }
    
    this.boundingSphere.set(center, radius);
  }

  /**
   * Update all LODs in group
   */
  public updateAll(cameraPosition: THREE.Vector3, camera?: THREE.Camera): void {
    const distance = cameraPosition.distanceTo(this.boundingSphere.center);
    const effectiveDistance = Math.max(0, distance - this.boundingSphere.radius);
    
    for (const lod of this.objects) {
      // Set distance bias based on group settings
      if (this.relativeDistances) {
        this.updateLODDistances(lod, effectiveDistance * this.distanceScale);
      }
      
      if (camera) {
        lod.update(camera);
      }
    }
  }

  /**
   * Update LOD distances
   */
  private updateLODDistances(lod: THREE.LOD, distance: number): void {
    const scale = distance / this.baseDistance;
    
    for (let i = 0; i < lod.levels.length; i++) {
      const level = lod.levels[i];
      // Original distance stored in userData
      const originalDistance = level.object.userData.originalDistance || level.distance;
      level.object.userData.originalDistance = originalDistance;
      level.distance = originalDistance * scale;
    }
  }

  /**
   * Add object to group
   */
  public add(lod: THREE.LOD): void {
    this.objects.push(lod);
    this.computeBoundingSphere();
  }

  /**
   * Remove object from group
   */
  public remove(lod: THREE.LOD): void {
    const index = this.objects.indexOf(lod);
    if (index !== -1) {
      this.objects.splice(index, 1);
      this.computeBoundingSphere();
    }
  }

  /**
   * Get group bounds
   */
  public getBoundingSphere(): THREE.Sphere {
    return this.boundingSphere.clone();
  }

  /**
   * Get all objects
   */
  public getObjects(): THREE.LOD[] {
    return [...this.objects];
  }

  /**
   * Set distance scale
   */
  public setDistanceScale(scale: number): void {
    this.distanceScale = scale;
  }
}

// ============================================================================
// LOD MANAGER - Main Manager Class
// ============================================================================

export class LODManager {
  private static instance: LODManager;
  
  private camera: THREE.Camera | null = null;
  private lodObjects: Map<string, THREE.LOD> = new Map();
  private lodGroups: Map<string, LODGroup> = new Map();
  private impostorSystem: ImpostorSystem | null = null;
  private streamingLOD: StreamingLOD | null = null;
  private generator: LODGenerator;
  
  private stats: LODStats = {
    totalObjects: 0,
    activeLODs: new Map(),
    triangleCountSavings: 0,
    drawCallsReduction: 0,
    memoryUsage: 0,
    averageLODLevel: 0,
    objectsAtLOD: [0, 0, 0, 0, 0],
    impostorCount: 0,
    streamedLODCount: 0
  };
  
  private updateInterval: number = 100;
  private lastUpdateTime: number = 0;
  private bias: number = 0;
  private config: LODConfig;

  private constructor() {
    this.generator = LODGenerator.getInstance();
    this.config = this.getDefaultConfig();
  }

  public static getInstance(): LODManager {
    if (!LODManager.instance) {
      LODManager.instance = new LODManager();
    }
    return LODManager.instance;
  }

  /**
   * Initialize LOD manager with camera and renderer
   */
  public initialize(camera: THREE.Camera, renderer?: THREE.WebGLRenderer): void {
    this.camera = camera;
    
    if (renderer) {
      this.impostorSystem = new ImpostorSystem(renderer);
      this.streamingLOD = new StreamingLOD();
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): LODConfig {
    return {
      levels: [],
      fadeMode: 'none',
      fadeDuration: 0.3,
      updateInterval: 100,
      bias: 0,
      useScreenCoverage: false,
      screenCoverageThreshold: 0.01,
      autoGenerate: false,
      simplificationRatio: [1, 0.5, 0.25, 0.125],
      hysteresis: 5,
      dynamicLoading: false,
      unloadDistance: 500
    };
  }

  /**
   * Create a LOD object from mesh and configuration
   */
  public createLOD(mesh: THREE.Mesh, config?: Partial<LODConfig>): THREE.LOD {
    const finalConfig = { ...this.config, ...config };
    const lod = new THREE.LOD();
    
    // Copy transform from mesh
    mesh.getWorldPosition(lod.position);
    mesh.getWorldQuaternion(lod.quaternion);
    mesh.getWorldScale(lod.scale);
    
    if (finalConfig.levels.length > 0) {
      // Use provided levels
      for (const level of finalConfig.levels) {
        if (level.mesh instanceof THREE.Mesh) {
          lod.addLevel(level.mesh, level.distance + finalConfig.bias);
        } else {
          const meshLevel = new THREE.Mesh(level.mesh, mesh.material);
          lod.addLevel(meshLevel, level.distance + finalConfig.bias);
        }
      }
    } else if (finalConfig.autoGenerate) {
      // Auto-generate LOD levels
      this.autoGenerateLODLevels(lod, mesh, finalConfig);
    } else {
      // Just use original mesh as single LOD
      lod.addLevel(mesh, 0);
    }
    
    // Store in manager
    this.lodObjects.set(lod.uuid, lod);
    this.stats.totalObjects = this.lodObjects.size;
    
    return lod;
  }

  /**
   * Auto-generate LOD levels
   */
  private async autoGenerateLODLevels(
    lod: THREE.LOD,
    mesh: THREE.Mesh,
    config: LODConfig
  ): Promise<void> {
    const distances = LODPresets.medium.distances;
    
    for (let i = 0; i < config.simplificationRatio.length; i++) {
      const ratio = config.simplificationRatio[i];
      const distance = distances[i] || distances[distances.length - 1] * (i + 1);
      
      if (ratio === 1) {
        lod.addLevel(mesh, distance);
      } else {
        const simplifiedGeom = this.generator.simplifyGeometry(
          mesh.geometry as THREE.BufferGeometry,
          ratio,
          true,
          true
        );
        const lodMesh = new THREE.Mesh(simplifiedGeom, mesh.material);
        lod.addLevel(lodMesh, distance);
      }
    }
  }

  /**
   * Add LOD level to existing LOD object
   */
  public addLODLevel(
    lodObject: THREE.LOD,
    mesh: THREE.Mesh | THREE.BufferGeometry,
    distance: number,
    material?: THREE.Material
  ): void {
    let meshToAdd: THREE.Mesh;
    
    if (mesh instanceof THREE.BufferGeometry) {
      meshToAdd = new THREE.Mesh(mesh, material || new THREE.MeshStandardMaterial());
    } else {
      meshToAdd = mesh;
    }
    
    lodObject.addLevel(meshToAdd, distance + this.bias);
    
    // Sort levels by distance
    lodObject.levels.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Remove LOD level at distance
   */
  public removeLODLevel(lodObject: THREE.LOD, distance: number): void {
    const index = lodObject.levels.findIndex(
      l => Math.abs(l.distance - distance) < 0.01
    );
    
    if (index !== -1) {
      const level = lodObject.levels[index];
      if (level.object instanceof THREE.Mesh) {
        level.object.geometry.dispose();
      }
      lodObject.levels.splice(index, 1);
    }
  }

  /**
   * Update LOD level for specific object
   */
  public updateLOD(lodObject: THREE.LOD, distance: number): void {
    if (!this.camera) return;
    
    const cameraPosition = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPosition);
    
    lodObject.update(this.camera);
    
    // Update stats
    this.stats.activeLODs.set(lodObject.uuid, this.getCurrentLODLevel(lodObject, distance));
  }

  /**
   * Get current LOD level index
   */
  private getCurrentLODLevel(lod: THREE.LOD, distance: number): number {
    for (let i = lod.levels.length - 1; i >= 0; i--) {
      if (distance >= lod.levels[i].distance) {
        return i;
      }
    }
    return 0;
  }

  /**
   * Update all LOD objects
   */
  public updateAll(cameraPosition: THREE.Vector3, deltaTime?: number): void {
    const now = performance.now();
    
    // Throttle updates
    if (now - this.lastUpdateTime < this.updateInterval) {
      return;
    }
    this.lastUpdateTime = now;
    
    // Reset stats
    this.stats.objectsAtLOD = [0, 0, 0, 0, 0];
    this.stats.triangleCountSavings = 0;
    
    // Update individual LODs
    for (const lod of this.lodObjects.values()) {
      const objectPos = new THREE.Vector3();
      lod.getWorldPosition(objectPos);
      const distance = objectPos.distanceTo(cameraPosition);
      
      if (this.camera) {
        lod.update(this.camera);
      }
      
      // Calculate stats
      const levelIndex = this.getCurrentLODLevel(lod, distance);
      if (levelIndex < this.stats.objectsAtLOD.length) {
        this.stats.objectsAtLOD[levelIndex]++;
      }
    }
    
    // Update LOD groups
    for (const group of this.lodGroups.values()) {
      group.updateAll(cameraPosition, this.camera ?? undefined);
    }
    
    // Update streaming
    if (this.streamingLOD && this.config.dynamicLoading) {
      this.streamingLOD.unloadDistantLODs(cameraPosition, this.config.unloadDistance);
    }
    
    // Update impostors
    this.updateImpostors(cameraPosition);
    
    // Calculate average LOD level
    const totalAtLOD = this.stats.objectsAtLOD.reduce((a, b) => a + b, 0);
    if (totalAtLOD > 0) {
      this.stats.averageLODLevel = this.stats.objectsAtLOD.reduce(
        (sum, count, idx) => sum + count * idx, 0
      ) / totalAtLOD;
    }
    
    // Calculate triangle savings
    this.calculateTriangleSavings();
  }

  /**
   * Update impostor billboards
   */
  private updateImpostors(cameraPosition: THREE.Vector3): void {
    for (const lod of this.lodObjects.values()) {
      for (const level of lod.levels) {
        if (level.object.userData.isImpostor && this.impostorSystem) {
          const objectPos = new THREE.Vector3();
          lod.getWorldPosition(objectPos);
          
          const impostorData = level.object.userData.impostorData as ImpostorData;
          if (impostorData?.billboardMesh) {
            this.impostorSystem.updateBillboard(
              impostorData.billboardMesh,
              cameraPosition,
              objectPos,
              impostorData
            );
          }
        }
      }
    }
  }

  /**
   * Calculate triangle count savings
   */
  private calculateTriangleSavings(): void {
    let maxTriangles = 0;
    let currentTriangles = 0;
    
    for (const lod of this.lodObjects.values()) {
      const lod0 = lod.levels[0]?.object as THREE.Mesh;
      const current = lod.getObjectForDistance(
        this.getCurrentDistance(lod)
      ) as THREE.Mesh;
      
      if (lod0?.geometry) {
        const indices0 = lod0.geometry.getIndex();
        maxTriangles += indices0 ? indices0.count / 3 : 0;
      }
      
      if (current?.geometry) {
        const indices = current.geometry.getIndex();
        currentTriangles += indices ? indices.count / 3 : 0;
      }
    }
    
    this.stats.triangleCountSavings = Math.max(0, maxTriangles - currentTriangles);
  }

  /**
   * Get current distance for LOD
   */
  private getCurrentDistance(lod: THREE.LOD): number {
    if (!this.camera) return 0;
    
    const cameraPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPos);
    
    const objectPos = new THREE.Vector3();
    lod.getWorldPosition(objectPos);
    
    return cameraPos.distanceTo(objectPos);
  }

  /**
   * Set distance bias for all LODs
   */
  public setBias(bias: number): void {
    this.bias = bias;
    
    for (const lod of this.lodObjects.values()) {
      for (const level of lod.levels) {
        const originalDistance = level.object.userData.originalDistance ?? level.distance;
        level.object.userData.originalDistance = originalDistance;
        level.distance = originalDistance + bias;
      }
    }
  }

  /**
   * Generate LODs from mesh with specified ratios
   */
  public async generateLODs(
    mesh: THREE.Mesh,
    ratios: number[],
    distances?: number[]
  ): Promise<THREE.LOD> {
    const lod = new THREE.LOD();
    const finalDistances = distances ? [...distances] : [...LODPresets.medium.distances];
    
    const levels = await this.generator.generateLODLevels(mesh, ratios, finalDistances);
    
    for (const level of levels) {
      if (level.mesh instanceof THREE.Mesh) {
        lod.addLevel(level.mesh, level.distance);
      }
    }
    
    this.lodObjects.set(lod.uuid, lod);
    this.stats.totalObjects = this.lodObjects.size;
    
    return lod;
  }

  /**
   * Create LOD with impostor for distant views
   */
  public createLODWithImpostor(
    mesh: THREE.Mesh,
    distances: number[],
    impostorDistance: number
  ): THREE.LOD | null {
    if (!this.impostorSystem) {
      console.warn('ImpostorSystem not initialized. Call initialize() with renderer first.');
      return null;
    }
    
    const lod = new THREE.LOD();
    
    // Add regular LOD levels
    for (let i = 0; i < distances.length; i++) {
      const ratio = this.config.simplificationRatio[i] || 0.25;
      const distance = distances[i];
      
      let lodMesh: THREE.Mesh;
      if (i === 0) {
        lodMesh = mesh.clone();
      } else {
        const simplifiedGeom = this.generator.simplifyGeometry(
          mesh.geometry as THREE.BufferGeometry,
          ratio,
          true,
          true
        );
        lodMesh = new THREE.Mesh(simplifiedGeom, mesh.material);
      }
      
      lod.addLevel(lodMesh, distance);
    }
    
    // Add impostor level
    const impostorData = this.impostorSystem.generateImpostor(mesh);
    if (impostorData.billboardMesh) {
      impostorData.billboardMesh.userData.isImpostor = true;
      impostorData.billboardMesh.userData.impostorData = impostorData;
      lod.addLevel(impostorData.billboardMesh, impostorDistance);
      this.stats.impostorCount++;
    }
    
    this.lodObjects.set(lod.uuid, lod);
    this.stats.totalObjects = this.lodObjects.size;
    
    return lod;
  }

  /**
   * Create a LOD group
   */
  public createLODGroup(config: LODGroupConfig): LODGroup {
    const group = new LODGroup(config);
    this.lodGroups.set(config.id, group);
    return group;
  }

  /**
   * Get LOD statistics
   */
  public getLODStats(): LODStats {
    return { ...this.stats };
  }

  /**
   * Set update interval
   */
  public setUpdateInterval(interval: number): void {
    this.updateInterval = interval;
    this.config.updateInterval = interval;
  }

  /**
   * Set configuration
   */
  public setConfig(config: Partial<LODConfig>): void {
    this.config = { ...this.config, ...config };
    this.updateInterval = config.updateInterval ?? this.updateInterval;
    this.bias = config.bias ?? this.bias;
  }

  /**
   * Remove LOD object
   */
  public removeLOD(lod: THREE.LOD): void {
    this.lodObjects.delete(lod.uuid);
    
    // Dispose all levels
    for (const level of lod.levels) {
      if (level.object instanceof THREE.Mesh) {
        level.object.geometry.dispose();
        if (Array.isArray(level.object.material)) {
          level.object.material.forEach(m => m.dispose());
        } else {
          level.object.material.dispose();
        }
      }
    }
    
    this.stats.totalObjects = this.lodObjects.size;
  }

  /**
   * Remove LOD group
   */
  public removeLODGroup(id: string): void {
    this.lodGroups.delete(id);
  }

  /**
   * Get all LOD objects
   */
  public getAllLODs(): THREE.LOD[] {
    return Array.from(this.lodObjects.values());
  }

  /**
   * Get LOD by ID
   */
  public getLOD(id: string): THREE.LOD | undefined {
    return this.lodObjects.get(id);
  }

  /**
   * Enable/disable streaming LOD
   */
  public setDynamicLoading(enabled: boolean, unloadDistance?: number): void {
    this.config.dynamicLoading = enabled;
    if (unloadDistance !== undefined) {
      this.config.unloadDistance = unloadDistance;
    }
  }

  /**
   * Queue LOD for streaming
   */
  public queueForStreaming(lod: THREE.LOD, cameraPosition: THREE.Vector3): void {
    if (!this.streamingLOD) return;
    
    const objectPos = new THREE.Vector3();
    lod.getWorldPosition(objectPos);
    const distance = objectPos.distanceTo(cameraPosition);
    
    this.streamingLOD.queueLOD(lod.uuid, lod, distance, 0);
  }

  /**
   * Dispose all resources
   */
  public dispose(): void {
    for (const lod of this.lodObjects.values()) {
      this.removeLOD(lod);
    }
    
    for (const group of this.lodGroups.keys()) {
      this.removeLODGroup(group);
    }
    
    this.impostorSystem?.dispose();
    this.streamingLOD?.dispose();
    
    this.stats = {
      totalObjects: 0,
      activeLODs: new Map(),
      triangleCountSavings: 0,
      drawCallsReduction: 0,
      memoryUsage: 0,
      averageLODLevel: 0,
      objectsAtLOD: [0, 0, 0, 0, 0],
      impostorCount: 0,
      streamedLODCount: 0
    };
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create LOD from preset
 */
export function createLODFromPreset(
  mesh: THREE.Mesh,
  preset: keyof typeof LODPresets = 'medium'
): THREE.LOD {
  const manager = LODManager.getInstance();
  const presetConfig = LODPresets[preset];
  const simplificationRatio = presetConfig.simplificationRatios.filter(
    (ratio) => ratio !== 'billboard'
  ) as number[];
  
  return manager.createLOD(mesh, {
    autoGenerate: true,
    simplificationRatio,
    updateInterval: presetConfig.updateInterval,
    fadeDuration: presetConfig.fadeDuration
  });
}

/**
 * Quick LOD creation helper
 */
export function quickLOD(
  mesh: THREE.Mesh,
  distances: number[],
  ratios: number[]
): Promise<THREE.LOD> {
  const manager = LODManager.getInstance();
  return manager.generateLODs(mesh, ratios, distances);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default LODManager;
