'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  MODULAR_PART_CATALOG,
  analyzeModularCharacterFiles,
  buildAssignmentDraft,
  exportAssignmentsToGlb,
  suggestPartAssignments,
  type LoadedModularCharacterBundle,
  type ModularCharacterDetailResponse,
  type ModularCharacterListResponse,
  type ModularExportProfile,
  type ModularPartType,
  type PartAssignmentDraft,
  type SavedModularCharacterSummary,
} from '@/engine/modular-character';
import {
  AlertCircle,
  Archive,
  BoxSelect,
  Download,
  Eye,
  FileArchive,
  Layers3,
  Loader2,
  RefreshCw,
  Save,
  Scissors,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';

type ViewerSettings = {
  background: string;
  wireframe: boolean;
  showBones: boolean;
  showPivots: boolean;
};

const DEFAULT_VIEWER_SETTINGS: ViewerSettings = {
  background: '#07111b',
  wireframe: false,
  showBones: false,
  showPivots: false,
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatConfidence(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getProgressValue(state: string) {
  switch (state) {
    case 'uploading':
      return 18;
    case 'processing':
      return 42;
    case 'fragmenting':
      return 64;
    case 'saving':
      return 86;
    case 'ready':
    case 'error':
      return 100;
    default:
      return 0;
  }
}

function viewerLabel(state: string) {
  switch (state) {
    case 'uploading':
      return 'Subiendo bundle de modelo';
    case 'processing':
      return 'Analizando meshes, materiales, rig y animaciones';
    case 'fragmenting':
      return 'Fragmentando y exportando modulos GLB';
    case 'saving':
      return 'Guardando paquete modular';
    case 'ready':
      return 'Listo para descargar';
    case 'error':
      return 'Se detecto un error';
    default:
      return 'Sin procesamiento activo';
  }
}

function buildAssignmentLookup(assignments: Record<string, PartAssignmentDraft>) {
  const lookup = new Map<string, ModularPartType>();
  Object.values(assignments).forEach((assignment) => {
    assignment.nodePaths.forEach((path) => lookup.set(path, assignment.partType));
  });
  return lookup;
}

function disposeScene(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();

    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose());
      return;
    }

    mesh.material?.dispose();
  });
}

function highlightMaterial(material: THREE.Material, tone: 'selected' | 'assigned' | 'default', wireframe: boolean) {
  const next = material.clone();
  if ('wireframe' in next) {
    (next as THREE.MeshStandardMaterial).wireframe = wireframe;
  }

  if ('color' in next && next.color) {
    if (tone === 'selected') {
      (next.color as THREE.Color).lerp(new THREE.Color('#22d3ee'), 0.55);
    } else if (tone === 'assigned') {
      (next.color as THREE.Color).lerp(new THREE.Color('#34d399'), 0.35);
    }
  }

  if ('emissive' in next && next.emissive) {
    if (tone === 'selected') {
      (next.emissive as THREE.Color).set('#0891b2');
    } else if (tone === 'assigned') {
      (next.emissive as THREE.Color).set('#14532d');
    }
  }

  if ('emissiveIntensity' in next && typeof next.emissiveIntensity === 'number') {
    next.emissiveIntensity = tone === 'selected' ? 0.4 : tone === 'assigned' ? 0.15 : 0;
  }

  return next;
}

function buildViewerClone(params: {
  bundle: LoadedModularCharacterBundle;
  selectedNodePaths: string[];
  assignedNodeLookup: Map<string, ModularPartType>;
  settings: ViewerSettings;
}) {
  const scene = params.bundle.cloneScene();
  const selected = new Set(params.selectedNodePaths);

  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const nodePath = String(mesh.userData.rey30NodePath || '');
    const tone = selected.has(nodePath)
      ? 'selected'
      : params.assignedNodeLookup.has(nodePath)
        ? 'assigned'
        : 'default';

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) =>
        highlightMaterial(material, tone, params.settings.wireframe)
      );
      return;
    }

    mesh.material = highlightMaterial(mesh.material, tone, params.settings.wireframe);
  });

  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  scene.position.x -= center.x;
  scene.position.y -= box.min.y;
  scene.position.z -= center.z;
  scene.updateMatrixWorld(true);

  const pivots: Array<{ id: string; position: [number, number, number] }> = [];
  if (params.settings.showPivots) {
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const position = new THREE.Vector3();
      mesh.getWorldPosition(position);
      pivots.push({
        id: mesh.uuid,
        position: [position.x, position.y, position.z],
      });
    });
  }

  const skeletonHelpers: THREE.SkeletonHelper[] = [];
  if (params.settings.showBones) {
    scene.traverse((child) => {
      const skinned = child as THREE.SkinnedMesh;
      if (!skinned.isSkinnedMesh) return;
      const helper = new THREE.SkeletonHelper(skinned);
      const helperMaterial = Array.isArray(helper.material) ? helper.material[0] : helper.material;
      helperMaterial.depthTest = false;
      helperMaterial.transparent = true;
      helperMaterial.opacity = 0.75;
      skeletonHelpers.push(helper);
    });
  }

  return {
    scene,
    pivots,
    skeletonHelpers,
  };
}

function ModularModelViewer({
  bundle,
  selectedNodePaths,
  assignedNodeLookup,
  settings,
  resetKey,
  onToggleNode,
  onCaptureReady,
}: {
  bundle: LoadedModularCharacterBundle | null;
  selectedNodePaths: string[];
  assignedNodeLookup: Map<string, ModularPartType>;
  settings: ViewerSettings;
  resetKey: number;
  onToggleNode: (nodePath: string) => void;
  onCaptureReady: (capture: (() => Promise<File | null>) | null) => void;
}) {
  const captureRef = useRef<(() => Promise<File | null>) | null>(null);
  const prepared = useMemo(() => {
    if (!bundle) return null;
    return buildViewerClone({
      bundle,
      selectedNodePaths,
      assignedNodeLookup,
      settings,
    });
  }, [assignedNodeLookup, bundle, selectedNodePaths, settings]);

  useEffect(() => {
    return () => {
      if (!prepared) return;
      prepared.skeletonHelpers.forEach((helper) => helper.dispose());
      disposeScene(prepared.scene);
    };
  }, [prepared]);

  useEffect(() => {
    onCaptureReady(captureRef.current);
  }, [onCaptureReady, prepared]);

  if (!prepared) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Sube un personaje o bundle de piezas para activar el visor 3D.
      </div>
    );
  }

  return (
    <Canvas
      key={resetKey}
      camera={{ position: [0, 1.4, 3.4], fov: 38 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      dpr={[1, 1.5]}
      onCreated={({ gl, scene, camera }) => {
        captureRef.current = async () =>
          new Promise<File | null>((resolve) => {
            gl.render(scene, camera);
            gl.domElement.toBlob((blob) => {
              if (!blob) {
                resolve(null);
                return;
              }

              resolve(new File([blob], 'preview.png', { type: 'image/png' }));
            }, 'image/png');
          });
        onCaptureReady(captureRef.current);
      }}
    >
      <color attach="background" args={[settings.background]} />
      <ambientLight intensity={0.95} />
      <directionalLight position={[5, 5, 6]} intensity={2.4} />
      <directionalLight position={[-3, 2, -4]} intensity={0.75} color="#8fb9ff" />
      <gridHelper args={[8, 24, '#14324d', '#0b1a29']} position={[0, 0, 0]} />
      <primitive
        object={prepared.scene}
        onPointerDown={(event) => {
          event.stopPropagation();
          const nodePath = String((event.object as THREE.Object3D).userData.rey30NodePath || '');
          if (!nodePath) return;
          onToggleNode(nodePath);
        }}
      />
      {prepared.skeletonHelpers.map((helper) => (
        <primitive key={helper.uuid} object={helper} />
      ))}
      {prepared.pivots.map((pivot) => (
        <group key={pivot.id} position={pivot.position}>
          <axesHelper args={[0.08]} />
        </group>
      ))}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}

export function ModularCharacterLabPanel() {
  const [bundle, setBundle] = useState<LoadedModularCharacterBundle | null>(null);
  const [status, setStatus] = useState('Sin carga activa.');
  const [error, setError] = useState('');
  const [processingState, setProcessingState] = useState<
    'idle' | 'uploading' | 'processing' | 'fragmenting' | 'saving' | 'ready' | 'error'
  >('idle');
  const [projectName, setProjectName] = useState('Modular Lab');
  const [characterName, setCharacterName] = useState('hero_modular');
  const [exportProfile, setExportProfile] = useState<ModularExportProfile>('unity-ready');
  const [viewerSettings, setViewerSettings] = useState<ViewerSettings>(DEFAULT_VIEWER_SETTINGS);
  const [viewerResetKey, setViewerResetKey] = useState(0);
  const [activePartType, setActivePartType] = useState<ModularPartType>('head');
  const [selectedNodePaths, setSelectedNodePaths] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, PartAssignmentDraft>>({});
  const [meshFilter, setMeshFilter] = useState('');
  const [libraryItems, setLibraryItems] = useState<SavedModularCharacterSummary[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [downloadingCharacterId, setDownloadingCharacterId] = useState<string | null>(null);
  const [selectedDownloads, setSelectedDownloads] = useState<Record<string, string[]>>({});
  const capturePreviewRef = useRef<(() => Promise<File | null>) | null>(null);
  const deferredMeshFilter = useDeferredValue(meshFilter);
  const deferredLibrarySearch = useDeferredValue(librarySearch);

  const assignedNodeLookup = useMemo(() => buildAssignmentLookup(assignments), [assignments]);

  useEffect(() => {
    return () => {
      bundle?.dispose();
    };
  }, [bundle]);

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const response = await fetch('/api/modular-characters', { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as Partial<ModularCharacterListResponse> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo cargar la biblioteca modular.');
      }

      setLibraryItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (fetchError) {
      setError(String(fetchError));
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const filteredMeshes = useMemo(() => {
    const meshes = bundle?.analysis.meshes || [];
    const query = deferredMeshFilter.trim().toLowerCase();
    if (!query) return meshes;
    return meshes.filter((mesh) =>
      `${mesh.name} ${mesh.path} ${mesh.materialNames.join(' ')} ${mesh.boneNames.join(' ')}`
        .toLowerCase()
        .includes(query)
    );
  }, [bundle?.analysis.meshes, deferredMeshFilter]);

  const filteredLibrary = useMemo(() => {
    const query = deferredLibrarySearch.trim().toLowerCase();
    if (!query) return libraryItems;
    return libraryItems.filter((item) =>
      `${item.name} ${item.projectName} ${item.parts.map((part) => part.name).join(' ')}`
        .toLowerCase()
        .includes(query)
    );
  }, [deferredLibrarySearch, libraryItems]);

  const activeAssignment = assignments[activePartType] || null;

  const replaceBundle = useCallback((nextBundle: LoadedModularCharacterBundle | null) => {
    setBundle((current) => {
      current?.dispose();
      return nextBundle;
    });
  }, []);

  const applyAssignment = useCallback(
    (partType: ModularPartType, nodePaths: string[], mode: 'auto' | 'manual') => {
      if (!bundle) return;
      const nodes = bundle.analysis.meshes.filter((mesh) => nodePaths.includes(mesh.path));
      if (nodes.length === 0) {
        setAssignments((current) => {
          const next = { ...current };
          delete next[partType];
          return next;
        });
        return;
      }

      const draft = buildAssignmentDraft({
        partType,
        analysis: bundle.analysis,
        nodes,
        confidence: mode === 'auto' ? 0.78 : 1,
        mode,
        exportProfile,
      });

      setAssignments((current) => ({
        ...current,
        [partType]: draft,
      }));
    },
    [bundle, exportProfile]
  );

  const onFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;

      setError('');
      setProcessingState('uploading');
      setStatus('Preparando bundle local...');

      try {
        const nextCharacterName = files.find((file) => /\.(glb|gltf|fbx|obj)$/i.test(file.name))?.name;
        if (nextCharacterName) {
          setCharacterName(nextCharacterName.replace(/\.[^.]+$/, ''));
        }

        setProcessingState('processing');
        setStatus('Leyendo escena, materiales y jerarquia...');
        const analyzed = await analyzeModularCharacterFiles(files);
        replaceBundle(analyzed);
        setSelectedNodePaths([]);

        const autoAssignments = suggestPartAssignments(analyzed.analysis, exportProfile);
        setAssignments(
          Object.fromEntries(autoAssignments.map((assignment) => [assignment.partType, assignment]))
        );

        setProcessingState('ready');
        setStatus(
          `Modelo cargado: ${analyzed.analysis.meshCount} meshes, ${analyzed.analysis.materialCount} materiales y ${analyzed.analysis.animationCount} animaciones.`
        );
      } catch (loadError) {
        replaceBundle(null);
        setAssignments({});
        setSelectedNodePaths([]);
        setProcessingState('error');
        setError(String(loadError));
        setStatus('No se pudo analizar el paquete 3D.');
      } finally {
        event.target.value = '';
      }
    },
    [exportProfile, replaceBundle]
  );

  const toggleNodeSelection = useCallback((nodePath: string) => {
    setSelectedNodePaths((current) =>
      current.includes(nodePath) ? current.filter((value) => value !== nodePath) : [...current, nodePath]
    );
  }, []);

  const assignSelectedNodes = useCallback(() => {
    if (selectedNodePaths.length === 0) {
      setError('Selecciona al menos un mesh antes de asignarlo.');
      return;
    }

    const current = assignments[activePartType];
    const merged = [...new Set([...(current?.nodePaths || []), ...selectedNodePaths])];
    applyAssignment(activePartType, merged, 'manual');
    setStatus(`Parte ${activePartType} actualizada con ${merged.length} mesh(es).`);
  }, [activePartType, applyAssignment, assignments, selectedNodePaths]);

  const autoFragment = useCallback(() => {
    if (!bundle) return;
    setProcessingState('fragmenting');
    const drafts = suggestPartAssignments(bundle.analysis, exportProfile);
    setAssignments(Object.fromEntries(drafts.map((assignment) => [assignment.partType, assignment])));
    setProcessingState('ready');
    setStatus(`Fragmentacion automatica sugerida para ${drafts.length} partes.`);
  }, [bundle, exportProfile]);

  const removeNodeFromAssignment = useCallback(
    (partType: ModularPartType, nodePath: string) => {
      const current = assignments[partType];
      if (!current) return;
      const nextNodePaths = current.nodePaths.filter((value) => value !== nodePath);
      applyAssignment(partType, nextNodePaths, 'manual');
    },
    [applyAssignment, assignments]
  );

  const clearAssignment = useCallback(
    (partType: ModularPartType) => {
      applyAssignment(partType, [], 'manual');
      setStatus(`Parte ${partType} limpiada.`);
    },
    [applyAssignment]
  );

  const persistModularCharacter = useCallback(async () => {
    if (!bundle) {
      setError('Carga un personaje antes de guardar.');
      return;
    }

    const assignmentList = Object.values(assignments).filter((assignment) => assignment.nodePaths.length > 0);
    if (assignmentList.length === 0) {
      setError('Necesitas al menos una parte asignada para guardar el personaje modular.');
      return;
    }

    setError('');
    setProcessingState('fragmenting');
    setStatus('Exportando modulos GLB...');

    try {
      const exportedParts = await exportAssignmentsToGlb({
        bundle,
        assignments: assignmentList,
        exportProfile,
      });

      setProcessingState('saving');
      setStatus('Persistiendo metadata, partes y original...');

      const formData = new FormData();
      const previewFile = await capturePreviewRef.current?.().catch(() => null);
      const payload = {
        name: characterName.trim() || bundle.analysis.sourceName,
        projectName: projectName.trim() || 'Modular Lab',
        exportProfile,
        sourcePrimaryFileName: bundle.primaryFile.name,
        analysis: bundle.analysis,
        assignments: assignmentList.map((assignment) => ({
          ...assignment,
          exportFileName:
            exportedParts.find((part) => part.assignment.partType === assignment.partType)?.file.name ||
            assignment.exportFileName,
        })),
      };

      formData.append('payload', JSON.stringify(payload));
      bundle.sourceFiles.forEach((file) => formData.append('sourceFiles', file));
      exportedParts.forEach((part) => formData.append('partFiles', part.file));
      if (previewFile) {
        formData.append('previewFile', previewFile);
      }

      const response = await fetch('/api/modular-characters', {
        method: 'POST',
        body: formData,
      });
      const payloadResponse = (await response.json().catch(() => ({}))) as Partial<ModularCharacterDetailResponse> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payloadResponse.error || 'No se pudo guardar el personaje modular.');
      }

      await refreshLibrary();
      setProcessingState('ready');
      setStatus('Personaje modular guardado y listo para descargar.');
    } catch (persistError) {
      setProcessingState('error');
      setError(String(persistError));
      setStatus('Fallo el guardado del personaje modular.');
    }
  }, [assignments, bundle, characterName, exportProfile, projectName, refreshLibrary]);

  const openDownload = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const togglePartDownload = useCallback((characterId: string, partId: string) => {
    setSelectedDownloads((current) => {
      const existing = current[characterId] || [];
      const next = existing.includes(partId)
        ? existing.filter((value) => value !== partId)
        : [...existing, partId];
      return {
        ...current,
        [characterId]: next,
      };
    });
  }, []);

  const downloadSelectedParts = useCallback(
    async (characterId: string) => {
      const partIds = selectedDownloads[characterId] || [];
      if (partIds.length === 0) {
        setError('Selecciona partes de la biblioteca antes de exportar ZIP parcial.');
        return;
      }

      setDownloadingCharacterId(characterId);
      openDownload(`/api/modular-characters/${characterId}/download?partIds=${partIds.join(',')}`);
      setDownloadingCharacterId(null);
    },
    [openDownload, selectedDownloads]
  );

  const requiredProgress = getProgressValue(processingState);
  const requiredAssignments = MODULAR_PART_CATALOG.filter((part) => part.required);
  const assignedRequiredCount = requiredAssignments.filter((part) => Boolean(assignments[part.type])).length;

  return (
    <div className="flex h-full min-h-0 bg-slate-950 text-slate-100">
      <div className="w-[20rem] shrink-0 border-r border-slate-800 bg-slate-900/70">
        <ScrollArea className="h-full">
          <div className="space-y-4 p-4">
            <Card className="border-slate-800 bg-slate-950">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Layers3 className="h-4 w-4 text-cyan-300" />
                  Modular Character Lab
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Subida, analisis, fragmentacion y exportacion Unity Ready sin romper el
                  Character Builder actual.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wide text-slate-500">
                    Proyecto
                  </label>
                  <Input
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    className="border-slate-700 bg-slate-900 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wide text-slate-500">
                    Personaje
                  </label>
                  <Input
                    value={characterName}
                    onChange={(event) => setCharacterName(event.target.value)}
                    className="border-slate-700 bg-slate-900 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wide text-slate-500">
                    Perfil de exportacion
                  </label>
                  <select
                    value={exportProfile}
                    onChange={(event) => setExportProfile(event.target.value as ModularExportProfile)}
                    className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                  >
                    <option value="unity-ready">Unity Ready</option>
                    <option value="static-modular">Static Modular</option>
                    <option value="rigged-modular">Rigged Modular</option>
                  </select>
                </div>
                <label className="block">
                  <input
                    type="file"
                    multiple
                    accept=".glb,.gltf,.fbx,.obj,.bin,.mtl,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tga,.ktx2"
                    className="hidden"
                    onChange={onFileChange}
                  />
                  <Button type="button" className="w-full" title="Subir personaje completo o bundle de recursos" asChild>
                    <span>
                      <Upload className="mr-2 h-4 w-4" />
                      Subir modelo 3D
                    </span>
                  </Button>
                </label>
                <Progress value={requiredProgress} className="bg-slate-800" />
                <div className="text-[11px] text-slate-400">{viewerLabel(processingState)}</div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-950">
              <CardHeader>
                <CardTitle className="text-sm">Dashboard</CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Estado del bundle actual y cobertura de partes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <div className="text-slate-500">Meshes</div>
                    <div className="mt-1 text-lg font-semibold text-slate-100">
                      {bundle?.analysis.meshCount || 0}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <div className="text-slate-500">Materiales</div>
                    <div className="mt-1 text-lg font-semibold text-slate-100">
                      {bundle?.analysis.materialCount || 0}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <div className="text-slate-500">Rig</div>
                    <div className="mt-1 text-lg font-semibold text-slate-100">
                      {bundle?.analysis.hasRig ? 'Si' : 'No'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <div className="text-slate-500">Animaciones</div>
                    <div className="mt-1 text-lg font-semibold text-slate-100">
                      {bundle?.analysis.animationCount || 0}
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                  Partes requeridas cubiertas: {assignedRequiredCount}/{requiredAssignments.length}
                </div>
                {bundle && (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
                    Bundle fuente: {bundle.analysis.sourceFiles.length} archivo(s) ·{' '}
                    {formatBytes(bundle.analysis.sourceSize)}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>

      <div className="flex min-w-0 flex-1 flex-col border-r border-slate-800">
        <div className="border-b border-slate-800 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Viewer 3D</Badge>
            <Button size="sm" variant="outline" onClick={() => setViewerResetKey((value) => value + 1)}>
              <Eye className="mr-1 h-3.5 w-3.5" />
              Centrar
            </Button>
            <Button
              size="sm"
              variant={viewerSettings.wireframe ? 'secondary' : 'outline'}
              onClick={() =>
                setViewerSettings((current) => ({ ...current, wireframe: !current.wireframe }))
              }
            >
              Wireframe
            </Button>
            <Button
              size="sm"
              variant={viewerSettings.showBones ? 'secondary' : 'outline'}
              onClick={() =>
                setViewerSettings((current) => ({ ...current, showBones: !current.showBones }))
              }
            >
              Huesos
            </Button>
            <Button
              size="sm"
              variant={viewerSettings.showPivots ? 'secondary' : 'outline'}
              onClick={() =>
                setViewerSettings((current) => ({ ...current, showPivots: !current.showPivots }))
              }
            >
              Pivotes
            </Button>
            <select
              value={viewerSettings.background}
              onChange={(event) =>
                setViewerSettings((current) => ({ ...current, background: event.target.value }))
              }
              className="h-8 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
            >
              <option value="#07111b">Midnight</option>
              <option value="#101720">Graphite</option>
              <option value="#1f2937">Steel</option>
              <option value="#0c4a6e">Ocean</option>
            </select>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.8fr)]">
          <Card className="min-h-0 border-slate-800 bg-slate-950">
            <CardHeader>
              <CardTitle className="text-sm">Visor y seleccion visual</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Orbit, zoom, enfoque, wireframe, huesos y pivotes. Haz click sobre los meshes para
                agregarlos a la seleccion activa.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex h-[38rem] min-h-0 flex-col gap-3">
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                <ModularModelViewer
                  bundle={bundle}
                  selectedNodePaths={selectedNodePaths}
                  assignedNodeLookup={assignedNodeLookup}
                  settings={viewerSettings}
                  resetKey={viewerResetKey}
                  onToggleNode={toggleNodeSelection}
                  onCaptureReady={(capture) => {
                    capturePreviewRef.current = capture;
                  }}
                />
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
                {status}
              </div>
              {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-100">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4" />
                    <span>{error}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid min-h-0 grid-cols-1 gap-4">
            <Card className="border-slate-800 bg-slate-950">
              <CardHeader>
                <CardTitle className="text-sm">Editor de Fragmentacion</CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Modo automatico por heuristicas y modo manual por seleccion de mallas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={autoFragment} disabled={!bundle}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    Fragmentar automatico
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={assignSelectedNodes}
                    disabled={!bundle || selectedNodePaths.length === 0}
                  >
                    <Scissors className="mr-1 h-3.5 w-3.5" />
                    Asignar seleccion
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => clearAssignment(activePartType)}
                    disabled={!activeAssignment}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Limpiar parte
                  </Button>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-slate-100">Parte activa</div>
                    {activeAssignment && (
                      <Badge variant={activeAssignment.compatibility.ok ? 'default' : 'destructive'}>
                        {activeAssignment.compatibility.ok ? 'Compatible' : 'Revisar'}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {MODULAR_PART_CATALOG.map((part) => {
                      const isActive = part.type === activePartType;
                      const assigned = Boolean(assignments[part.type]);
                      return (
                        <button
                          key={part.type}
                          type="button"
                          onClick={() => setActivePartType(part.type)}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-left transition-colors',
                            isActive
                              ? 'border-cyan-500/50 bg-cyan-500/15'
                              : 'border-slate-800 bg-slate-950 hover:bg-slate-900'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium text-slate-100">{part.label}</div>
                            <Badge
                              variant={assigned ? 'default' : part.required ? 'secondary' : 'outline'}
                            >
                              {assigned ? 'OK' : part.required ? 'Req' : 'Opc'}
                            </Badge>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">{part.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeAssignment && (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-slate-100">{activeAssignment.label}</div>
                      <Badge variant="outline">{formatConfidence(activeAssignment.confidence)}</Badge>
                    </div>
                    <div className="mt-1 text-slate-400">
                      {activeAssignment.nodePaths.length} mesh(es) ·{' '}
                      {activeAssignment.hasRig ? 'Rigged' : 'Static'}
                    </div>
                    {activeAssignment.compatibility.issues.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {activeAssignment.compatibility.issues.map((issue) => (
                          <div
                            key={`${activeAssignment.id}_${issue.code}`}
                            className={cn(
                              'rounded-md px-2 py-1 text-[11px]',
                              issue.severity === 'error'
                                ? 'bg-rose-500/10 text-rose-100'
                                : issue.severity === 'warn'
                                  ? 'bg-amber-500/10 text-amber-100'
                                  : 'bg-sky-500/10 text-sky-100'
                            )}
                          >
                            {issue.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="min-h-0 border-slate-800 bg-slate-950">
              <CardHeader>
                <CardTitle className="text-sm">Meshes y Partes</CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Selecciona meshes, agrupalos por parte y prepara el paquete modular.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={meshFilter}
                  onChange={(event) => setMeshFilter(event.target.value)}
                  placeholder="Filtrar mesh, hueso o material..."
                  className="border-slate-700 bg-slate-900 text-xs"
                />

                <ScrollArea className="h-52 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                  <div className="space-y-2">
                    {filteredMeshes.map((mesh) => {
                      const selected = selectedNodePaths.includes(mesh.path);
                      const assignedTo = assignedNodeLookup.get(mesh.path) || null;
                      return (
                        <button
                          key={mesh.path}
                          type="button"
                          onClick={() => toggleNodeSelection(mesh.path)}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                            selected
                              ? 'border-cyan-500/50 bg-cyan-500/12 text-cyan-50'
                              : 'border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-medium">{mesh.name}</div>
                              <div className="truncate text-[11px] text-slate-500">{mesh.path}</div>
                            </div>
                            {assignedTo && <Badge variant="secondary">{assignedTo}</Badge>}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            {mesh.vertexCount} verts · {mesh.materialNames.length} mats ·{' '}
                            {mesh.hasRig ? 'rigged' : 'static'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>

                <ScrollArea className="h-44 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                  <div className="space-y-2">
                    {Object.values(assignments).length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-700 px-3 py-5 text-center text-xs text-slate-500">
                        Aun no hay partes asignadas.
                      </div>
                    )}
                    {Object.values(assignments)
                      .sort((left, right) => left.label.localeCompare(right.label))
                      .map((assignment) => (
                        <div key={assignment.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs font-medium text-slate-100">{assignment.label}</div>
                              <div className="text-[11px] text-slate-500">
                                {assignment.nodePaths.length} mesh(es) · {assignment.mode}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => setActivePartType(assignment.partType)}
                              >
                                <BoxSelect className="mr-1 h-3 w-3" />
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-[11px] text-rose-200"
                                onClick={() => clearAssignment(assignment.partType)}
                              >
                                Limpiar
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {assignment.sourceMeshNames.map((meshName, index) => (
                              <button
                                key={`${assignment.id}_${meshName}_${index}`}
                                type="button"
                                onClick={() =>
                                  removeNodeFromAssignment(assignment.partType, assignment.nodePaths[index])
                                }
                                className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 hover:border-rose-400/40 hover:text-rose-100"
                              >
                                {meshName}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </ScrollArea>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void persistModularCharacter()} disabled={!bundle}>
                    <Save className="mr-1 h-3.5 w-3.5" />
                    Guardar partes
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!bundle}
                    onClick={() => {
                      const assignmentList = Object.values(assignments);
                      if (assignmentList.length === 0) {
                        setError('Asigna partes antes de preparar exportacion.');
                        return;
                      }
                      setStatus(
                        `Export profile listo: ${exportProfile}. Usa Guardar partes para persistir.`
                      );
                    }}
                  >
                    <Archive className="mr-1 h-3.5 w-3.5" />
                    Preparar Unity
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-950">
              <CardHeader>
                <CardTitle className="text-sm">Biblioteca Guardada</CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Descarga original, ZIP completo o partes especificas ya persistidas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={librarySearch}
                    onChange={(event) => setLibrarySearch(event.target.value)}
                    placeholder="Buscar personaje o parte..."
                    className="border-slate-700 bg-slate-900 text-xs"
                  />
                  <Button size="icon" variant="outline" onClick={() => void refreshLibrary()}>
                    <RefreshCw className={cn('h-4 w-4', libraryLoading && 'animate-spin')} />
                  </Button>
                </div>

                <ScrollArea className="h-72 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                  <div className="space-y-3">
                    {filteredLibrary.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-700 px-3 py-6 text-center text-xs text-slate-500">
                        Todavia no hay personajes modulares guardados.
                      </div>
                    )}
                    {filteredLibrary.map((item) => {
                      const selectedPartIds = selectedDownloads[item.id] || [];
                      return (
                        <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm text-slate-100">{item.name}</div>
                              <div className="text-[11px] text-slate-500">
                                {item.projectName} · {item.partCount} partes · {item.sourceFormat}
                              </div>
                            </div>
                            <Badge variant={item.hasRig ? 'default' : 'secondary'}>
                              {item.hasRig ? 'Rigged' : 'Static'}
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => openDownload(item.originalDownloadUrl)}>
                              <Download className="mr-1 h-3.5 w-3.5" />
                              Original
                            </Button>
                            <Button size="sm" onClick={() => openDownload(item.downloadUrl)}>
                              <Archive className="mr-1 h-3.5 w-3.5" />
                              ZIP completo
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={selectedPartIds.length === 0 || downloadingCharacterId === item.id}
                              onClick={() => void downloadSelectedParts(item.id)}
                            >
                              {downloadingCharacterId === item.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <FileArchive className="mr-1 h-3.5 w-3.5" />
                              )}
                              ZIP parcial
                            </Button>
                          </div>
                          <div className="mt-3 space-y-2">
                            {item.parts.map((part) => {
                              const checked = selectedPartIds.includes(part.id);
                              return (
                                <div
                                  key={part.id}
                                  className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/70 px-2 py-2"
                                >
                                  <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-200">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => togglePartDownload(item.id, part.id)}
                                    />
                                    <span className="truncate">
                                      {part.name} · {part.partType}
                                    </span>
                                  </label>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => openDownload(part.downloadUrl)}
                                  >
                                    Descargar
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
