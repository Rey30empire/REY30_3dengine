'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEngineStore } from '@/store/editorStore';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AGENT_LEVELS,
  CHARACTER_PIPELINE,
  type AgentLevelId,
  type PipelinePlanOutput,
} from '@/engine/ai/agent-levels';
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Layers3,
  Loader2,
  Route,
  Sparkles,
  Workflow,
} from 'lucide-react';

export function AIAgentLevelsPanel() {
  const { addChatMessage, setAIMode, addAsset } = useEngineStore();
  const [selectedLevel, setSelectedLevel] = useState<AgentLevelId>('level1_copilot');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('realista');
  const [target, setTarget] = useState('juego');
  const [rigRequired, setRigRequired] = useState(true);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PipelinePlanOutput | null>(null);
  const [basePrompt, setBasePrompt] = useState('');
  const [frontRef, setFrontRef] = useState('');
  const [sideRef, setSideRef] = useState('');
  const [baseStyle, setBaseStyle] = useState('realista');
  const [baseGenerating, setBaseGenerating] = useState(false);
  const [baseSummary, setBaseSummary] = useState<string | null>(null);
  const [baseQuality, setBaseQuality] = useState<{ vertices: number; triangles: number; issues: string[] } | null>(null);
  const [fullPrompt, setFullPrompt] = useState('');
  const [fullStyle, setFullStyle] = useState('realista');
  const [fullEngine, setFullEngine] = useState<'unity' | 'unreal' | 'generic'>('generic');
  const [fullIncludeAnims, setFullIncludeAnims] = useState(true);
  const [fullIncludeBlend, setFullIncludeBlend] = useState(true);
  const [fullGenerating, setFullGenerating] = useState(false);
  const [fullSummary, setFullSummary] = useState<string | null>(null);
  const [fullQuality, setFullQuality] = useState<{
    vertices: number;
    triangles: number;
    rigBones: number;
    blendshapes: number;
    animations: number;
    checks?: string[];
  } | null>(null);
  const [valPath, setValPath] = useState('');
  const [valRunning, setValRunning] = useState(false);
  const [valIssues, setValIssues] = useState<Array<{ type: string; severity: string; detail: string }> | null>(null);
  const [valSummary, setValSummary] = useState<string | null>(null);
  const [expPath, setExpPath] = useState('');
  const [expTarget, setExpTarget] = useState<'gltf' | 'fbx' | 'unity' | 'unreal' | 'blender'>('gltf');
  const [expPreset, setExpPreset] = useState<'mobile' | 'desktop' | 'cinematic'>('desktop');
  const [expAxis, setExpAxis] = useState<'y_up' | 'z_up'>('y_up');
  const [expEmbed, setExpEmbed] = useState(true);
  const [expRunning, setExpRunning] = useState(false);
  const [expSummary, setExpSummary] = useState<string | null>(null);
  const [expManifest, setExpManifest] = useState<string | null>(null);

  const levelSpec = useMemo(
    () => AGENT_LEVELS.find((level) => level.id === selectedLevel) || AGENT_LEVELS[0],
    [selectedLevel]
  );

  const activateModeForLevel = (level: AgentLevelId) => {
    if (level === 'level1_copilot') {
      setAIMode('LOCAL');
      return;
    }
    setAIMode('API');
  };

  const generateFullCharacter = async () => {
    if (!fullPrompt.trim()) return;
    setFullGenerating(true);
    setFullSummary(null);
    setFullQuality(null);

    try {
      const response = await fetch('/api/character/full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          style: fullStyle,
          targetEngine: fullEngine,
          includeAnimations: fullIncludeAnims,
          includeBlendshapes: fullIncludeBlend,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Fallo al generar el personaje completo');
      }

      const pkgPath = payload.packagePath ?? `/virtual/Character_${Date.now()}`;
      addAsset({
        id: crypto.randomUUID(),
        name: `CharacterPackage_${new Date().toISOString()}`,
        type: 'prefab',
        path: pkgPath,
        size: JSON.stringify(payload.mesh || {}).length + JSON.stringify(payload.rig || {}).length,
        createdAt: new Date(),
        metadata: {
          source: 'ai_level3_full_character',
          prompt: fullPrompt,
          style: fullStyle,
          targetEngine: fullEngine,
          quality: payload.quality,
          assets: {
            textures: payload.textures?.length,
            animations: payload.animations?.length,
            blendshapes: payload.blendshapes?.length,
          },
        },
      } as any);

      setFullSummary(payload.summary || 'Personaje generado');
      setFullQuality(payload.quality || null);
      addChatMessage({
        role: 'assistant',
        content: `✅ Personaje completo generado y agregado al proyecto.\n${payload.summary || ''}`,
        metadata: { type: 'full-character', results: payload },
      });
    } catch (error) {
      setFullSummary(String(error));
      addChatMessage({
        role: 'assistant',
        content: `❌ Error al generar personaje completo: ${String(error)}`,
        metadata: { type: 'error' },
      });
    } finally {
      setFullGenerating(false);
    }
  };

  const runValidation = async () => {
    if (!valPath.trim()) return;
    setValRunning(true);
    setValIssues(null);
    setValSummary(null);
    try {
      const response = await fetch('/api/character/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: valPath }),
      });
      const payload = await response.json().catch(() => ({}));
      const issues = Array.isArray(payload.issues) ? payload.issues : [];
      if (issues.length) setValIssues(issues);
      const summary = payload.summary || (response.ok ? 'Validación completada' : 'Validación falló');
      setValSummary(summary);

      if (!response.ok || !payload.success) {
        addChatMessage({
          role: 'assistant',
          content: `❌ Validación falló.\n${summary}`,
          metadata: { type: 'error', results: payload },
        });
        return;
      }

      addChatMessage({
        role: 'assistant',
        content: `🔍 Validación de personaje lista.\n${summary}`,
        metadata: { type: 'validation', results: payload },
      });
    } catch (error) {
      setValSummary(String(error));
      addChatMessage({
        role: 'assistant',
        content: `❌ Error en validación: ${String(error)}`,
        metadata: { type: 'error' },
      });
    } finally {
      setValRunning(false);
    }
  };

  const runExport = async () => {
    if (!expPath.trim()) return;
    setExpRunning(true);
    setExpSummary(null);
    setExpManifest(null);
    try {
      const response = await fetch('/api/exporters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputPath: expPath,
          target: expTarget,
          preset: expPreset,
          axis: expAxis,
          embedTextures: expEmbed,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Fallo al exportar');
      }
      const summary = payload.summary || 'Export generado';
      setExpSummary(payload.stub ? `${summary} (${payload.warning || 'placeholder'})` : summary);
      setExpManifest(payload.manifest || null);
      addChatMessage({
        role: 'assistant',
        content: payload.stub
          ? `⚠️ Export ${expTarget} generado como placeholder.\n${payload.warning || summary}`
          : `📦 Export ${expTarget} listo.\n${summary}`,
        metadata: { type: 'export', results: payload },
      });
    } catch (error) {
      setExpSummary(String(error));
      addChatMessage({
        role: 'assistant',
        content: `❌ Error en export: ${String(error)}`,
        metadata: { type: 'error' },
      });
    } finally {
      setExpRunning(false);
    }
  };

  const generatePlan = async () => {
    if (!prompt.trim()) return;
    setLoading(true);

    try {
      const response = await fetch('/api/ai-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          level: selectedLevel,
          style,
          target,
          rigRequired,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.plan) {
        throw new Error(payload.error || 'No se pudo generar el plan del pipeline');
      }

      setPlan(payload.plan as PipelinePlanOutput);
      addChatMessage({
        role: 'assistant',
        content: `Plan de agentes creado: ${payload.plan.summary}`,
        metadata: {
          type: 'agent-plan',
          results: payload.plan,
        },
      });
    } catch (error) {
      addChatMessage({
        role: 'assistant',
        content: `Error al generar plan de agentes: ${String(error)}`,
        metadata: { type: 'error' },
      });
    } finally {
      setLoading(false);
    }
  };

  const generateBaseMesh = async () => {
    if (!basePrompt.trim()) return;
    setBaseGenerating(true);
    setBaseSummary(null);
    setBaseQuality(null);

    try {
      const response = await fetch('/api/character/base-mesh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: basePrompt,
          style: baseStyle,
          references: [frontRef, sideRef].filter(Boolean),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Fallo al generar la malla base');
      }

      const meshPath = payload.path ?? `/virtual/BaseMesh_${Date.now()}.json`;
      addAsset({
        id: crypto.randomUUID(),
        name: `BaseMesh_${new Date().toISOString()}.json`,
        type: 'mesh',
        path: meshPath,
        size: JSON.stringify(payload.mesh || {}).length,
        createdAt: new Date(),
        metadata: {
          source: 'ai_level2_base_mesh',
          prompt: basePrompt,
          style: baseStyle,
          references: [frontRef, sideRef].filter(Boolean),
          quality: payload.quality,
        },
      } as any);

      setBaseSummary(payload.summary || 'Malla base generada');
      setBaseQuality(payload.quality || null);
      addChatMessage({
        role: 'assistant',
        content: `✅ Malla base generada y añadida al proyecto.\n${payload.summary || ''}`,
        metadata: { type: 'base-mesh', results: payload },
      });
    } catch (error) {
      setBaseSummary(String(error));
      addChatMessage({
        role: 'assistant',
        content: `❌ Error al generar malla base: ${String(error)}`,
        metadata: { type: 'error' },
      });
    } finally {
      setBaseGenerating(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-900">
      <div className="border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-medium text-slate-100">AI Agents</h3>
        </div>
        <p className="mt-1 text-xs text-slate-400">Niveles de agentes para modelado, base mesh y personaje completo.</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          <section className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase text-slate-400">Nivel de agentes</h4>
              <Layers3 className="h-4 w-4 text-blue-300" />
            </div>
            <div className="grid gap-2">
              {AGENT_LEVELS.map((level) => (
                <button
                  key={level.id}
                  onClick={() => {
                    setSelectedLevel(level.id);
                    activateModeForLevel(level.id);
                  }}
                  className={`rounded border p-2 text-left text-xs ${
                    selectedLevel === level.id
                      ? 'border-blue-500/60 bg-blue-500/10 text-slate-100'
                      : 'border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="font-medium">{level.name}</div>
                  <p className="mt-1 text-[11px] text-slate-500">{level.goal}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase text-slate-400">Configuracion de plan</h4>
              <Sparkles className="h-4 w-4 text-amber-300" />
            </div>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe el personaje o el objetivo del pipeline."
              className="min-h-20 bg-slate-950 border-slate-700"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={style}
                onChange={(event) => setStyle(event.target.value)}
                placeholder="Estilo (realista/cartoon)"
                className="bg-slate-950 border-slate-700"
              />
              <Input
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder="Destino (juego/cine/movil)"
                className="bg-slate-950 border-slate-700"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={rigRequired}
                onChange={(event) => setRigRequired(event.target.checked)}
              />
              Requiere rig automatico
            </label>
            <Button className="w-full" onClick={generatePlan} disabled={loading || !prompt.trim()}>
              {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Workflow className="mr-1 h-3 w-3" />}
              Generar plan por agentes
            </Button>
          </section>

          {/* Base Mesh (Nivel 2) */}
          <section className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase text-slate-400">Generar malla base (Nivel 2)</h4>
              <Layers3 className="h-4 w-4 text-emerald-300" />
            </div>
            <Textarea
              value={basePrompt}
              onChange={(e) => setBasePrompt(e.target.value)}
              placeholder="Prompt del personaje (texto, estilo, rol, proporciones)..."
              className="min-h-20 bg-slate-950 border-slate-700"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={baseStyle}
                onChange={(e) => setBaseStyle(e.target.value)}
                placeholder="Estilo (realista/cartoon/anime)"
                className="bg-slate-950 border-slate-700 text-xs"
              />
              <Input
                value={frontRef}
                onChange={(e) => setFrontRef(e.target.value)}
                placeholder="URL boceto / vista frontal (opcional)"
                className="bg-slate-950 border-slate-700 text-xs"
              />
              <Input
                value={sideRef}
                onChange={(e) => setSideRef(e.target.value)}
                placeholder="URL vista lateral / multiview (opcional)"
                className="bg-slate-950 border-slate-700 text-xs"
              />
            </div>
            <div className="text-[11px] text-slate-400">
              Entradas soportadas: texto + URLs de imagen/boceto (frente/lado). Genera un base mesh procedural listo para retopo.
            </div>
            <Button
              className="w-full"
              onClick={generateBaseMesh}
              disabled={baseGenerating || !basePrompt.trim()}
            >
              {baseGenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
              Crear malla base
            </Button>
            {(baseSummary || baseQuality) && (
              <Card className="bg-slate-900 border-slate-800 p-2 text-xs text-slate-200 space-y-1">
                {baseSummary && <div>{baseSummary}</div>}
                {baseQuality && (
                  <div className="text-[11px] text-slate-400">
                    Vértices: {baseQuality.vertices} · Triángulos: {baseQuality.triangles}
                    {baseQuality.issues?.length ? (
                      <div className="mt-1 space-y-0.5">
                        {baseQuality.issues.map((issue: string, idx: number) => (
                          <div key={idx} className="text-amber-300">• {issue}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </Card>
            )}
          </section>

          {/* Personaje completo (Nivel 3) */}
          <section className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase text-slate-400">Personaje completo (Nivel 3)</h4>
              <Bot className="h-4 w-4 text-purple-300" />
            </div>
            <Textarea
              value={fullPrompt}
              onChange={(e) => setFullPrompt(e.target.value)}
              placeholder="Prompt del personaje + rol + estilo + restricciones técnicas"
              className="min-h-20 bg-slate-950 border-slate-700"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={fullStyle}
                onChange={(e) => setFullStyle(e.target.value)}
                placeholder="Estilo (realista/cartoon/anime)"
                className="bg-slate-950 border-slate-700 text-xs"
              />
              <Select
                value={fullEngine}
                onValueChange={(v) => setFullEngine(v as typeof fullEngine)}
              >
                <SelectTrigger className="h-8 bg-slate-950 border-slate-700 text-xs">
                  <SelectValue placeholder="Engine destino" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="generic">Genérico</SelectItem>
                  <SelectItem value="unity">Unity</SelectItem>
                  <SelectItem value="unreal">Unreal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-300">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={fullIncludeAnims}
                  onChange={(e) => setFullIncludeAnims(e.target.checked)}
                />
                Animaciones base
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={fullIncludeBlend}
                  onChange={(e) => setFullIncludeBlend(e.target.checked)}
                />
                Blendshapes faciales
              </label>
            </div>

            <Button
              className="w-full"
              onClick={generateFullCharacter}
              disabled={fullGenerating || !fullPrompt.trim()}
            >
              {fullGenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
              Generar personaje completo
            </Button>

            {(fullSummary || fullQuality) && (
              <Card className="bg-slate-900 border-slate-800 p-2 text-xs text-slate-200 space-y-1">
                {fullSummary && <div>{fullSummary}</div>}
                {fullQuality && (
                  <div className="text-[11px] text-slate-400">
                    Vértices: {fullQuality.vertices} · Triángulos: {fullQuality.triangles} · Huesos: {fullQuality.rigBones} · Blendshapes: {fullQuality.blendshapes} · Animaciones: {fullQuality.animations}
                    {fullQuality.checks?.length ? (
                      <div className="mt-1 space-y-0.5">
                        {fullQuality.checks.map((issue: string, idx: number) => (
                          <div key={idx} className="text-amber-300">• {issue}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </Card>
            )}
          </section>

          {/* Validación automática */}
          <section className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase text-slate-400">Validación automática de personaje</h4>
              <Workflow className="h-4 w-4 text-cyan-300" />
            </div>
            <Input
              value={valPath}
              onChange={(e) => setValPath(e.target.value)}
              placeholder="Ruta al mesh/paquete (mesh.json o package.json)"
              className="bg-slate-950 border-slate-700 text-xs"
            />
            <div className="text-[11px] text-slate-400">
              Se evalúa polycount, UVs, caras degeneradas/flipped y rig básico. Usa rutas de assets generados (download/assets/...).
            </div>
            <Button className="w-full" onClick={runValidation} disabled={valRunning || !valPath.trim()}>
              {valRunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
              Validar personaje
            </Button>
            {(valSummary || valIssues) && (
              <Card className="bg-slate-900 border-slate-800 p-2 text-xs text-slate-200 space-y-2">
                {valSummary && <div>{valSummary}</div>}
                {valIssues && (
                  <div className="space-y-1">
                    {valIssues.map((iss, idx) => (
                      <div
                        key={idx}
                        className={
                          iss.severity === 'error'
                            ? 'text-red-300'
                            : iss.severity === 'warn'
                            ? 'text-amber-300'
                            : 'text-slate-300'
                        }
                      >
                        • [{iss.type}] {iss.detail}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </section>

          {/* Exportadores DCC/Game */}
          <section className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase text-slate-400">Exportadores (Unity/Unreal/Blender/GLTF/FBX)</h4>
              <Workflow className="h-4 w-4 text-blue-300" />
            </div>
            <Input
              value={expPath}
              onChange={(e) => setExpPath(e.target.value)}
              placeholder="Ruta del mesh/paquete a exportar"
              className="bg-slate-950 border-slate-700 text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={expTarget} onValueChange={(v) => setExpTarget(v as typeof expTarget)}>
                <SelectTrigger className="h-8 bg-slate-950 border-slate-700 text-xs">
                  <SelectValue placeholder="Target" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="gltf">GLTF</SelectItem>
                  <SelectItem value="fbx">FBX</SelectItem>
                  <SelectItem value="unity">Unity</SelectItem>
                  <SelectItem value="unreal">Unreal</SelectItem>
                  <SelectItem value="blender">Blender</SelectItem>
                </SelectContent>
              </Select>

              <Select value={expPreset} onValueChange={(v) => setExpPreset(v as typeof expPreset)}>
                <SelectTrigger className="h-8 bg-slate-950 border-slate-700 text-xs">
                  <SelectValue placeholder="Preset" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="mobile">Mobile</SelectItem>
                  <SelectItem value="desktop">Desktop</SelectItem>
                  <SelectItem value="cinematic">Cinematic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-300 flex-wrap">
              <Select value={expAxis} onValueChange={(v) => setExpAxis(v as typeof expAxis)}>
                <SelectTrigger className="h-8 bg-slate-950 border-slate-700 text-xs w-28">
                  <SelectValue placeholder="Eje" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="y_up">Y Up</SelectItem>
                  <SelectItem value="z_up">Z Up</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={expEmbed}
                  onChange={(e) => setExpEmbed(e.target.checked)}
                />
                Embed textures
              </label>
            </div>

            <Button className="w-full" onClick={runExport} disabled={expRunning || !expPath.trim()}>
              {expRunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
              Exportar
            </Button>

            {(expSummary || expManifest) && (
              <Card className="bg-slate-900 border-slate-800 p-2 text-xs text-slate-200 space-y-1">
                {expSummary && <div>{expSummary}</div>}
                {expManifest && <div className="text-[11px] text-slate-400">Manifest: {expManifest}</div>}
              </Card>
            )}
          </section>

          <section className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase text-slate-400">Agentes del nivel</h4>
              <Bot className="h-4 w-4 text-emerald-300" />
            </div>
            {levelSpec.agents.map((agent) => (
              <div key={agent.id} className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
                <div className="text-xs text-slate-200">{agent.name}</div>
                <p className="mt-1 text-[11px] text-slate-500">{agent.description}</p>
                <p className="mt-1 text-[10px] text-cyan-300">Tools: {agent.tools.join(', ')}</p>
              </div>
            ))}
          </section>

          <section className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase text-slate-400">Pipeline de personaje (9 pasos)</h4>
              <Route className="h-4 w-4 text-purple-300" />
            </div>
            {CHARACTER_PIPELINE.map((stage) => (
              <div key={stage.id} className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-200">{stage.title}</span>
                  <span className="text-[10px] uppercase text-blue-300">{stage.owner}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{stage.validationRules.join(' | ')}</p>
              </div>
            ))}
          </section>

          {plan && (
            <section className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase text-slate-400">Ultimo plan generado</h4>
                <CheckCircle2 className="h-4 w-4 text-green-300" />
              </div>
              <p className="text-xs text-slate-300">{plan.summary}</p>
              <div className="space-y-1">
                {plan.stages.map((stage) => (
                  <div key={stage.stageId} className="text-[11px] text-slate-500">
                    - {stage.title} ({stage.owner})
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
