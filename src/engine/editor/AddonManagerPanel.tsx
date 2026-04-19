'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { useEngineStore } from '@/store/editorStore';
import {
  getAddonTemplatesByKind,
  type AddonTemplateDefinition,
} from '@/lib/addon-templates';
import {
  getAddonQuickActions,
  runAddonQuickAction,
} from './addonQuickActions';
import type { Addon, AddonPermission } from '@/types/engine';
import { Boxes, Plug, Puzzle, RefreshCw, Trash2 } from 'lucide-react';

type AvailablePackage = {
  name: string;
  relativePath: string;
  kinds: string[];
  assetCount: number;
};

type AddonStorageInfo = {
  backend: 'filesystem' | 'netlify-blobs';
  scope: 'filesystem' | 'deploy' | 'global';
  root?: string;
  storeName?: string;
};

const PERMISSION_OPTIONS: AddonPermission[] = [
  'filesystem',
  'network',
  'rendering',
  'scene',
  'assets',
  'ai',
];

const CATEGORY_OPTIONS = [
  'general',
  'animation',
  'modeling',
  'materials',
  'scripting',
  'ai',
  'workflow',
  'runtime',
] as const;

function formatStorage(storage: AddonStorageInfo | null): string {
  if (!storage) return '';
  if (storage.backend === 'netlify-blobs') {
    return `Storage: Netlify Blobs (${storage.scope}${storage.storeName ? ` / ${storage.storeName}` : ''})`;
  }
  return `Storage: filesystem local${storage.root ? ` (${storage.root})` : ''}`;
}

function parseCommaList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const TOOLING_TEMPLATES = getAddonTemplatesByKind('tooling');
const CONTENT_PACK_TEMPLATES = getAddonTemplatesByKind('content-pack');

function TemplateInstallCard({
  template,
  alreadyInstalled,
  isInstallingTemplate,
  onInstall,
}: {
  template: AddonTemplateDefinition;
  alreadyInstalled: boolean;
  isInstallingTemplate: boolean;
  onInstall: (template: AddonTemplateDefinition) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-slate-100">{template.name}</div>
            <Badge variant="outline" className="border-cyan-500/30 text-[10px] text-cyan-200">
              {template.category}
            </Badge>
            <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
              {template.kind === 'content-pack' ? 'content pack' : 'tooling'}
            </Badge>
            {alreadyInstalled ? (
              <Badge variant="outline" className="border-emerald-500/30 text-[10px] text-emerald-200">
                instalado
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-slate-400">{template.summary}</div>
        </div>
        <Button
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => onInstall(template)}
          disabled={isInstallingTemplate}
        >
          {isInstallingTemplate ? 'Instalando...' : alreadyInstalled ? 'Reinstalar' : 'Instalar'}
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        <div className="text-[11px] text-slate-500">{template.description}</div>
        <div className="flex flex-wrap gap-2">
          {template.workspaceHints.map((hint) => (
            <Badge key={`${template.id}-hint-${hint}`} variant="outline" className="border-slate-700 text-[10px] text-slate-300">
              workspace: {hint}
            </Badge>
          ))}
        </div>
        {template.coverage?.length ? (
          <div className="flex flex-wrap gap-2">
            {template.coverage.map((entry) => (
              <Badge
                key={`${template.id}-coverage-${entry}`}
                variant="outline"
                className="border-blue-500/20 text-[10px] text-blue-200"
              >
                {entry}
              </Badge>
            ))}
          </div>
        ) : null}
        <ul className="space-y-1 text-[11px] text-slate-500">
          {template.highlights.map((highlight) => (
            <li key={`${template.id}-highlight-${highlight}`}>• {highlight}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function AddonManagerPanel() {
  const { entities, editor, updateEntity, addEntity, selectEntity } = useEngineStore();
  const [addons, setAddons] = useState<Addon[]>([]);
  const [packages, setPackages] = useState<AvailablePackage[]>([]);
  const [storage, setStorage] = useState<AddonStorageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installingTemplateId, setInstallingTemplateId] = useState<string | null>(null);
  const [selectedPackagePath, setSelectedPackagePath] = useState<string>('manifest');
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [author, setAuthor] = useState('Local Owner');
  const [category, setCategory] = useState<string>('general');
  const [description, setDescription] = useState('');
  const [entryPoint, setEntryPoint] = useState('');
  const [workspaceHints, setWorkspaceHints] = useState('scene');
  const [dependencies, setDependencies] = useState('');
  const [permissions, setPermissions] = useState<AddonPermission[]>(['assets']);

  const selectedPackage = useMemo(
    () => packages.find((item) => item.relativePath === selectedPackagePath) ?? null,
    [packages, selectedPackagePath]
  );
  const installedAddonIds = useMemo(() => new Set(addons.map((addon) => addon.id)), [addons]);
  const selectedEntity =
    editor.selectedEntities.length === 1
      ? entities.get(editor.selectedEntities[0]) ?? null
      : null;

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/addons');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'No se pudo cargar la lista de addons');
      }
      setAddons(Array.isArray(payload.addons) ? payload.addons.map((item: { addon: Addon }) => item.addon) : []);
      setPackages(Array.isArray(payload.packages) ? payload.packages : []);
      setStorage(payload.storage ?? null);
    } catch (error) {
      toast({
        title: 'No se pudo cargar addons',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!selectedPackage) return;
    if (!name.trim()) setName(selectedPackage.name);
    if (!description.trim()) {
      setDescription(
        `Addon instalado desde ${selectedPackage.name} con ${selectedPackage.assetCount} asset(s).`
      );
    }
    if (!entryPoint.trim()) setEntryPoint(selectedPackage.relativePath);
    if (selectedPackage.kinds.includes('animation')) {
      setCategory('animation');
      setWorkspaceHints('animation,scene');
    } else if (selectedPackage.kinds.includes('script')) {
      setCategory('scripting');
      setWorkspaceHints('scripting,scene');
    } else if (selectedPackage.kinds.includes('texture')) {
      setCategory('materials');
      setWorkspaceHints('materials,scene');
    }
  }, [selectedPackage, name, description, entryPoint]);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const response = await fetch('/api/addons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePackagePath: selectedPackagePath !== 'manifest' ? selectedPackagePath : null,
          name,
          version,
          author,
          category,
          description,
          entryPoint,
          workspaceHints: parseCommaList(workspaceHints),
          dependencies: parseCommaList(dependencies),
          permissions,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'No se pudo instalar el addon');
      }

      toast({
        title: 'Addon instalado',
        description: `${payload.addon?.name || name} ya quedó disponible en el motor.`,
      });
      setName('');
      setDescription('');
      setEntryPoint('');
      setDependencies('');
      setSelectedPackagePath('manifest');
      await loadData();
    } catch (error) {
      toast({
        title: 'Fallo instalando addon',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setInstalling(false);
    }
  };

  const handleInstallTemplate = async (template: AddonTemplateDefinition) => {
    setInstallingTemplateId(template.id);
    try {
      const response = await fetch('/api/addons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: template.id,
          name: template.name,
          version: template.version,
          author: template.author,
          category: template.category,
          description: template.description,
          entryPoint: template.entryPoint,
          workspaceHints: template.workspaceHints,
          dependencies: template.dependencies,
          permissions: template.permissions,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'No se pudo instalar la plantilla');
      }

      toast({
        title: 'Plantilla instalada',
        description: `${template.name} ya quedó disponible como addon del motor.`,
      });
      await loadData();
    } catch (error) {
      toast({
        title: 'No se pudo instalar la plantilla',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setInstallingTemplateId(null);
    }
  };

  const handleToggle = async (addon: Addon, enabled: boolean) => {
    try {
      const response = await fetch('/api/addons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: addon.id, enabled }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'No se pudo actualizar el addon');
      }
      setAddons((current) =>
        current.map((item) => (item.id === addon.id ? payload.addon : item))
      );
    } catch (error) {
      toast({
        title: 'No se pudo actualizar',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (addon: Addon) => {
    try {
      const response = await fetch(`/api/addons?id=${encodeURIComponent(addon.id)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'No se pudo borrar el addon');
      }
      setAddons((current) => current.filter((item) => item.id !== addon.id));
      toast({
        title: 'Addon removido',
        description: `${addon.name} se quitó del motor.`,
      });
    } catch (error) {
      toast({
        title: 'No se pudo borrar',
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const togglePermission = (permission: AddonPermission) => {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission]
    );
  };

  const handleQuickAction = (addon: Addon, actionId: string) => {
    if (!addon.enabled) {
      toast({
        title: 'Activa el addon primero',
        description: `${addon.name} está desactivado.`,
        variant: 'destructive',
      });
      return;
    }

    const result = runAddonQuickAction({
      addon,
      actionId,
      selectedEntity,
    });

    if (!result.ok) {
      toast({
        title: 'No se pudo aplicar el pack',
        description: result.message,
        variant: 'destructive',
      });
      return;
    }

    if (result.createdEntity) {
      addEntity(result.createdEntity);
    }

    result.createdEntities?.forEach((entity) => addEntity(entity));

    if (selectedEntity && result.patch) {
      updateEntity(selectedEntity.id, result.patch);
    }

    if (result.selectEntityId) {
      selectEntity(result.selectEntityId, false);
    }

    toast({
      title: 'Pack aplicado',
      description: result.message,
    });
  };

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="border-b border-slate-800 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-cyan-300">
              <Puzzle className="h-4 w-4" />
              Addons
            </div>
            <h3 className="mt-1 text-sm font-semibold text-slate-100">Instalar funciones al motor</h3>
            <p className="mt-1 text-xs text-slate-500">
              Registra addons locales del motor para animation, materials, scripting u otros flujos.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
        </div>
        {storage ? <p className="mt-2 text-[11px] text-slate-500">{formatStorage(storage)}</p> : null}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          <Card className="border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs font-medium text-slate-100">Contexto actual</div>
            <p className="mt-1 text-[11px] text-slate-500">
              {selectedEntity
                ? `Selección activa: ${selectedEntity.name}. Los content packs pueden aplicarse directo sobre esta entidad o crear helpers nuevos cerca de ella.`
                : 'Puedes seleccionar una sola entidad para aplicar packs directos, o usar acciones que crean helpers nuevos sin selección previa.'}
            </p>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-100">
              <Boxes className="h-4 w-4 text-cyan-300" />
              Tooling base
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Addons de base para ampliar workspaces y flujos del motor sin escribir el manifest a mano.
            </p>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {TOOLING_TEMPLATES.map((template) => {
                const alreadyInstalled = installedAddonIds.has(template.id);
                const isInstallingTemplate = installingTemplateId === template.id;
                return (
                  <TemplateInstallCard
                    key={template.id}
                    template={template}
                    alreadyInstalled={alreadyInstalled}
                    isInstallingTemplate={isInstallingTemplate}
                    onInstall={(nextTemplate) => void handleInstallTemplate(nextTemplate)}
                  />
                );
              })}
            </div>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-100">
              <Boxes className="h-4 w-4 text-cyan-300" />
              Content packs
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Packs listos para instalar como contenido reusable del motor: materiales, VFX, animación base y ambientación.
            </p>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {CONTENT_PACK_TEMPLATES.map((template) => {
                const alreadyInstalled = installedAddonIds.has(template.id);
                const isInstallingTemplate = installingTemplateId === template.id;
                return (
                  <TemplateInstallCard
                    key={template.id}
                    template={template}
                    alreadyInstalled={alreadyInstalled}
                    isInstallingTemplate={isInstallingTemplate}
                    onInstall={(nextTemplate) => void handleInstallTemplate(nextTemplate)}
                  />
                );
              })}
            </div>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-100">
              <Plug className="h-4 w-4 text-cyan-300" />
              Instalar addon
            </div>
            <div className="mt-3 grid gap-2">
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Fuente</div>
                <Select value={selectedPackagePath} onValueChange={setSelectedPackagePath}>
                  <SelectTrigger className="w-full border-slate-700 bg-slate-950 text-xs text-slate-200">
                    <SelectValue placeholder="Manifest manual" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manifest">Manifest manual</SelectItem>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.relativePath} value={pkg.relativePath}>
                        {pkg.name} · {pkg.assetCount} assets
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedPackage ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-[11px] text-slate-400">
                  <div>package: {selectedPackage.relativePath}</div>
                  <div>kinds: {selectedPackage.kinds.join(', ') || 'sin kinds'}</div>
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre del addon" className="border-slate-700 bg-slate-950 text-xs" />
                <Input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1.0.0" className="border-slate-700 bg-slate-950 text-xs" />
                <Input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Autor" className="border-slate-700 bg-slate-950 text-xs" />
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full border-slate-700 bg-slate-950 text-xs text-slate-200">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe qué agrega este addon al motor."
                className="min-h-20 border-slate-700 bg-slate-950 text-xs"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={entryPoint} onChange={(event) => setEntryPoint(event.target.value)} placeholder="Entry point o package path" className="border-slate-700 bg-slate-950 text-xs" />
                <Input value={workspaceHints} onChange={(event) => setWorkspaceHints(event.target.value)} placeholder="scene,animation,scripting" className="border-slate-700 bg-slate-950 text-xs" />
                <Input value={dependencies} onChange={(event) => setDependencies(event.target.value)} placeholder="deps separadas por coma" className="border-slate-700 bg-slate-950 text-xs sm:col-span-2" />
              </div>
              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Permisos</div>
                <div className="flex flex-wrap gap-2">
                  {PERMISSION_OPTIONS.map((permission) => (
                    <Button
                      key={permission}
                      size="sm"
                      variant={permissions.includes(permission) ? 'secondary' : 'outline'}
                      className="h-7 text-[11px]"
                      onClick={() => togglePermission(permission)}
                    >
                      {permission}
                    </Button>
                  ))}
                </div>
              </div>
              <Button size="sm" onClick={() => void handleInstall()} disabled={installing}>
                <Boxes className="mr-1 h-3.5 w-3.5" />
                {installing ? 'Instalando...' : 'Instalar addon en el motor'}
              </Button>
            </div>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs font-medium text-slate-100">Addons instalados</div>
            <div className="mt-3 space-y-2">
              {addons.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-6 text-center text-xs text-slate-500">
                  Aún no hay addons instalados.
                </div>
              ) : (
                addons.map((addon) => (
                  <div key={addon.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-medium text-slate-100">{addon.name}</div>
                          <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                            {addon.version}
                          </Badge>
                          <Badge variant="outline" className="border-cyan-500/30 text-[10px] text-cyan-200">
                            {addon.category || 'general'}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-slate-400">{addon.description}</div>
                        <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                          <div>author: {addon.author}</div>
                          <div>entry: {addon.entryPoint}</div>
                          <div>workspaces: {addon.workspaceHints?.join(', ') || 'scene'}</div>
                          <div>package: {addon.sourcePackagePath || 'manifest manual'}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-3">
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>{addon.enabled ? 'Activo' : 'Desactivado'}</span>
                          <Switch
                            checked={Boolean(addon.enabled)}
                            onCheckedChange={(checked) => void handleToggle(addon, checked)}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => void handleDelete(addon)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Quitar
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(addon.permissions || []).map((permission) => (
                        <Badge key={`${addon.id}-${permission}`} variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                          {permission}
                        </Badge>
                      ))}
                    </div>
                    {getAddonQuickActions(addon).length > 0 ? (
                      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                        <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
                          Quick actions
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {getAddonQuickActions(addon).map((action) => (
                            <Button
                              key={`${addon.id}-${action.id}`}
                              size="sm"
                              variant="outline"
                              className="h-auto flex-col items-start gap-1 px-3 py-2 text-left"
                              onClick={() => handleQuickAction(addon, action.id)}
                              disabled={!addon.enabled || (action.requiresSelectedEntity && !selectedEntity)}
                            >
                              <span className="w-full text-[11px] font-medium">
                                {action.label}
                                {action.createsScenePack
                                  ? ' · escena'
                                  : action.createsEntity
                                    ? ' · crea helper'
                                    : ''}
                              </span>
                              <span className="w-full whitespace-normal text-[10px] text-slate-400">
                                {action.description}
                              </span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
