'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Camera,
  ChevronsUpDown,
  Focus,
  Globe,
  Grid3X3,
  Magnet,
  Move,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Scale,
  SkipForward,
  Square,
  Sun,
  Box,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type CameraMode = 'perspective' | 'orthographic' | 'top' | 'front' | 'side';
export type SnapTarget = 'grid' | 'vertex' | 'surface';
export type PivotMode = 'objectOrigin' | 'selectionCenter';

type SnapValues = {
  translate: number;
  rotate: number;
  scale: number;
};

type AxisState = {
  x: boolean;
  y: boolean;
  z: boolean;
};

interface EditorToolbarProps {
  className?: string;
  playState: 'IDLE' | 'PLAYING' | 'PAUSED';
  transformMode: TransformMode;
  transformSpace: 'world' | 'local';
  showGrid: boolean;
  gridSize: number;
  snapEnabled: boolean;
  snapTarget: SnapTarget;
  snapValues: SnapValues;
  activeAxes: AxisState;
  cameraMode: CameraMode;
  pivotMode: PivotMode;
  canAdjustOrigin: boolean;
  showLights: boolean;
  showColliders: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onStep?: () => void;
  onTransformModeChange?: (mode: TransformMode) => void;
  onTransformSpaceChange?: (space: 'world' | 'local') => void;
  onGridVisibilityChange?: (visible: boolean) => void;
  onGridSizeChange?: (size: number) => void;
  onSnapEnabledChange?: (enabled: boolean) => void;
  onSnapTargetChange?: (target: SnapTarget) => void;
  onSnapValuesChange?: (values: SnapValues) => void;
  onActiveAxesChange?: (axes: AxisState) => void;
  onCameraModeChange?: (mode: CameraMode) => void;
  onPivotModeChange?: (mode: PivotMode) => void;
  onOriginToGeometry?: () => void;
  onGeometryToOrigin?: () => void;
  onShowLightsChange?: (visible: boolean) => void;
  onShowCollidersChange?: (visible: boolean) => void;
  onFocusSelected?: () => void;
  onResetView?: () => void;
}

function ToolButton({
  active,
  onClick,
  icon,
  tooltip,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <Button
      variant={active ? 'default' : 'ghost'}
      size="sm"
      className={cn('h-7 w-7 p-0', active && 'bg-blue-500 hover:bg-blue-600')}
      onClick={onClick}
      title={tooltip}
    >
      {icon}
    </Button>
  );
}

export function EditorToolbar({
  className,
  playState,
  transformMode,
  transformSpace,
  showGrid,
  gridSize,
  snapEnabled,
  snapTarget,
  snapValues,
  activeAxes,
  cameraMode,
  pivotMode,
  canAdjustOrigin,
  showLights,
  showColliders,
  onPlay,
  onPause,
  onStop,
  onStep,
  onTransformModeChange,
  onTransformSpaceChange,
  onGridVisibilityChange,
  onGridSizeChange,
  onSnapEnabledChange,
  onSnapTargetChange,
  onSnapValuesChange,
  onActiveAxesChange,
  onCameraModeChange,
  onPivotModeChange,
  onOriginToGeometry,
  onGeometryToOrigin,
  onShowLightsChange,
  onShowCollidersChange,
  onFocusSelected,
  onResetView,
}: EditorToolbarProps) {
  const isPlaying = playState === 'PLAYING';
  const isPaused = playState === 'PAUSED';

  const updateSnapValue = (key: keyof SnapValues, rawValue: string, fallback: number) => {
    const parsed = Number(rawValue);
    onSnapValuesChange?.({
      ...snapValues,
      [key]: Number.isFinite(parsed) && parsed > 0 ? parsed : fallback,
    });
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/92 p-2 backdrop-blur-sm',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded bg-slate-800 p-0.5">
          <ToolButton
            active={transformMode === 'translate'}
            onClick={() => onTransformModeChange?.('translate')}
            icon={<Move className="h-4 w-4" />}
            tooltip="Move (W)"
          />
          <ToolButton
            active={transformMode === 'rotate'}
            onClick={() => onTransformModeChange?.('rotate')}
            icon={<RotateCw className="h-4 w-4" />}
            tooltip="Rotate (E)"
          />
          <ToolButton
            active={transformMode === 'scale'}
            onClick={() => onTransformModeChange?.('scale')}
            icon={<Scale className="h-4 w-4" />}
            tooltip="Scale (R)"
          />
        </div>

        <Button
          variant={transformSpace === 'world' ? 'default' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onTransformSpaceChange?.(transformSpace === 'world' ? 'local' : 'world')}
        >
          <Globe className="mr-1 h-3.5 w-3.5" />
          {transformSpace === 'world' ? 'World' : 'Local'}
        </Button>

        <div className="flex items-center gap-0.5 rounded bg-slate-800 p-0.5">
          <ToolButton
            active={showGrid}
            onClick={() => onGridVisibilityChange?.(!showGrid)}
            icon={<Grid3X3 className="h-4 w-4" />}
            tooltip="Toggle Grid"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <ChevronsUpDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-slate-700 bg-slate-800">
              <DropdownMenuLabel>Grid Size</DropdownMenuLabel>
              {[0.25, 0.5, 1, 2, 4].map((size) => (
                <DropdownMenuItem
                  key={size}
                  onClick={() => onGridSizeChange?.(size)}
                  className={cn(gridSize === size && 'bg-slate-700')}
                >
                  {size} unit{size !== 1 ? 's' : ''}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={snapEnabled ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2"
            >
              <Magnet className="mr-1 h-3.5 w-3.5" />
              Snap
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="border-slate-700 bg-slate-800">
            <DropdownMenuLabel>Snapping</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={snapEnabled}
              onCheckedChange={(checked) => onSnapEnabledChange?.(Boolean(checked))}
            >
              Enable snap
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Snap Target</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onSnapTargetChange?.('grid')}
              className={cn(snapTarget === 'grid' && 'bg-slate-700')}
            >
              Grid
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSnapTargetChange?.('vertex')}
              className={cn(snapTarget === 'vertex' && 'bg-slate-700')}
            >
              Vertex
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSnapTargetChange?.('surface')}
              className={cn(snapTarget === 'surface' && 'bg-slate-700')}
            >
              Surface
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Snap Values</DropdownMenuLabel>
            <div className="grid grid-cols-3 gap-2 p-2">
              <div>
                <label className="text-[10px] text-slate-500">Move</label>
                <Input
                  type="number"
                  value={snapValues.translate}
                  onChange={(event) => updateSnapValue('translate', event.target.value, 1)}
                  className="h-6 w-16 text-xs"
                  step={0.25}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Rotate</label>
                <Input
                  type="number"
                  value={snapValues.rotate}
                  onChange={(event) => updateSnapValue('rotate', event.target.value, 15)}
                  className="h-6 w-16 text-xs"
                  step={5}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Scale</label>
                <Input
                  type="number"
                  value={snapValues.scale}
                  onChange={(event) => updateSnapValue('scale', event.target.value, 0.1)}
                  className="h-6 w-16 text-xs"
                  step={0.1}
                />
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              Axes
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="border-slate-700 bg-slate-800">
            <DropdownMenuLabel>Gizmo Axes</DropdownMenuLabel>
            {(['x', 'y', 'z'] as const).map((axis) => (
              <DropdownMenuCheckboxItem
                key={axis}
                checked={activeAxes[axis]}
                onCheckedChange={(checked) =>
                  onActiveAxesChange?.({
                    ...activeAxes,
                    [axis]: Boolean(checked),
                  })
                }
              >
                {axis.toUpperCase()} Axis
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1">
        <Button
          variant={isPlaying ? 'default' : 'ghost'}
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onPlay}
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          variant={isPaused ? 'default' : 'ghost'}
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onPause}
          disabled={playState === 'IDLE'}
        >
          <Pause className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onStop}
          disabled={playState === 'IDLE'}
        >
          <Square className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onStep}
          disabled={playState === 'IDLE'}
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              Pivot
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-slate-700 bg-slate-800">
            <DropdownMenuLabel>Pivot</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onPivotModeChange?.('objectOrigin')}
              className={cn(pivotMode === 'objectOrigin' && 'bg-slate-700')}
            >
              Object Origin
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onPivotModeChange?.('selectionCenter')}
              className={cn(pivotMode === 'selectionCenter' && 'bg-slate-700')}
            >
              Selection Center
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Origin</DropdownMenuLabel>
            <DropdownMenuItem disabled={!canAdjustOrigin} onClick={onOriginToGeometry}>
              Origin to Geometry
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canAdjustOrigin} onClick={onGeometryToOrigin}>
              Geometry to Origin
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <Camera className="mr-1 h-3.5 w-3.5" />
              {cameraMode === 'perspective'
                ? 'Persp'
                : cameraMode === 'orthographic'
                  ? 'Ortho'
                  : cameraMode.charAt(0).toUpperCase() + cameraMode.slice(1)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-slate-700 bg-slate-800">
            <DropdownMenuLabel>Camera View</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onCameraModeChange?.('perspective')}>
              Perspective
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCameraModeChange?.('orthographic')}>
              Orthographic
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onCameraModeChange?.('top')}>Top</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCameraModeChange?.('front')}>Front</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCameraModeChange?.('side')}>Side</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <Sun className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-slate-700 bg-slate-800">
            <DropdownMenuLabel>Viewport Filters</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={showLights}
              onCheckedChange={(checked) => onShowLightsChange?.(Boolean(checked))}
            >
              <Sun className="mr-2 h-3.5 w-3.5" />
              Show Lights
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showColliders}
              onCheckedChange={(checked) => onShowCollidersChange?.(Boolean(checked))}
            >
              <Box className="mr-2 h-3.5 w-3.5" />
              Show Colliders
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Focus Selected (F)"
          onClick={onFocusSelected}
        >
          <Focus className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Reset View"
          onClick={onResetView}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
