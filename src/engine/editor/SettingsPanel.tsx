'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bot,
  Box,
  BookOpen,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  RefreshCw,
  Save,
  Video,
  WifiOff,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  getAPIConfig,
  saveAPIConfig,
  type APIConfig,
  type CapabilityToggles,
  type CloudCapability,
} from '@/lib/api-config';
import {
  getUILanguageConfig,
  saveUILanguageConfig,
  type UILanguageConfig,
  type UILanguageScope,
} from '@/lib/ui-language-config';
import {
  getLocalAIConfig,
  saveLocalAIConfig,
  type LocalAIConfig,
  type LocalProviderId,
} from '@/lib/local-ai-config';
import {
  getEditorShortcutConfig,
  saveEditorShortcutConfig,
  type EditorShortcutConfig,
} from '@/lib/editor-shortcuts';
import { loadClientAuthSession } from '@/lib/client-auth-session';
import { cn } from '@/lib/utils';
import { useEngineStore } from '@/store/editorStore';
import { EditorShortcutSettings } from './EditorShortcutSettings';
import { UsageFinOpsPanel } from './UsageFinOpsPanel';
import { UsageGuideCopilotPanel } from './UsageGuideCopilotPanel';
import { MODE_AUTO_GUIDE, SCRIB_HYBRID_GUIDE, SQLITE_TO_SQL_PLAN } from './autoGuide';

type ProviderStatus = {
  ok: boolean;
  detail: string;
};

type ProviderStatusMap = Record<string, ProviderStatus>;

type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
};

type SessionPolicy = {
  localOwnerMode?: boolean;
  sharedAccess?: boolean;
  byok?: boolean;
  note?: string;
};

type SecretState = Record<'openai' | 'meshy' | 'runway' | 'ollama' | 'vllm' | 'llamacpp', boolean>;

type SecurityLogEntry = {
  id: string;
  action: string;
  target?: string | null;
  status: string;
  ipAddress?: string | null;
  createdAt: string;
  metadata?: string | null;
};

type ConfigPayload = {
  apiConfig?: APIConfig;
  localConfig?: LocalAIConfig;
  hasSecrets?: SecretState;
  providerStatuses?: ProviderStatusMap;
};

function SectionCard({
  title,
  description,
  icon: Icon,
  status,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  status?: ProviderStatus;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 rounded-md bg-slate-800 p-2 text-slate-300">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-100">{title}</h3>
            <p className="text-xs text-slate-400">{description}</p>
          </div>
        </div>
        {status && (
          <div
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-1 text-[11px]',
              status.ok
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'bg-amber-500/10 text-amber-300'
            )}
          >
        {status.ok ? <CheckCircle2 className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        <span>{status.detail}</span>
      </div>
    )}
  </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function NativeSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="flex h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-blue-500"
    >
      {children}
    </select>
  );
}

function CapabilityRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2">
      <span className="text-xs text-slate-300">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function PermissionRow({
  label,
  allowed,
  requireConfirm,
  onAllowedChange,
  onConfirmChange,
}: {
  label: string;
  allowed: boolean;
  requireConfirm: boolean;
  onAllowedChange: (value: boolean) => void;
  onConfirmChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="text-xs text-slate-300">{label}</div>
      <div className="flex items-center gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <span>Permitir</span>
          <Switch checked={allowed} onCheckedChange={onAllowedChange} />
        </span>
        <span className="flex items-center gap-1">
          <span>Confirmar</span>
          <Switch checked={requireConfirm} onCheckedChange={onConfirmChange} disabled={!allowed} />
        </span>
      </div>
    </div>
  );
}

function withoutCloudSecrets(config: APIConfig): APIConfig {
  return {
    ...config,
    openai: { ...config.openai, apiKey: '' },
    meshy: { ...config.meshy, apiKey: '' },
    runway: { ...config.runway, apiKey: '' },
  };
}

function withoutLocalSecrets(config: LocalAIConfig): LocalAIConfig {
  return {
    ...config,
    ollama: { ...config.ollama, apiKey: '' },
    vllm: { ...config.vllm, apiKey: '' },
    llamacpp: { ...config.llamacpp, apiKey: '' },
  };
}

export function SettingsPanel() {
  const [activeSettingsTab, setActiveSettingsTab] = useState('account');
  const [apiConfig, setApiConfig] = useState<APIConfig>(() => getAPIConfig());
  const [localConfig, setLocalConfig] = useState<LocalAIConfig>(() => getLocalAIConfig());
  const [shortcutConfig, setShortcutConfig] = useState<EditorShortcutConfig>(() => getEditorShortcutConfig());
  const [uiLanguageConfig, setUiLanguageConfig] = useState<UILanguageConfig>(() => getUILanguageConfig());
  const [statuses, setStatuses] = useState<ProviderStatusMap>({});
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [permState, setPermState] = useState(() => useEngineStore.getState().automationPermissions);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [sessionAccessMode, setSessionAccessMode] = useState<'user_session' | 'shared_token' | null>(null);
  const [sessionPolicy, setSessionPolicy] = useState<SessionPolicy | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'token'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authInviteToken, setAuthInviteToken] = useState('');
  const [authAccessToken, setAuthAccessToken] = useState('');
  const [authError, setAuthError] = useState('');
  const [hasSecrets, setHasSecrets] = useState<SecretState>({
    openai: false,
    meshy: false,
    runway: false,
    ollama: false,
    vllm: false,
    llamacpp: false,
  });
  const [securityLogs, setSecurityLogs] = useState<SecurityLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const engineMode = useEngineStore((state) => state.engineMode);
  const modeGuide = MODE_AUTO_GUIDE[engineMode];

  const syncSessionAndConfig = async () => {
    setAuthLoading(true);
    setAuthError('');

    try {
      const sessionData = await loadClientAuthSession({ forceRefresh: true, maxAgeMs: 0 });

      if (!sessionData?.authenticated) {
        setSessionUser(null);
        setSessionAccessMode(null);
        setSessionPolicy(null);
        setApiConfig(getAPIConfig());
        setLocalConfig(getLocalAIConfig());
        setStatuses({});
        setAuthLoading(false);
        return;
      }

      setSessionUser(sessionData.user as SessionUser);
      setSessionAccessMode(
        sessionData.accessMode === 'shared_token' ? 'shared_token' : 'user_session'
      );
      setSessionPolicy((sessionData.policy as SessionPolicy | undefined) || null);
      const cfgRes = await fetch('/api/user/api-config');
      const cfg = (await cfgRes.json().catch(() => ({}))) as ConfigPayload;
      if (cfgRes.ok && cfg?.apiConfig && cfg?.localConfig) {
        setApiConfig(cfg.apiConfig as APIConfig);
        setLocalConfig(cfg.localConfig as LocalAIConfig);
        if (cfg.hasSecrets) {
          setHasSecrets(cfg.hasSecrets as SecretState);
        }
        if (cfg.providerStatuses) {
          setStatuses(cfg.providerStatuses);
        }
        saveAPIConfig(withoutCloudSecrets(cfg.apiConfig as APIConfig));
        saveLocalAIConfig(withoutLocalSecrets(cfg.localConfig as LocalAIConfig));
      } else {
        setApiConfig(getAPIConfig());
        setLocalConfig(getLocalAIConfig());
        setStatuses({});
      }
    } catch (error) {
      setAuthError(`No se pudo cargar sesión/configuración: ${String(error)}`);
      setSessionUser(null);
      setSessionAccessMode(null);
      setSessionPolicy(null);
      setApiConfig(getAPIConfig());
      setLocalConfig(getLocalAIConfig());
      setStatuses({});
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    void syncSessionAndConfig();
  }, []);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1800);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const toggleSecret = (key: string) => {
    setShowKeys((current) => ({ ...current, [key]: !current[key] }));
  };

  const setPermission = (action: string, field: 'allowed' | 'requireConfirm', value: boolean) => {
    setPermState((current) => ({
      ...current,
      [action]: {
        ...current[action],
        [field]: value,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const updateCloudCapabilities = (
    provider: 'openai' | 'meshy' | 'runway',
    capability: CloudCapability,
    checked: boolean
  ) => {
    setApiConfig((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        capabilities: {
          ...current[provider].capabilities,
          [capability]: checked,
        } as CapabilityToggles,
      },
    }));
  };

  const updateOpenAI = (field: keyof APIConfig['openai'], value: string | boolean) => {
    setApiConfig((current) => ({
      ...current,
      openai: {
        ...current.openai,
        [field]: value,
      },
    }));
  };

  const updateMeshy = (field: keyof APIConfig['meshy'], value: string | boolean | number) => {
    setApiConfig((current) => ({
      ...current,
      meshy: {
        ...current.meshy,
        [field]: value,
      },
    }));
  };

  const updateRunway = (field: keyof APIConfig['runway'], value: string | boolean | number) => {
    setApiConfig((current) => ({
      ...current,
      runway: {
        ...current.runway,
        [field]: value,
      },
    }));
  };

  const updateLocalProvider = (
    provider: LocalProviderId,
    field: string,
    value: string | boolean | number
  ) => {
    setLocalConfig((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        [field]: value,
      },
    }));
  };

  const handleAuthSubmit = async () => {
    setAuthError('');
    const endpoint =
      authMode === 'login'
        ? '/api/auth/login'
        : authMode === 'register'
          ? '/api/auth/register'
          : '/api/auth/token';
    const payload =
      authMode === 'login'
        ? { email: authEmail, password: authPassword }
        : authMode === 'register'
          ? { email: authEmail, password: authPassword, name: authName, inviteToken: authInviteToken }
          : { token: authAccessToken };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthError(data?.error || 'No se pudo autenticar la cuenta.');
        return;
      }
      setAuthPassword('');
      setAuthInviteToken('');
      setAuthAccessToken('');
      await syncSessionAndConfig();
    } catch (error) {
      setAuthError(`Error de autenticación: ${String(error)}`);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSessionUser(null);
    setSessionAccessMode(null);
    setSessionPolicy(null);
    setHasSecrets({
      openai: false,
      meshy: false,
      runway: false,
      ollama: false,
      vllm: false,
      llamacpp: false,
    });
    setSecurityLogs([]);
    setStatuses({});
    setApiConfig(getAPIConfig());
    setLocalConfig(getLocalAIConfig());
  };

  const loadSecurityLogs = async () => {
    if (!sessionUser || (sessionUser.role !== 'OWNER' && sessionUser.role !== 'EDITOR')) return;
    setLoadingLogs(true);
    try {
      const response = await fetch('/api/user/security-logs');
      const data = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(data.logs)) {
        setSecurityLogs(data.logs as SecurityLogEntry[]);
      }
    } finally {
      setLoadingLogs(false);
    }
  };

  const saveAll = async () => {
    const safeCloud = withoutCloudSecrets(apiConfig);
    const safeLocal = withoutLocalSecrets(localConfig);

    saveAPIConfig(safeCloud);
    saveLocalAIConfig(safeLocal);
    saveEditorShortcutConfig(shortcutConfig);
    saveUILanguageConfig({
      ...uiLanguageConfig,
      updatedAt: new Date().toISOString(),
    });
    useEngineStore.setState({ automationPermissions: permState, isDirty: true });

    if (sessionUser) {
      const response = await fetch('/api/user/api-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiConfig,
          localConfig,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthError(data?.error || 'No se pudo guardar la configuración en servidor.');
        return;
      }
      if (data?.hasSecrets) {
        setHasSecrets(data.hasSecrets as SecretState);
      }
      if (data?.providerStatuses) {
        setStatuses(data.providerStatuses as ProviderStatusMap);
      }
      setApiConfig((data?.apiConfig as APIConfig) || apiConfig);
      setLocalConfig((data?.localConfig as LocalAIConfig) || localConfig);
    }

    setSaved(true);
  };

  const checkProviders = async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/user/api-config', { cache: 'no-store' });
      const data = (await response.json().catch(() => ({}))) as ConfigPayload;
      if (!response.ok) {
        setAuthError('No se pudo actualizar el estado de servicios.');
        return;
      }
      if (data.providerStatuses) {
        setStatuses(data.providerStatuses);
      }
    } catch {
      setAuthError('No se pudo actualizar el estado de servicios.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div>
          <h2 className="text-sm font-medium text-slate-100">Usuario / Config APIs</h2>
          <p className="text-xs text-slate-400">
            BYOK por cuenta. Cada usuario administra sus APIs y asume su propio costo/uso.
          </p>
          <p className="text-[11px] text-cyan-300 mt-1">
            {sessionUser
              ? `Sesión activa: ${sessionUser.email} (${sessionUser.role})`
              : authLoading
                ? 'Cargando sesión...'
                : 'Sin sesión activa'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={checkProviders} disabled={checking}>
            <RefreshCw className={cn('mr-1 h-3 w-3', checking && 'animate-spin')} />
            Actualizar estado
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveSettingsTab('guide')}
            data-testid="settings-usage-guide-button"
          >
            <BookOpen className="mr-1 h-3 w-3" />
            Guia de uso
          </Button>
          <Button size="sm" onClick={() => void saveAll()} disabled={authLoading}>
            {saved ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Save className="mr-1 h-3 w-3" />}
            {saved ? 'Guardado' : 'Guardar'}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          <Tabs value={activeSettingsTab} onValueChange={setActiveSettingsTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-8 bg-slate-900">
              <TabsTrigger value="account">Usuario</TabsTrigger>
              <TabsTrigger value="guide">Guia IA</TabsTrigger>
              <TabsTrigger value="usage">Uso/Costos</TabsTrigger>
              <TabsTrigger value="cloud">Cloud</TabsTrigger>
              <TabsTrigger value="local">Local</TabsTrigger>
              <TabsTrigger value="routing">Routing</TabsTrigger>
              <TabsTrigger value="shortcuts">Atajos</TabsTrigger>
              <TabsTrigger value="permissions">Permisos IA</TabsTrigger>
            </TabsList>

            <TabsContent value="account" className="space-y-4">
              <SectionCard
                title="Cuenta y seguridad"
                description="Autenticación requerida para guardar claves cifradas por usuario."
                icon={ShieldCheck}
              >
                {sessionUser ? (
                  <div className="space-y-3">
                    <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                      <div>Usuario: <span className="text-slate-100">{sessionUser.email}</span></div>
                      <div>Rol: <span className="text-cyan-300">{sessionUser.role}</span></div>
                      <div>
                        Acceso:{' '}
                        <span className="text-cyan-300">
                          {sessionPolicy?.localOwnerMode
                            ? 'owner local automático'
                            : sessionAccessMode === 'shared_token'
                              ? 'token compartido'
                              : 'sesión de usuario'}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {sessionPolicy?.localOwnerMode
                          ? 'Este perfil local entra sin email ni password y conserva el camino de deploy remoto para más adelante.'
                          : sessionAccessMode === 'shared_token'
                          ? 'Esta sesión usa credenciales compartidas del servidor para OpenAI y Meshy con permisos de colaborador.'
                          : 'Tus credenciales API se cifran en servidor y nunca se guardan en localStorage.'}
                      </div>
                    </div>
                    {sessionPolicy?.localOwnerMode && (
                      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-200">
                        Modo local single-user activo. Si en el futuro haces deploy o compartes una instancia remota,
                        puedes apagar este perfil con `REY30_LOCAL_OWNER_MODE=false`.
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-slate-300">
                        OpenAI key: {hasSecrets.openai ? 'guardada' : 'no guardada'}
                      </div>
                      <div className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-slate-300">
                        Meshy key: {hasSecrets.meshy ? 'guardada' : 'no guardada'}
                      </div>
                      <div className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-slate-300">
                        Runway key: {hasSecrets.runway ? 'guardada' : 'no guardada'}
                      </div>
                      <div className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-slate-300">
                        Local keys: {(hasSecrets.ollama || hasSecrets.vllm || hasSecrets.llamacpp) ? 'hay claves guardadas' : 'sin claves'}
                      </div>
                    </div>
                    {(sessionUser.role === 'OWNER' || sessionUser.role === 'EDITOR') && (
                      <div className="space-y-2">
                        <Button size="sm" variant="outline" onClick={() => void loadSecurityLogs()} disabled={loadingLogs}>
                          <RefreshCw className={cn('mr-1 h-3 w-3', loadingLogs && 'animate-spin')} />
                          Cargar logs de seguridad
                        </Button>
                        {securityLogs.length > 0 && (
                          <div className="max-h-40 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/70 p-2 space-y-1">
                            {securityLogs.slice(0, 20).map((log) => (
                              <div key={log.id} className="text-[11px] text-slate-300">
                                [{new Date(log.createdAt).toLocaleString()}] {log.action} - {log.status}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {!sessionPolicy?.localOwnerMode && (
                      <Button size="sm" variant="outline" onClick={() => void handleLogout()}>
                        Cerrar sesión
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={authMode === 'login' ? 'secondary' : 'outline'}
                        onClick={() => setAuthMode('login')}
                      >
                        Iniciar sesión
                      </Button>
                      <Button
                        size="sm"
                        variant={authMode === 'register' ? 'secondary' : 'outline'}
                        onClick={() => setAuthMode('register')}
                      >
                        Crear cuenta
                      </Button>
                      <Button
                        size="sm"
                        variant={authMode === 'token' ? 'secondary' : 'outline'}
                        onClick={() => setAuthMode('token')}
                      >
                        Token de acceso
                      </Button>
                    </div>
                    {authMode === 'token' && (
                      <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-2 text-[11px] text-cyan-200">
                        Pega el token compartido para entrar sin crear cuenta ni usar login clásico.
                      </div>
                    )}
                    {authMode === 'register' && (
                      <Field label="Nombre">
                        <Input value={authName} onChange={(event) => setAuthName(event.target.value)} className="bg-slate-950 border-slate-700" />
                      </Field>
                    )}
                    {authMode === 'register' && (
                      <Field label="Token de invitación (opcional)">
                        <Input value={authInviteToken} onChange={(event) => setAuthInviteToken(event.target.value)} className="bg-slate-950 border-slate-700" />
                      </Field>
                    )}
                    {authMode === 'register' && (
                      <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-2 text-[11px] text-cyan-200">
                        En entorno local/dev, la cuenta nueva inicia con rol OWNER (permisos completos).
                      </div>
                    )}
                    {authMode === 'token' ? (
                      <Field label="Token de acceso">
                        <Input
                          type="password"
                          value={authAccessToken}
                          onChange={(event) => setAuthAccessToken(event.target.value)}
                          className="bg-slate-950 border-slate-700"
                        />
                      </Field>
                    ) : (
                      <>
                        <Field label="Email">
                          <Input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} className="bg-slate-950 border-slate-700" />
                        </Field>
                        <Field label="Contraseña">
                          <Input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} className="bg-slate-950 border-slate-700" />
                        </Field>
                      </>
                    )}
                    {authError && (
                      <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">
                        {authError}
                      </div>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => void handleAuthSubmit()}>
                      {authMode === 'login'
                        ? 'Entrar'
                        : authMode === 'register'
                          ? 'Registrar'
                          : 'Entrar con token'}
                    </Button>
                  </div>
                )}
              </SectionCard>
            </TabsContent>

            <TabsContent value="guide" className="space-y-4">
              <UsageGuideCopilotPanel engineMode={engineMode} modeGuide={modeGuide} />

              <SectionCard
                title="Auto-guiado por entorno"
                description="El sistema adapta el paso a paso según el modo activo (Manual, Híbrido o AI First)."
                icon={Bot}
              >
                <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 p-3">
                  <div className="text-xs text-cyan-100">
                    <span className="font-semibold">{modeGuide.title}</span>
                    <span className="ml-2 text-cyan-300">({engineMode})</span>
                  </div>
                  <p className="mt-1 text-[11px] text-cyan-200">{modeGuide.objective}</p>
                </div>

                <div className="grid gap-2">
                  {modeGuide.steps.map((step) => (
                    <div key={step} className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                      {step}
                    </div>
                  ))}
                </div>

                <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-xs text-slate-200">Copilot tips</p>
                  <div className="mt-2 space-y-1 text-[11px] text-slate-400">
                    {modeGuide.copilotTips.map((tip) => (
                      <p key={tip}>• {tip}</p>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Guía Scrib (modo híbrido)"
                description="Dónde poner el script, lenguaje sugerido y para qué usar cada tipo."
                icon={KeyRound}
              >
                <div className="space-y-2">
                  {SCRIB_HYBRID_GUIDE.map((item) => (
                    <div key={`${item.target}:${item.path}`} className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-100">{item.target}</p>
                        <p className="text-[11px] text-cyan-300">{item.suggestedType}</p>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-300">Path: <span className="text-slate-100">{item.path}</span></p>
                      <p className="text-[11px] text-slate-300">Lenguaje: <span className="text-slate-100">{item.language}</span></p>
                      <p className="text-[11px] text-slate-500">{item.useCase}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                title="Idioma y cuestionario"
                description="Al elegir Español puedes decidir si traducir todo, solo botones/acciones o solo nombres."
                icon={Cloud}
              >
                <div className="grid gap-3">
                  <Field label="Idioma objetivo">
                    <NativeSelect
                      value={uiLanguageConfig.language}
                      onChange={(value) =>
                        setUiLanguageConfig((current) => ({
                          ...current,
                          language: value as UILanguageConfig['language'],
                        }))
                      }
                    >
                      <option value="spanish">Español</option>
                      <option value="english">English</option>
                      <option value="auto">Auto (navegador)</option>
                    </NativeSelect>
                  </Field>

                  {uiLanguageConfig.language === 'spanish' && (
                    <Field label="¿Qué quieres traducir?">
                      <NativeSelect
                        value={uiLanguageConfig.scope}
                        onChange={(value) =>
                          setUiLanguageConfig((current) => ({
                            ...current,
                            scope: value as UILanguageScope,
                            translateButtons: value === 'all' || value === 'buttons_actions',
                            translateActions: value === 'all' || value === 'buttons_actions',
                            translateNames: value === 'all' || value === 'names_only',
                          }))
                        }
                      >
                        <option value="all">Todo (UI completa + nombres + acciones)</option>
                        <option value="buttons_actions">Solo botones y acciones</option>
                        <option value="names_only">Solo nombres (escena/entidades/assets)</option>
                        <option value="labels_only">Solo etiquetas y textos descriptivos</option>
                      </NativeSelect>
                    </Field>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <CapabilityRow
                      label="Traducir botones"
                      checked={uiLanguageConfig.translateButtons}
                      onCheckedChange={(value) =>
                        setUiLanguageConfig((current) => ({ ...current, translateButtons: value }))
                      }
                    />
                    <CapabilityRow
                      label="Traducir acciones"
                      checked={uiLanguageConfig.translateActions}
                      onCheckedChange={(value) =>
                        setUiLanguageConfig((current) => ({ ...current, translateActions: value }))
                      }
                    />
                    <CapabilityRow
                      label="Traducir nombres"
                      checked={uiLanguageConfig.translateNames}
                      onCheckedChange={(value) =>
                        setUiLanguageConfig((current) => ({ ...current, translateNames: value }))
                      }
                    />
                    <CapabilityRow
                      label="Traducir términos técnicos"
                      checked={uiLanguageConfig.translateTechnicalTerms}
                      onCheckedChange={(value) =>
                        setUiLanguageConfig((current) => ({ ...current, translateTechnicalTerms: value }))
                      }
                    />
                  </div>

                  <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                    <p>Resumen:</p>
                    <p className="mt-1 text-slate-400">
                      Idioma: <span className="text-slate-100">{uiLanguageConfig.language}</span> | Alcance:{' '}
                      <span className="text-slate-100">{uiLanguageConfig.scope}</span> | Botones:{' '}
                      <span className="text-slate-100">{uiLanguageConfig.translateButtons ? 'sí' : 'no'}</span> | Acciones:{' '}
                      <span className="text-slate-100">{uiLanguageConfig.translateActions ? 'sí' : 'no'}</span> | Nombres:{' '}
                      <span className="text-slate-100">{uiLanguageConfig.translateNames ? 'sí' : 'no'}</span>
                    </p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="SQLite -> SQL (evaluación)"
                description="Análisis de impacto por si decides migrar más adelante."
                icon={HardDrive}
              >
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <p className="text-amber-200">Nivel de desmadre estimado: {SQLITE_TO_SQL_PLAN.level.toUpperCase()}</p>
                  <p className="mt-1 text-amber-300">{SQLITE_TO_SQL_PLAN.estimate}</p>
                </div>
                <div className="space-y-1 text-[11px] text-slate-300">
                  {SQLITE_TO_SQL_PLAN.notes.map((note) => (
                    <p key={note}>• {note}</p>
                  ))}
                </div>
                <div className="space-y-1 rounded-md border border-slate-800 bg-slate-950/70 p-3 text-[11px] text-slate-400">
                  {SQLITE_TO_SQL_PLAN.phases.map((phase) => (
                    <p key={phase}>{phase}</p>
                  ))}
                </div>
              </SectionCard>
            </TabsContent>

            <TabsContent value="usage" className="space-y-4">
              <UsageFinOpsPanel sessionUser={sessionUser} authLoading={authLoading} />
            </TabsContent>

            <TabsContent value="cloud" className="space-y-4">
              <SectionCard
                title="OpenAI"
                description="Chat, multimodal, imagen y video desde una sola cuenta."
                icon={Cloud}
                status={statuses.openai}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Activado">
                    <div className="flex h-9 items-center justify-between rounded-md border border-slate-700 bg-slate-950 px-3">
                      <span className="text-xs text-slate-300">Usar OpenAI</span>
                      <Switch checked={apiConfig.openai.enabled} onCheckedChange={(value) => updateOpenAI('enabled', value)} />
                    </div>
                  </Field>
                  <Field label="API Key">
                    <div className="flex gap-2">
                      <Input
                        type={showKeys.openai ? 'text' : 'password'}
                        value={apiConfig.openai.apiKey}
                        onChange={(event) => updateOpenAI('apiKey', event.target.value)}
                        placeholder={hasSecrets.openai ? 'Guardada en servidor (escribe para reemplazar)' : 'Ingresa tu API key'}
                        className="bg-slate-950 border-slate-700"
                      />
                      <Button size="icon" variant="outline" onClick={() => toggleSecret('openai')}>
                        {showKeys.openai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </Field>
                  <Field label="Base URL">
                    <Input value={apiConfig.openai.baseUrl} onChange={(event) => updateOpenAI('baseUrl', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Modelo chat">
                    <Input value={apiConfig.openai.textModel} onChange={(event) => updateOpenAI('textModel', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Modelo multimodal">
                    <Input value={apiConfig.openai.multimodalModel} onChange={(event) => updateOpenAI('multimodalModel', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Modelo imagen">
                    <Input value={apiConfig.openai.imageModel} onChange={(event) => updateOpenAI('imageModel', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Modelo video">
                    <Input value={apiConfig.openai.videoModel} onChange={(event) => updateOpenAI('videoModel', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Tamano imagen">
                    <Input value={apiConfig.openai.imageSize} onChange={(event) => updateOpenAI('imageSize', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CapabilityRow label="Chat" checked={apiConfig.openai.capabilities.chat} onCheckedChange={(value) => updateCloudCapabilities('openai', 'chat', value)} />
                  <CapabilityRow label="Multimodal" checked={apiConfig.openai.capabilities.multimodal} onCheckedChange={(value) => updateCloudCapabilities('openai', 'multimodal', value)} />
                  <CapabilityRow label="Imagen" checked={apiConfig.openai.capabilities.image} onCheckedChange={(value) => updateCloudCapabilities('openai', 'image', value)} />
                  <CapabilityRow label="Video" checked={apiConfig.openai.capabilities.video} onCheckedChange={(value) => updateCloudCapabilities('openai', 'video', value)} />
                </div>
              </SectionCard>

              <SectionCard
                title="Meshy"
                description="Generación 3D para props, personajes y objetos listos para juego."
                icon={Box}
                status={statuses.meshy}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Activado">
                    <div className="flex h-9 items-center justify-between rounded-md border border-slate-700 bg-slate-950 px-3">
                      <span className="text-xs text-slate-300">Usar Meshy</span>
                      <Switch checked={apiConfig.meshy.enabled} onCheckedChange={(value) => updateMeshy('enabled', value)} />
                    </div>
                  </Field>
                  <Field label="API Key">
                    <div className="flex gap-2">
                      <Input
                        type={showKeys.meshy ? 'text' : 'password'}
                        value={apiConfig.meshy.apiKey}
                        onChange={(event) => updateMeshy('apiKey', event.target.value)}
                        placeholder={hasSecrets.meshy ? 'Guardada en servidor (escribe para reemplazar)' : 'Ingresa tu API key'}
                        className="bg-slate-950 border-slate-700"
                      />
                      <Button size="icon" variant="outline" onClick={() => toggleSecret('meshy')}>
                        {showKeys.meshy ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </Field>
                  <Field label="Base URL">
                    <Input value={apiConfig.meshy.baseUrl} onChange={(event) => updateMeshy('baseUrl', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Estilo por defecto">
                    <NativeSelect value={apiConfig.meshy.defaultArtStyle} onChange={(value) => updateMeshy('defaultArtStyle', value)}>
                      <option value="lowpoly">Low poly</option>
                      <option value="realistic">Realista</option>
                      <option value="cartoon">Cartoon</option>
                      <option value="voxel">Voxel</option>
                      <option value="anime">Anime</option>
                    </NativeSelect>
                  </Field>
                  <Field label="Topologia">
                    <NativeSelect value={apiConfig.meshy.defaultTopology} onChange={(value) => updateMeshy('defaultTopology', value)}>
                      <option value="triangle">Triangle</option>
                      <option value="quad">Quad</option>
                    </NativeSelect>
                  </Field>
                  <Field label="Faces objetivo">
                    <Input type="number" value={String(apiConfig.meshy.targetFaceCount)} onChange={(event) => updateMeshy('targetFaceCount', Number(event.target.value) || 0)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="PBR">
                    <div className="flex h-9 items-center justify-between rounded-md border border-slate-700 bg-slate-950 px-3">
                      <span className="text-xs text-slate-300">Activar materiales PBR</span>
                      <Switch checked={apiConfig.meshy.enablePbr} onCheckedChange={(value) => updateMeshy('enablePbr', value)} />
                    </div>
                  </Field>
                </div>
                <CapabilityRow label="Generacion 3D" checked={apiConfig.meshy.capabilities.threeD} onCheckedChange={(value) => updateCloudCapabilities('meshy', 'threeD', value)} />
              </SectionCard>

              <SectionCard
                title="Runway"
                description="Texto o imagen a video para trailers, cutscenes y pruebas rápidas."
                icon={Video}
                status={statuses.runway}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Activado">
                    <div className="flex h-9 items-center justify-between rounded-md border border-slate-700 bg-slate-950 px-3">
                      <span className="text-xs text-slate-300">Usar Runway</span>
                      <Switch checked={apiConfig.runway.enabled} onCheckedChange={(value) => updateRunway('enabled', value)} />
                    </div>
                  </Field>
                  <Field label="API Key">
                    <div className="flex gap-2">
                      <Input
                        type={showKeys.runway ? 'text' : 'password'}
                        value={apiConfig.runway.apiKey}
                        onChange={(event) => updateRunway('apiKey', event.target.value)}
                        placeholder={hasSecrets.runway ? 'Guardada en servidor (escribe para reemplazar)' : 'Ingresa tu API key'}
                        className="bg-slate-950 border-slate-700"
                      />
                      <Button size="icon" variant="outline" onClick={() => toggleSecret('runway')}>
                        {showKeys.runway ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </Field>
                  <Field label="Base URL">
                    <Input value={apiConfig.runway.baseUrl} onChange={(event) => updateRunway('baseUrl', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Version API">
                    <Input value={apiConfig.runway.apiVersion} onChange={(event) => updateRunway('apiVersion', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Modelo text-to-video">
                    <Input value={apiConfig.runway.textToVideoModel} onChange={(event) => updateRunway('textToVideoModel', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Modelo image-to-video">
                    <Input value={apiConfig.runway.imageToVideoModel} onChange={(event) => updateRunway('imageToVideoModel', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Duracion">
                    <Input type="number" value={String(apiConfig.runway.duration)} onChange={(event) => updateRunway('duration', Number(event.target.value) || 5)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Ratio">
                    <Input value={apiConfig.runway.ratio} onChange={(event) => updateRunway('ratio', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                </div>
                <CapabilityRow label="Generacion de video" checked={apiConfig.runway.capabilities.video} onCheckedChange={(value) => updateCloudCapabilities('runway', 'video', value)} />
              </SectionCard>
            </TabsContent>

            <TabsContent value="local" className="space-y-4">
              <SectionCard
                title="Routing local"
                description="Proveedor local preferido cuando el chat usa modo local."
                icon={HardDrive}
              >
                <Field label="Proveedor de chat local">
                  <NativeSelect
                    value={localConfig.routing.chat}
                    onChange={(value) =>
                      setLocalConfig((current) => ({
                        ...current,
                        routing: { chat: value as LocalProviderId },
                      }))
                    }
                  >
                    <option value="ollama">Ollama</option>
                    <option value="vllm">vLLM</option>
                    <option value="llamacpp">llama.cpp</option>
                  </NativeSelect>
                </Field>
              </SectionCard>

              <SectionCard title="Ollama" description="LLM local sencillo para chat y pruebas rápidas." icon={Bot} status={statuses.ollama}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Activado">
                    <div className="flex h-9 items-center justify-between rounded-md border border-slate-700 bg-slate-950 px-3">
                      <span className="text-xs text-slate-300">Usar Ollama</span>
                      <Switch checked={localConfig.ollama.enabled} onCheckedChange={(value) => updateLocalProvider('ollama', 'enabled', value)} />
                    </div>
                  </Field>
                  <Field label="Base URL">
                    <Input value={localConfig.ollama.baseUrl} onChange={(event) => updateLocalProvider('ollama', 'baseUrl', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Modelo">
                    <Input value={localConfig.ollama.model} onChange={(event) => updateLocalProvider('ollama', 'model', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="API Key opcional">
                    <div className="flex gap-2">
                      <Input
                        type={showKeys.ollama ? 'text' : 'password'}
                        value={localConfig.ollama.apiKey || ''}
                        onChange={(event) => updateLocalProvider('ollama', 'apiKey', event.target.value)}
                        placeholder={hasSecrets.ollama ? 'Guardada en servidor (escribe para reemplazar)' : 'opcional'}
                        className="bg-slate-950 border-slate-700"
                      />
                      <Button size="icon" variant="outline" onClick={() => toggleSecret('ollama')}>
                        {showKeys.ollama ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </Field>
                </div>
              </SectionCard>

              <SectionCard title="vLLM" description="Servidor OpenAI-compatible para modelos locales de mayor escala." icon={HardDrive} status={statuses.vllm}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Activado">
                    <div className="flex h-9 items-center justify-between rounded-md border border-slate-700 bg-slate-950 px-3">
                      <span className="text-xs text-slate-300">Usar vLLM</span>
                      <Switch checked={localConfig.vllm.enabled} onCheckedChange={(value) => updateLocalProvider('vllm', 'enabled', value)} />
                    </div>
                  </Field>
                  <Field label="Base URL">
                    <Input value={localConfig.vllm.baseUrl} onChange={(event) => updateLocalProvider('vllm', 'baseUrl', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Modelo">
                    <Input value={localConfig.vllm.model} onChange={(event) => updateLocalProvider('vllm', 'model', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="API Key opcional">
                    <div className="flex gap-2">
                      <Input
                        type={showKeys.vllm ? 'text' : 'password'}
                        value={localConfig.vllm.apiKey || ''}
                        onChange={(event) => updateLocalProvider('vllm', 'apiKey', event.target.value)}
                        placeholder={hasSecrets.vllm ? 'Guardada en servidor (escribe para reemplazar)' : 'opcional'}
                        className="bg-slate-950 border-slate-700"
                      />
                      <Button size="icon" variant="outline" onClick={() => toggleSecret('vllm')}>
                        {showKeys.vllm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </Field>
                </div>
              </SectionCard>

              <SectionCard title="llama.cpp" description="Backend ligero para modelos GGUF y ejecución local embebida." icon={HardDrive} status={statuses.llamacpp}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Activado">
                    <div className="flex h-9 items-center justify-between rounded-md border border-slate-700 bg-slate-950 px-3">
                      <span className="text-xs text-slate-300">Usar llama.cpp</span>
                      <Switch checked={localConfig.llamacpp.enabled} onCheckedChange={(value) => updateLocalProvider('llamacpp', 'enabled', value)} />
                    </div>
                  </Field>
                  <Field label="Base URL">
                    <Input value={localConfig.llamacpp.baseUrl} onChange={(event) => updateLocalProvider('llamacpp', 'baseUrl', event.target.value)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="Context size">
                    <Input type="number" value={String(localConfig.llamacpp.contextSize)} onChange={(event) => updateLocalProvider('llamacpp', 'contextSize', Number(event.target.value) || 4096)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="GPU layers">
                    <Input type="number" value={String(localConfig.llamacpp.gpuLayers)} onChange={(event) => updateLocalProvider('llamacpp', 'gpuLayers', Number(event.target.value) || 0)} className="bg-slate-950 border-slate-700" />
                  </Field>
                  <Field label="API Key opcional">
                    <div className="flex gap-2">
                      <Input
                        type={showKeys.llamacpp ? 'text' : 'password'}
                        value={localConfig.llamacpp.apiKey || ''}
                        onChange={(event) => updateLocalProvider('llamacpp', 'apiKey', event.target.value)}
                        placeholder={hasSecrets.llamacpp ? 'Guardada en servidor (escribe para reemplazar)' : 'opcional'}
                        className="bg-slate-950 border-slate-700"
                      />
                      <Button size="icon" variant="outline" onClick={() => toggleSecret('llamacpp')}>
                        {showKeys.llamacpp ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </Field>
                </div>
              </SectionCard>
            </TabsContent>

            <TabsContent value="routing" className="space-y-4">
              <SectionCard title="Enrutamiento del motor" description="Elige qué backend atiende cada capacidad del editor." icon={KeyRound}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Chat">
                    <NativeSelect
                      value={apiConfig.routing.chat}
                      onChange={(value) =>
                        setApiConfig((current) => ({
                          ...current,
                          routing: { ...current.routing, chat: value as APIConfig['routing']['chat'] },
                        }))
                      }
                    >
                      <option value="openai">OpenAI API</option>
                      <option value="local">Local LLM</option>
                    </NativeSelect>
                  </Field>
                  <Field label="Video">
                    <NativeSelect
                      value={apiConfig.routing.video}
                      onChange={(value) =>
                        setApiConfig((current) => ({
                          ...current,
                          routing: { ...current.routing, video: value as APIConfig['routing']['video'] },
                        }))
                      }
                    >
                      <option value="runway">Runway</option>
                      <option value="openai">OpenAI Video</option>
                    </NativeSelect>
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                  <div>Chat: <span className="text-blue-300">{apiConfig.routing.chat === 'local' ? `Local (${localConfig.routing.chat})` : 'OpenAI'}</span></div>
                  <div>Multimodal: <span className="text-blue-300">OpenAI</span></div>
                  <div>Imagen: <span className="text-blue-300">OpenAI</span></div>
                  <div>Video: <span className="text-blue-300">{apiConfig.routing.video === 'runway' ? 'Runway' : 'OpenAI'}</span></div>
                  <div>3D: <span className="text-blue-300">Meshy</span></div>
                </div>
              </SectionCard>

              <SectionCard title="Modo de trabajo" description="Base para flujo manual, híbrido y AI-first dentro del editor." icon={Cloud}>
                <div className="grid grid-cols-1 gap-2 text-xs text-slate-300">
                  <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                    Manual: importas assets, editas scripts y compilas con diagnóstico en la consola.
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                    Híbrido: la IA propone escenas, scripts y assets, pero puedes reescribir cada bloque.
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                    AI-first: chat + routing controlan la generación de texto, imagen, video y 3D desde un solo mensaje.
                  </div>
                </div>
              </SectionCard>
            </TabsContent>

            <TabsContent value="shortcuts" className="space-y-4">
              <EditorShortcutSettings
                value={shortcutConfig}
                onChange={setShortcutConfig}
              />
            </TabsContent>

            <TabsContent value="permissions" className="space-y-4">
              <SectionCard
                title="Permisos IA + RBAC"
                description="Controla acciones sensibles del orquestador y runtime por cuenta."
                icon={ShieldCheck}
              >
                <div className="space-y-2">
                  <PermissionRow
                    label="Escritura filesystem"
                    allowed={permState.filesystem_write.allowed}
                    requireConfirm={permState.filesystem_write.requireConfirm}
                    onAllowedChange={(value) => setPermission('filesystem_write', 'allowed', value)}
                    onConfirmChange={(value) => setPermission('filesystem_write', 'requireConfirm', value)}
                  />
                  <PermissionRow
                    label="Edición de escena"
                    allowed={permState.scene_edit.allowed}
                    requireConfirm={permState.scene_edit.requireConfirm}
                    onAllowedChange={(value) => setPermission('scene_edit', 'allowed', value)}
                    onConfirmChange={(value) => setPermission('scene_edit', 'requireConfirm', value)}
                  />
                  <PermissionRow
                    label="Eliminar assets"
                    allowed={permState.asset_delete.allowed}
                    requireConfirm={permState.asset_delete.requireConfirm}
                    onAllowedChange={(value) => setPermission('asset_delete', 'allowed', value)}
                    onConfirmChange={(value) => setPermission('asset_delete', 'requireConfirm', value)}
                  />
                  <PermissionRow
                    label="Build proyecto"
                    allowed={permState.build_project.allowed}
                    requireConfirm={permState.build_project.requireConfirm}
                    onAllowedChange={(value) => setPermission('build_project', 'allowed', value)}
                    onConfirmChange={(value) => setPermission('build_project', 'requireConfirm', value)}
                  />
                  <PermissionRow
                    label="Comandos shell"
                    allowed={permState.run_command.allowed}
                    requireConfirm={permState.run_command.requireConfirm}
                    onAllowedChange={(value) => setPermission('run_command', 'allowed', value)}
                    onConfirmChange={(value) => setPermission('run_command', 'requireConfirm', value)}
                  />
                  <PermissionRow
                    label="MCP Tools"
                    allowed={permState.mcp_tool.allowed}
                    requireConfirm={permState.mcp_tool.requireConfirm}
                    onAllowedChange={(value) => setPermission('mcp_tool', 'allowed', value)}
                    onConfirmChange={(value) => setPermission('mcp_tool', 'requireConfirm', value)}
                  />
                </div>

                <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                  <div>Rol activo: <span className="text-cyan-300">{sessionUser?.role || 'SIN_SESION'}</span></div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Roles soportados: OWNER, EDITOR, VIEWER. Los eventos quedan auditados en seguridad.
                  </div>
                </div>
              </SectionCard>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
