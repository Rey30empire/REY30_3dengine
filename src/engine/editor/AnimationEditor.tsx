// ============================================
// Animation Editor - Timeline, Keyframes, Curves
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Plus,
  Trash2,
  Diamond,
  ChevronDown,
  Key,
  Layers,
  Move,
  RotateCw,
  Scale,
  Settings,
  Smile,
  Library,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEngineStore } from '@/store/editorStore';
import {
  applyAutoWeightsFromRig,
  createDefaultAnimatorEditorState,
  createLibraryClip,
  normalizeAnimatorEditorState,
  serializeAnimatorEditorState,
  type AnimationEditorClip as AnimationClip,
  type AnimationEditorKeyframe as Keyframe,
  type AnimationEditorTrack as AnimationTrack,
  type AnimatorEditorState,
  type RigBone,
  type ShapeKeyTarget as BlendshapeTarget,
} from './animationEditorState';
import {
  createPrimitiveMesh,
  parseEditableMesh,
  sanitizeEditableMesh,
  type EditableMesh,
} from './modelerMesh';

const BASE_ANIMATION_LIBRARY = [
  { id: 'lib_idle', name: 'Idle', tags: ['base', 'loop'], duration: 2.0 },
  { id: 'lib_walk', name: 'Walk Cycle', tags: ['locomotion', 'loop'], duration: 1.2 },
  { id: 'lib_run', name: 'Run Cycle', tags: ['locomotion', 'loop'], duration: 0.8 },
  { id: 'lib_jump', name: 'Jump', tags: ['action'], duration: 1.0 },
  { id: 'lib_punch', name: 'Punch', tags: ['combat'], duration: 0.6 },
  { id: 'lib_look', name: 'Look Around', tags: ['idle'], duration: 1.5 },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveEditableMesh(meshRendererData: Record<string, unknown>) {
  return (
    parseEditableMesh(meshRendererData.manualMesh ?? meshRendererData.customMesh) ??
    createPrimitiveMesh(
      typeof meshRendererData.meshId === 'string' ? meshRendererData.meshId : 'cube'
    )
  );
}

function buildMeshRendererDataWithMesh(
  meshRendererData: Record<string, unknown>,
  mesh: EditableMesh
) {
  return {
    ...meshRendererData,
    meshId: 'custom',
    manualMesh: sanitizeEditableMesh(mesh),
  };
}

export function AnimationEditor() {
  const { entities, editor, updateEntity, setPaintWeightBone } = useEngineStore();
  const selectedEntity =
    editor.selectedEntities.length === 1
      ? entities.get(editor.selectedEntities[0]) ?? null
      : null;
  const selectedEntityName = selectedEntity?.name ?? 'Entity';
  const animatorComponent = selectedEntity?.components.get('Animator') ?? null;
  const animatorData = asRecord(animatorComponent?.data);
  const animatorState = normalizeAnimatorEditorState(animatorData, selectedEntityName);
  const clip: AnimationClip =
    animatorState.clips.find((entry) => entry.id === animatorState.activeClipId) ??
    animatorState.clips[0];
  const [currentTimeState, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTrackState, setSelectedTrack] = useState<string | null>(null);
  const [selectedKeyframeState, setSelectedKeyframes] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [showCurves, setShowCurves] = useState(true);
  const timelineRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const [blendFilter, setBlendFilter] = useState<'all' | BlendshapeTarget['category']>('all');
  const [status, setStatus] = useState('');
  const currentTime = Math.max(0, Math.min(clip.duration, currentTimeState));
  const selectedTrack =
    selectedTrackState && clip.tracks.some((track) => track.id === selectedTrackState)
      ? selectedTrackState
      : clip.tracks[0]?.id ?? null;
  const clipKeyframeIds = new Set(
    clip.tracks.flatMap((track) => track.keyframes.map((keyframe) => keyframe.id))
  );
  const selectedKeyframes = new Set(
    Array.from(selectedKeyframeState).filter((keyframeId) => clipKeyframeIds.has(keyframeId))
  );

  const activeBone = animatorState.bones.find((bone) => bone.id === animatorState.activeBoneId) ?? null;

  const applyAnimatorState = (
    updater: (state: AnimatorEditorState) => AnimatorEditorState
  ) => {
    if (!selectedEntity || !animatorComponent) return;
    const nextState = updater(animatorState);
    const nextComponents = new Map(selectedEntity.components);
    nextComponents.set('Animator', {
      ...animatorComponent,
      data: serializeAnimatorEditorState(animatorData, nextState),
    });
    updateEntity(selectedEntity.id, { components: nextComponents });
  };

  const ensureAnimatorComponent = () => {
    if (!selectedEntity || animatorComponent) return;
    const nextState = createDefaultAnimatorEditorState(selectedEntity.name);
    const nextComponents = new Map(selectedEntity.components);
    nextComponents.set('Animator', {
      id: crypto.randomUUID(),
      type: 'Animator',
      enabled: true,
      data: serializeAnimatorEditorState(
        {
          controllerId: null,
          currentAnimation: null,
          parameters: {},
        },
        nextState
      ),
    });
    updateEntity(selectedEntity.id, { components: nextComponents });
    if (nextState.bones[0]) {
      setPaintWeightBone(nextState.bones[0].name);
    }
    setStatus(`Animator montado para ${selectedEntity.name}.`);
  };

  const updateActiveClip = (updater: (target: AnimationClip) => AnimationClip) => {
    if (!animatorComponent) return;
    applyAnimatorState((state) => ({
      ...state,
      clips: state.clips.map((entry) => (entry.id === clip.id ? updater(entry) : entry)),
    }));
  };

  const handleAddTrack = () => {
    if (!animatorComponent) return;
    updateActiveClip((target) => ({
      ...target,
      tracks: [
        ...target.tracks,
        {
          id: crypto.randomUUID(),
          name: `Custom.${target.tracks.length + 1}`,
          path: activeBone ? `Rig/${activeBone.name}` : 'Rig/Root',
          property: 'custom.value',
          type: 'custom',
          color: '#f97316',
          visible: true,
          locked: false,
          keyframes: [
            {
              id: crypto.randomUUID(),
              time: 0,
              value: 0,
              easing: 'linear',
            },
          ],
        },
      ],
    }));
    setStatus('Track agregado al clip activo.');
  };

  const handleSetupHumanoidRig = () => {
    if (!animatorComponent || !selectedEntity) return;
    const preset = createDefaultAnimatorEditorState(selectedEntity.name);
    applyAnimatorState((state) => ({
      ...state,
      bones: preset.bones,
      ikChains: preset.ikChains,
      constraints: preset.constraints,
      poseMode: true,
      activeBoneId: preset.activeBoneId,
    }));
    if (preset.bones[0]) {
      setPaintWeightBone(preset.bones[0].name);
    }
    setStatus('Armature humanoide base montado.');
  };

  const handleAddBone = () => {
    if (!animatorComponent) return;
    applyAnimatorState((state) => {
      const parentBone = state.bones.find((bone) => bone.id === state.activeBoneId) ?? state.bones[0] ?? null;
      const nextBone: RigBone = {
        id: crypto.randomUUID(),
        name: `Bone_${state.bones.length + 1}`,
        parentId: parentBone?.id ?? null,
        restPosition: parentBone
          ? {
              x: parentBone.restPosition.x,
              y: parentBone.restPosition.y + parentBone.length,
              z: parentBone.restPosition.z,
            }
          : { x: 0, y: 0.2, z: 0 },
        length: 0.25,
        visible: true,
        locked: false,
      };
      return {
        ...state,
        bones: [...state.bones, nextBone],
        activeBoneId: nextBone.id,
      };
    });
    setPaintWeightBone(`Bone_${animatorState.bones.length + 1}`);
    setStatus('Bone agregado al rig activo.');
  };

  const handleAddIkChain = () => {
    if (!animatorComponent) return;
    applyAnimatorState((state) => {
      const [root, mid, end] = state.bones.slice(0, 3);
      if (!root || !mid || !end) return state;
      return {
        ...state,
        ikChains: [
          ...state.ikChains,
          {
            id: crypto.randomUUID(),
            name: `IK_${state.ikChains.length + 1}`,
            rootBoneId: root.id,
            midBoneId: mid.id,
            endBoneId: end.id,
            target: {
              x: end.restPosition.x,
              y: end.restPosition.y + end.length,
              z: end.restPosition.z + 0.2,
            },
            weight: 1,
            enabled: true,
          },
        ],
      };
    });
    setStatus('Cadena IK agregada.');
  };

  const handleAddConstraint = () => {
    if (!animatorComponent) return;
    applyAnimatorState((state) => {
      const sourceBone = state.bones.find((bone) => bone.id === state.activeBoneId) ?? state.bones[0] ?? null;
      const targetBone = state.bones.find((bone) => bone.id !== sourceBone?.id) ?? null;
      if (!sourceBone) return state;
      return {
        ...state,
        constraints: [
          ...state.constraints,
          {
            id: crypto.randomUUID(),
            name: `Constraint_${state.constraints.length + 1}`,
            type: 'copy_rotation',
            boneId: sourceBone.id,
            targetBoneId: targetBone?.id ?? null,
            influence: 0.5,
            enabled: true,
          },
        ],
      };
    });
    setStatus('Constraint agregado al rig.');
  };

  const handleAutoWeights = () => {
    if (!selectedEntity) return;
    const meshRenderer = selectedEntity.components.get('MeshRenderer');
    if (!meshRenderer) {
      setStatus('La entidad seleccionada no tiene MeshRenderer.');
      return;
    }

    const meshRendererData = asRecord(meshRenderer.data) ?? {};
    const nextMesh = applyAutoWeightsFromRig(
      resolveEditableMesh(meshRendererData),
      animatorState.bones
    );
    const nextComponents = new Map(selectedEntity.components);
    nextComponents.set('MeshRenderer', {
      ...meshRenderer,
      data: buildMeshRendererDataWithMesh(meshRendererData, nextMesh),
    });
    updateEntity(selectedEntity.id, { components: nextComponents });
    if (animatorState.bones[0]) {
      setPaintWeightBone(animatorState.bones[0].name);
    }
    setStatus('Auto weights aplicados desde el rig actual.');
  };

  const handleAddLibraryClip = (clipName: string) => {
    if (!animatorComponent) return;
    const newClip = createLibraryClip(clipName);
    applyAnimatorState((state) => ({
      ...state,
      activeClipId: newClip.id,
      clips: [...state.clips, newClip],
    }));
    setSelectedTrack(newClip.tracks[0]?.id ?? null);
    setStatus(`Clip base agregado: ${clipName}`);
  };

  const handleAddCurrentClipToNla = () => {
    if (!animatorComponent) return;
    applyAnimatorState((state) => {
      const active = state.clips.find((entry) => entry.id === state.activeClipId);
      if (!active) return state;
      const stripStart =
        state.nlaStrips.length === 0 ? 0 : Math.max(...state.nlaStrips.map((entry) => entry.end));
      return {
        ...state,
        nlaStrips: [
          ...state.nlaStrips,
          {
            id: crypto.randomUUID(),
            name: `${active.name}_NLA_${state.nlaStrips.length + 1}`,
            clipId: active.id,
            start: stripStart,
            end: stripStart + active.duration,
            blendMode: 'replace',
            muted: false,
          },
        ],
      };
    });
    setStatus(`Clip ${clip.name} agregado a NLA.`);
  };

  const handleSelectClip = (clipId: string) => {
    if (!animatorComponent) return;
    applyAnimatorState((state) => ({
      ...state,
      activeClipId: clipId,
    }));
    setSelectedKeyframes(new Set());
    setStatus('Clip activo actualizado.');
  };

  const handleToggleTrackVisibility = (trackId: string) => {
    if (!animatorComponent) return;
    updateActiveClip((target) => ({
      ...target,
      tracks: target.tracks.map((track) =>
        track.id === trackId ? { ...track, visible: !track.visible } : track
      ),
    }));
  };

  const handleToggleTrackLock = (trackId: string) => {
    if (!animatorComponent) return;
    updateActiveClip((target) => ({
      ...target,
      tracks: target.tracks.map((track) =>
        track.id === trackId ? { ...track, locked: !track.locked } : track
      ),
    }));
  };

  const handleMoveKeyframe = (trackId: string, keyframeId: string, newTime: number) => {
    if (!animatorComponent) return;
    updateActiveClip((target) => ({
      ...target,
      tracks: target.tracks.map((track) => {
        if (track.id !== trackId) return track;
        return {
          ...track,
          keyframes: track.keyframes
            .map((keyframe) =>
              keyframe.id === keyframeId
                ? { ...keyframe, time: Math.max(0, Math.min(target.duration, newTime)) }
                : keyframe
            )
            .sort((left, right) => left.time - right.time),
        };
      }),
    }));
  };

  const handleSelectBone = (boneId: string) => {
    if (!animatorComponent) return;
    const nextBone = animatorState.bones.find((bone) => bone.id === boneId) ?? null;
    if (nextBone) {
      setPaintWeightBone(nextBone.name);
    }
    applyAnimatorState((state) => ({
      ...state,
      activeBoneId: boneId,
    }));
  };

  const handleToggleBoneVisibility = (boneId: string) => {
    if (!animatorComponent) return;
    applyAnimatorState((state) => ({
      ...state,
      bones: state.bones.map((bone) =>
        bone.id === boneId ? { ...bone, visible: bone.visible === false } : bone
      ),
    }));
  };

  const handleToggleBoneLock = (boneId: string) => {
    if (!animatorComponent) return;
    applyAnimatorState((state) => ({
      ...state,
      bones: state.bones.map((bone) =>
        bone.id === boneId ? { ...bone, locked: bone.locked !== true } : bone
      ),
    }));
  };

  const handleTogglePoseMode = () => {
    if (!animatorComponent) return;
    applyAnimatorState((state) => ({
      ...state,
      poseMode: !state.poseMode,
    }));
    setStatus(animatorState.poseMode ? 'Pose mode desactivado.' : 'Pose mode activado.');
  };

  const handleShapeKeyWeightChange = (shapeKeyId: string, weight: number) => {
    if (!animatorComponent) return;
    applyAnimatorState((state) => ({
      ...state,
      shapeKeys: state.shapeKeys.map((shapeKey) =>
        shapeKey.id === shapeKeyId
          ? { ...shapeKey, weight: Math.max(0, Math.min(1, weight)) }
          : shapeKey
      ),
    }));
  };

  const handleResetShapeKeys = () => {
    if (!animatorComponent) return;
    applyAnimatorState((state) => ({
      ...state,
      shapeKeys: state.shapeKeys.map((shapeKey) => ({ ...shapeKey, weight: 0 })),
    }));
    setStatus('Shape keys reseteadas.');
  };

  const handleToggleNlaMute = (stripId: string) => {
    if (!animatorComponent) return;
    applyAnimatorState((state) => ({
      ...state,
      nlaStrips: state.nlaStrips.map((strip) =>
        strip.id === stripId ? { ...strip, muted: !strip.muted } : strip
      ),
    }));
  };

  // Play animation
  useEffect(() => {
    if (isPlaying) {
      let startTime = performance.now() - currentTime * 1000;
      
      const animate = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        const newTime = elapsed % clip.duration;
        
        setCurrentTime(newTime);
        
        if (elapsed < clip.duration || clip.isLooping) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setIsPlaying(false);
          setCurrentTime(0);
        }
      };
      
      animationRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, clip.duration, clip.isLooping]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * clip.frameRate);
    return `${mins}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * clip.duration;
    
    setCurrentTime(Math.max(0, Math.min(clip.duration, time)));
  };

  const handleAddKeyframe = () => {
    if (!selectedTrack || !animatorComponent) return;
    updateActiveClip((target) => ({
      ...target,
      tracks: target.tracks.map((track) => {
        if (track.id !== selectedTrack) return track;
        return {
          ...track,
          keyframes: [
            ...track.keyframes,
            {
              id: crypto.randomUUID(),
              time: currentTime,
              value: 0,
              easing: 'linear' as const,
            },
          ].sort((left, right) => left.time - right.time),
        };
      }),
    }));
    setStatus('Keyframe agregado.');
  };

  const handleDeleteKeyframes = () => {
    if (selectedKeyframes.size === 0 || !animatorComponent) return;
    updateActiveClip((target) => ({
      ...target,
      tracks: target.tracks.map((track) => ({
        ...track,
        keyframes: track.keyframes.filter((keyframe) => !selectedKeyframes.has(keyframe.id)),
      })),
    }));
    setSelectedKeyframes(new Set());
    setStatus('Keyframes eliminados.');
  };

  if (editor.selectedEntities.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-slate-500">
        Selecciona una entidad para editar rig y animacion.
      </div>
    );
  }

  if (editor.selectedEntities.length > 1 || !selectedEntity) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-slate-500">
        El editor de animacion trabaja con una sola entidad a la vez.
      </div>
    );
  }

  if (!animatorComponent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-950 text-center">
        <div className="text-sm text-slate-200">{selectedEntity.name}</div>
        <div className="max-w-sm text-xs text-slate-500">
          Esta entidad todavia no tiene componente Animator. Montalo para habilitar clips,
          rig, IK, constraints, shape keys y NLA persistentes.
        </div>
        <Button onClick={ensureAnimatorComponent}>Montar Animator</Button>
      </div>
    );
  }

  const currentTrack = clip.tracks.find((track) => track.id === selectedTrack) ?? null;

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800">
        {/* Clip Selector */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                {clip.name}
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-slate-800 border-slate-700">
              {animatorState.clips.map((entry) => (
                <DropdownMenuItem
                  key={entry.id}
                  className="text-xs"
                  onClick={() => handleSelectClip(entry.id)}
                >
                  {entry.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button
            variant={clip.isLooping ? "default" : "ghost"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() =>
              updateActiveClip((target) => ({
                ...target,
                isLooping: !target.isLooping,
              }))
            }
          >
            <Repeat className="w-3.5 h-3.5" />
          </Button>

          <span className="text-[11px] text-slate-500">{selectedEntity.name}</span>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-1 bg-slate-900 rounded p-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setCurrentTime(0)}
          >
            <SkipBack className="w-3 h-3" />
          </Button>
          <Button
            variant={isPlaying ? "default" : "ghost"}
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setCurrentTime(clip.duration)}
          >
            <SkipForward className="w-3 h-3" />
          </Button>
        </div>

        {/* Time Display */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-300">
            {formatTime(currentTime)} / {formatTime(clip.duration)}
          </span>
          <span className="text-xs text-slate-500">
            {clip.frameRate} FPS
          </span>
        </div>

        {/* Edit Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={handleAddKeyframe}
            disabled={!selectedTrack}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Key
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={handleDeleteKeyframes}
            disabled={selectedKeyframes.size === 0}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Delete
          </Button>
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant={showCurves ? "default" : "ghost"}
            size="sm"
            className="h-7"
            onClick={() => setShowCurves(!showCurves)}
          >
            Curves
          </Button>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">Zoom</span>
            <Slider
              value={[zoom]}
              onValueChange={([v]) => setZoom(v)}
              min={0.5}
              max={4}
              step={0.1}
              className="w-20"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Track List */}
        <div className="w-56 border-r border-slate-800 flex flex-col">
          <div className="px-2 py-1 border-b border-slate-800 text-xs text-slate-500">
            Tracks
          </div>
          <ScrollArea className="flex-1">
            {clip.tracks.map(track => (
              <TrackItem
                key={track.id}
                track={track}
                isSelected={selectedTrack === track.id}
                onClick={() => setSelectedTrack(track.id)}
                onToggleVisibility={() => handleToggleTrackVisibility(track.id)}
                onToggleLock={() => handleToggleTrackLock(track.id)}
              />
            ))}
          </ScrollArea>
          
          {/* Add Track */}
          <div className="p-2 border-t border-slate-800">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={handleAddTrack}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Track
            </Button>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Timeline Header */}
          <TimelineHeader
            duration={clip.duration}
            frameRate={clip.frameRate}
            zoom={zoom}
          />
          
          {/* Tracks Timeline */}
          <ScrollArea className="flex-1">
            <div ref={timelineRef} className="relative" onClick={handleTimelineClick}>
              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                style={{ left: `${(currentTime / clip.duration) * 100}%` }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-sm rotate-45" />
              </div>

              {/* Track Rows */}
              {clip.tracks.map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  duration={clip.duration}
                  zoom={zoom}
                  showCurves={showCurves}
                  selectedKeyframes={selectedKeyframes}
                  onKeyframeSelect={(id, multi) => {
                    if (multi) {
                      setSelectedKeyframes(prev => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    } else {
                      setSelectedKeyframes(new Set([id]));
                    }
                  }}
                  onKeyframeMove={(keyframeId, newTime) => {
                    handleMoveKeyframe(track.id, keyframeId, newTime);
                  }}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Curve Editor (Optional) */}
      {showCurves && currentTrack && (
        <div className="h-32 border-t border-slate-800">
          <CurveEditor
            track={currentTrack}
            duration={clip.duration}
            currentTime={currentTime}
          />
        </div>
      )}

      {/* Rigging / Blendshapes / Biblioteca */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-800 bg-slate-950/80 p-3">
        {/* Rig */}
        <Card className="p-3 bg-slate-900 border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <Settings className="w-4 h-4 text-emerald-300" />
            <h4 className="text-xs font-semibold text-slate-100">Rig, pose e IK</h4>
          </div>
          <div className="space-y-2 text-xs text-slate-300">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <Button size="sm" className="h-7 text-[11px]" onClick={handleSetupHumanoidRig}>
                Humanoid base
              </Button>
              <Button
                size="sm"
                variant={animatorState.poseMode ? 'default' : 'ghost'}
                className="h-7 text-[11px]"
                onClick={handleTogglePoseMode}
              >
                {animatorState.poseMode ? 'Pose mode' : 'Object mode'}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={handleAddBone}>
                Add bone
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={handleAutoWeights}>
                Auto weights
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
                <div className="text-slate-500">Bones</div>
                <div className="mt-1 text-slate-100">{animatorState.bones.length}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
                <div className="text-slate-500">IK</div>
                <div className="mt-1 text-slate-100">{animatorState.ikChains.length}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
                <div className="text-slate-500">Constraints</div>
                <div className="mt-1 text-slate-100">{animatorState.constraints.length}</div>
              </div>
            </div>

            <div className="rounded border border-slate-800 bg-slate-950/60">
              <div className="border-b border-slate-800 px-2 py-1 text-[11px] text-slate-500">
                Bone list
              </div>
              <div className="max-h-44 overflow-y-auto">
                {animatorState.bones.map((bone) => (
                  <button
                    key={bone.id}
                    className={cn(
                      'flex w-full items-center gap-2 border-b border-slate-800/60 px-2 py-1 text-left last:border-b-0',
                      activeBone?.id === bone.id ? 'bg-slate-800/80' : 'hover:bg-slate-800/40'
                    )}
                    onClick={() => handleSelectBone(bone.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] text-slate-200">{bone.name}</div>
                      <div className="text-[10px] text-slate-500">
                        y {bone.restPosition.y.toFixed(2)} | len {bone.length.toFixed(2)}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggleBoneVisibility(bone.id);
                      }}
                    >
                      {bone.visible === false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                    <Button
                      type="button"
                      variant={bone.locked ? 'default' : 'ghost'}
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggleBoneLock(bone.id);
                      }}
                    >
                      L
                    </Button>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={handleAddIkChain}>
                Add IK
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={handleAddConstraint}
              >
                Add constraint
              </Button>
            </div>

            {(animatorState.ikChains.length > 0 || animatorState.constraints.length > 0) && (
              <div className="space-y-2 rounded border border-slate-800 bg-slate-950/60 p-2 text-[11px]">
                {animatorState.ikChains.slice(0, 2).map((chain) => (
                  <div key={chain.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-200">{chain.name}</span>
                    <span className="text-slate-500">w {chain.weight.toFixed(2)}</span>
                  </div>
                ))}
                {animatorState.constraints.slice(0, 2).map((constraint) => (
                  <div key={constraint.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-200">{constraint.name}</span>
                    <span className="text-slate-500">{constraint.type}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="text-[11px] text-slate-500">
              Bone activo: {activeBone?.name ?? 'ninguno'}
            </div>
          </div>
        </Card>

        {/* Blendshapes */}
        <Card className="p-3 bg-slate-900 border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <Smile className="w-4 h-4 text-pink-300" />
            <h4 className="text-xs font-semibold text-slate-100">Shape keys y pose facial</h4>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Button
              size="sm"
              variant={blendFilter === 'all' ? 'default' : 'ghost'}
              className="h-7 text-[11px]"
              onClick={() => setBlendFilter('all')}
            >
              Todos
            </Button>
            {(['boca', 'ojos', 'cejas', 'misc'] as const).map((cat) => (
              <Button
                key={cat}
                size="sm"
                variant={blendFilter === cat ? 'default' : 'ghost'}
                className="h-7 text-[11px]"
                onClick={() => setBlendFilter(cat)}
              >
                {cat}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 text-[11px]"
              onClick={handleResetShapeKeys}
            >
              Reset all
            </Button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {animatorState.shapeKeys
              .filter((shapeKey) => blendFilter === 'all' || shapeKey.category === blendFilter)
              .map((shapeKey) => (
                <div key={shapeKey.id} className="rounded border border-slate-800 bg-slate-950/60 p-2 space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-200">
                    <span>{shapeKey.name}</span>
                    <span className="text-slate-400">{(shapeKey.weight * 100).toFixed(0)}%</span>
                  </div>
                  <Slider
                    value={[shapeKey.weight]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={([value]) => handleShapeKeyWeightChange(shapeKey.id, value)}
                  />
                  <div className="flex items-center justify-end gap-2 text-[11px] text-slate-400">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2"
                      onClick={() => handleShapeKeyWeightChange(shapeKey.id, 0)}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </Card>

        {/* Base Animation Library */}
        <Card className="p-3 bg-slate-900 border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <Library className="w-4 h-4 text-blue-300" />
            <h4 className="text-xs font-semibold text-slate-100">Biblioteca, dope sheet y NLA</h4>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] mb-2">
            <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
              <div className="text-slate-500">Clips</div>
              <div className="mt-1 text-slate-100">{animatorState.clips.length}</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
              <div className="text-slate-500">NLA strips</div>
              <div className="mt-1 text-slate-100">{animatorState.nlaStrips.length}</div>
            </div>
          </div>
          <div className="space-y-2 max-h-44 overflow-y-auto pr-1 text-xs">
            {BASE_ANIMATION_LIBRARY.map((clipInfo) => (
              <div key={clipInfo.id} className="rounded border border-slate-800 bg-slate-950/60 p-2 space-y-1">
                <div className="flex items-center justify-between text-slate-200">
                  <span>{clipInfo.name}</span>
                  <span className="text-slate-500">{clipInfo.duration.toFixed(2)}s</span>
                </div>
                <div className="flex flex-wrap gap-1 text-[10px] text-slate-400">
                  {clipInfo.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-slate-800 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px]"
                    onClick={() => {
                      const existing = animatorState.clips.find((entry) => entry.name === clipInfo.name);
                      if (existing) {
                        handleSelectClip(existing.id);
                      } else {
                        setStatus(`Agrega ${clipInfo.name} para activarlo en el editor.`);
                      }
                    }}
                  >
                    Activar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px]"
                    onClick={() => handleAddLibraryClip(clipInfo.name)}
                  >
                    Anadir clip
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Layers className="w-3.5 h-3.5" />
              Clip activo en dope sheet: {clip.name}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={handleAddCurrentClipToNla}
            >
              Add to NLA
            </Button>
          </div>

          <div className="mt-2 space-y-2 max-h-28 overflow-y-auto pr-1">
            {animatorState.nlaStrips.length === 0 && (
              <div className="rounded border border-dashed border-slate-800 bg-slate-950/40 p-2 text-[11px] text-slate-500">
                No hay strips en NLA todavia.
              </div>
            )}
            {animatorState.nlaStrips.map((strip) => {
              const stripClip = animatorState.clips.find((entry) => entry.id === strip.clipId);
              return (
                <div
                  key={strip.id}
                  className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/60 p-2 text-[11px]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-slate-200">{strip.name}</div>
                    <div className="text-slate-500">
                      {stripClip?.name ?? 'Clip'} | {strip.start.toFixed(2)} - {strip.end.toFixed(2)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={strip.muted ? 'ghost' : 'default'}
                    className="h-6 text-[11px]"
                    onClick={() => handleToggleNlaMute(strip.id)}
                  >
                    {strip.muted ? 'Muted' : 'Live'}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {status && (
        <div className="border-t border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-emerald-300">
          {status}
        </div>
      )}
    </div>
  );
}

// Track Item Component
function TrackItem({
  track,
  isSelected,
  onClick,
  onToggleVisibility,
  onToggleLock,
}: {
  track: AnimationTrack;
  isSelected: boolean;
  onClick: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
}) {
  const getIcon = () => {
    switch (track.type) {
      case 'position': return <Move className="w-3 h-3" style={{ color: track.color }} />;
      case 'rotation': return <RotateCw className="w-3 h-3" style={{ color: track.color }} />;
      case 'scale': return <Scale className="w-3 h-3" style={{ color: track.color }} />;
      default: return <Key className="w-3 h-3" style={{ color: track.color }} />;
    }
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-2 py-1 cursor-pointer border-l-2",
        isSelected ? "bg-slate-800 border-l-blue-500" : "border-l-transparent hover:bg-slate-800/50",
        !track.visible && "opacity-60"
      )}
      onClick={onClick}
    >
      {getIcon()}
      <span className="flex-1 text-xs text-slate-300 truncate">{track.name}</span>
      
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <Button
          variant={track.locked ? 'default' : 'ghost'}
          size="sm"
          className="h-5 px-1.5 text-[10px]"
          onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
        >
          L
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
        >
          {track.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}

// Timeline Header
function TimelineHeader({
  duration,
  frameRate,
  zoom,
}: {
  duration: number;
  frameRate: number;
  zoom: number;
}) {
  const totalFrames = Math.ceil(duration * frameRate);
  const frameStep = Math.max(1, Math.floor(10 / zoom));
  
  return (
    <div className="h-6 bg-slate-900 border-b border-slate-800 flex items-end">
      {Array.from({ length: Math.ceil(totalFrames / frameStep) }).map((_, i) => {
        const frame = i * frameStep;
        const time = frame / frameRate;
        const percentage = (time / duration) * 100;
        
        return (
          <div
            key={frame}
            className="absolute h-full flex flex-col items-center"
            style={{ left: `${percentage}%` }}
          >
            <span className="text-[10px] text-slate-500">{frame}</span>
            <div className="w-px h-2 bg-slate-700" />
          </div>
        );
      })}
    </div>
  );
}

// Track Row
function TrackRow({
  track,
  duration,
  zoom,
  showCurves,
  selectedKeyframes,
  onKeyframeSelect,
  onKeyframeMove,
}: {
  track: AnimationTrack;
  duration: number;
  zoom: number;
  showCurves: boolean;
  selectedKeyframes: Set<string>;
  onKeyframeSelect: (id: string, multi: boolean) => void;
  onKeyframeMove: (id: string, newTime: number) => void;
}) {
  return (
    <div className="relative h-6 border-b border-slate-800/50">
      {/* Keyframes */}
      {track.keyframes.map(keyframe => {
        const percentage = (keyframe.time / duration) * 100;
        const isSelected = selectedKeyframes.has(keyframe.id);
        
        return (
          <div
            key={keyframe.id}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 w-3 h-3 cursor-pointer transition-transform",
              isSelected && "scale-125"
            )}
            style={{
              left: `calc(${percentage}% - 6px)`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onKeyframeSelect(keyframe.id, e.shiftKey);
            }}
          >
            <Diamond
              className={cn(
                "w-3 h-3",
                isSelected ? "text-white" : "text-slate-400"
              )}
              style={{ fill: track.color, color: track.color }}
            />
          </div>
        );
      })}
    </div>
  );
}

// Curve Editor
function CurveEditor({
  track,
  duration,
  currentTime,
}: {
  track: AnimationTrack;
  duration: number;
  currentTime: number;
}) {
  return (
    <div className="h-full bg-slate-900 relative">
      {/* Grid */}
      <svg className="absolute inset-0 w-full h-full">
        {/* Grid lines */}
        {Array.from({ length: 10 }).map((_, i) => (
          <line
            key={`v${i}`}
            x1={`${i * 10}%`}
            y1="0"
            x2={`${i * 10}%`}
            y2="100%"
            stroke="#334155"
            strokeWidth="0.5"
          />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line
            key={`h${i}`}
            x1="0"
            y1={`${i * 25}%`}
            x2="100%"
            y2={`${i * 25}%`}
            stroke="#334155"
            strokeWidth="0.5"
          />
        ))}
        
        {/* Curve */}
        <path
          d={generateCurvePath(track.keyframes, duration)}
          fill="none"
          stroke={track.color}
          strokeWidth="2"
        />
        
        {/* Keyframe points */}
        {track.keyframes.map(kf => {
          const x = (kf.time / duration) * 100;
          const y = typeof kf.value === 'number' 
            ? 100 - (kf.value / 5) * 100  // Normalize to 0-5 range
            : 50;
          return (
            <circle
              key={kf.id}
              cx={`${x}%`}
              cy={`${Math.max(0, Math.min(100, y))}%`}
              r="4"
              fill={track.color}
            />
          );
        })}
      </svg>
      
      {/* Playhead */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-red-500"
        style={{ left: `${(currentTime / duration) * 100}%` }}
      />
    </div>
  );
}

// Generate SVG path for curve
function generateCurvePath(keyframes: Keyframe[], duration: number): string {
  if (keyframes.length < 2) return '';
  
  const points = keyframes.map(kf => ({
    x: (kf.time / duration) * 100,
    y: typeof kf.value === 'number' 
      ? 100 - Math.min(100, Math.max(0, (kf.value / 5) * 100))
      : 50,
  }));
  
  let path = `M ${points[0].x} ${points[0].y}`;
  
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    
    // Simple curve
    const cp1x = prev.x + (curr.x - prev.x) * 0.5;
    const cp1y = prev.y;
    const cp2x = prev.x + (curr.x - prev.x) * 0.5;
    const cp2y = curr.y;
    
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
  }
  
  return path;
}
