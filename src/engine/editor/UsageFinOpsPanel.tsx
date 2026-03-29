'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Save,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type SessionUserLite = {
  id: string;
  email: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
};

type ProviderKey = 'openai' | 'meshy' | 'runway' | 'ollama' | 'vllm' | 'llamacpp';

type UsagePolicy = {
  monthlyBudgetUsd: number;
  hardStopEnabled: boolean;
  warningThresholdRatio: number;
  perProviderBudgets: Record<ProviderKey, number | null>;
};

type UsageSummary = {
  period: string;
  totals: {
    requestCount: number;
    estimatedCostUsd: number;
    monthlyBudgetUsd: number;
    remainingBudgetUsd: number;
    status: 'ok' | 'warning' | 'blocked';
  };
  perProvider: Record<ProviderKey, { estimatedCostUsd: number }>;
};

type FinOpsSnapshot = {
  profile: {
    enabled: boolean;
    totalWarningRatio: number;
    providerWarningRatio: number;
    projectWarningRatio: number;
    includeLocalProviders: boolean;
  };
  goals: Array<{
    projectKey: string;
    monthlyBudgetUsd: number;
    warningRatio: number;
    isActive: boolean;
  }>;
  projectSummary: {
    period: string;
    projects: Array<{
      projectKey: string;
      requestCount: number;
      estimatedCostUsd: number;
      monthlyBudgetUsd: number | null;
      status: 'ok' | 'warning' | 'blocked';
    }>;
  };
  alerts: Array<{
    id: string;
    label: string;
    message: string;
    severity: 'warning' | 'critical';
  }>;
  insights: {
    projections: {
      projectedMonthEndUsd: number;
    };
    recommendations: Array<{
      id: string;
      title: string;
      detail: string;
      action: string;
      severity: 'low' | 'medium' | 'high';
    }>;
  };
};

type BudgetApprovalRequestItem = {
  id: string;
  requesterEmail: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  requestedMonthlyBudgetUsd: number | null;
  reason: string | null;
  decisionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

type EnterpriseFinOpsReport = {
  totals: {
    users: number;
    criticalAlerts: number;
    warningAlerts: number;
    pendingApprovals: number;
    monthlySpendUsd: number;
  };
  pendingApprovals: BudgetApprovalRequestItem[];
};

type BudgetApprovalPolicyItem = {
  id: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  projectKey: string | null;
  autoApproveBelowUsd: number | null;
  requireManualForProviderChanges: boolean;
  requireReason: boolean;
  alwaysRequireManual: boolean;
  enabled: boolean;
};

type UserAutopilotSnapshot = {
  config: {
    enabled: boolean;
    seasonalityEnabled: boolean;
    budgetBufferRatio: number;
    lookbackMonths: number;
  };
  suggestion: {
    period: string;
    season: 'holiday_peak' | 'summer_launch' | 'standard';
    seasonalityFactor: number;
    baselineMonthlySpendUsd: number;
    projectedMonthEndUsd: number;
    currentBudgetUsd: number;
    suggestedBudgetUsd: number;
    reason: string;
    providerSuggestions: Array<{
      provider: ProviderKey;
      currentCostUsd: number;
      share: number;
      suggestedBudgetUsd: number | null;
    }>;
  };
  matchingPolicies: BudgetApprovalPolicyItem[];
};

type IncidentReport = {
  totals: {
    incidents: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  incidents: Array<{
    id: string;
    type: 'budget_alert' | 'approval_backlog' | 'spend_concentration';
    severity: 'critical' | 'high' | 'medium' | 'low';
    summary: string;
    suggestedAction: string;
    estimatedImpactUsd: number;
  }>;
};

type AutomationControl = {
  controlKey: string;
  enabled: boolean;
  windowStartUtc: string | null;
  windowEndUtc: string | null;
  cooldownMinutes: number;
  maxActionsPerRun: number;
  minSeverity: 'critical' | 'high' | 'medium' | 'low';
  allowPolicyMutations: boolean;
  allowBudgetMutations: boolean;
};

type ClosedLoopRunReport = {
  period: string;
  dryRun: boolean;
  windowOpen: boolean;
  skippedByWindow: boolean;
  actionsPlanned: number;
  actionsApplied: number;
  actionsSkipped: number;
  actionsFailed: number;
};

type RemediationLogItem = {
  id: string;
  actionType: string;
  status: 'PROPOSED' | 'APPLIED' | 'SKIPPED' | 'FAILED';
  reason: string;
  createdAt: string;
};

const PROVIDERS: ProviderKey[] = ['openai', 'meshy', 'runway', 'ollama', 'vllm', 'llamacpp'];

function money(value: number): string {
  return `$${Number.isFinite(value) ? value.toFixed(2) : '0.00'}`;
}

function tone(status: 'ok' | 'warning' | 'blocked' | 'critical'): string {
  if (status === 'blocked' || status === 'critical') return 'border-red-500/30 bg-red-500/10 text-red-200';
  if (status === 'warning') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
}

function approvalTone(status: BudgetApprovalRequestItem['status']): string {
  if (status === 'PENDING') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  if (status === 'APPROVED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'REJECTED') return 'border-red-500/30 bg-red-500/10 text-red-200';
  return 'border-slate-600/40 bg-slate-700/20 text-slate-300';
}

function incidentTone(severity: 'critical' | 'high' | 'medium' | 'low'): string {
  if (severity === 'critical') return 'border-red-500/30 bg-red-500/10 text-red-200';
  if (severity === 'high') return 'border-orange-500/30 bg-orange-500/10 text-orange-200';
  if (severity === 'medium') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
}

export function UsageFinOpsPanel({
  sessionUser,
  authLoading,
}: {
  sessionUser: SessionUserLite | null;
  authLoading: boolean;
}) {
  const [policy, setPolicy] = useState<UsagePolicy | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [snapshot, setSnapshot] = useState<FinOpsSnapshot | null>(null);
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newGoalProject, setNewGoalProject] = useState('');
  const [newGoalBudget, setNewGoalBudget] = useState('10');
  const [approvalRequests, setApprovalRequests] = useState<BudgetApprovalRequestItem[]>([]);
  const [enterpriseReport, setEnterpriseReport] = useState<EnterpriseFinOpsReport | null>(null);
  const [requestBudget, setRequestBudget] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [requestSaving, setRequestSaving] = useState(false);
  const [decisionNoteById, setDecisionNoteById] = useState<Record<string, string>>({});
  const [decisionLoadingId, setDecisionLoadingId] = useState('');
  const [autopilot, setAutopilot] = useState<UserAutopilotSnapshot | null>(null);
  const [autopilotSaving, setAutopilotSaving] = useState(false);
  const [incidentReport, setIncidentReport] = useState<IncidentReport | null>(null);
  const [policies, setPolicies] = useState<BudgetApprovalPolicyItem[]>([]);
  const [policiesSaving, setPoliciesSaving] = useState(false);
  const [automationControl, setAutomationControl] = useState<AutomationControl | null>(null);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [closedLoopReport, setClosedLoopReport] = useState<ClosedLoopRunReport | null>(null);
  const [closedLoopRunning, setClosedLoopRunning] = useState(false);
  const [remediationLogs, setRemediationLogs] = useState<RemediationLogItem[]>([]);

  const load = useCallback(async () => {
    if (!sessionUser) return;
    setLoading(true);
    setError('');
    setRequestMessage('');
    try {
      const [
        policyRes,
        finopsRes,
        approvalsRes,
        autopilotRes,
        enterpriseRes,
        policiesRes,
        incidentsRes,
        controlRes,
        remediationLogsRes,
      ] =
        await Promise.all([
        fetch('/api/user/usage-policy'),
        fetch(`/api/user/usage-finops?months=${months}`),
        fetch('/api/user/budget-approvals'),
        fetch(`/api/user/usage-autopilot?months=${months}`),
        sessionUser.role === 'OWNER'
          ? fetch(`/api/ops/usage/enterprise?months=${months}`, { cache: 'no-store' })
          : Promise.resolve(null),
        sessionUser.role === 'OWNER'
          ? fetch('/api/ops/usage/policies', { cache: 'no-store' })
          : Promise.resolve(null),
        sessionUser.role === 'OWNER'
          ? fetch(`/api/ops/usage/incidents?months=${months}`, { cache: 'no-store' })
          : Promise.resolve(null),
        sessionUser.role === 'OWNER'
          ? fetch('/api/ops/usage/automation-control', { cache: 'no-store' })
          : Promise.resolve(null),
        sessionUser.role === 'OWNER'
          ? fetch('/api/ops/usage/closed-loop/logs?take=10', { cache: 'no-store' })
          : Promise.resolve(null),
      ]);
      const policyData = await policyRes.json().catch(() => ({}));
      const finopsData = await finopsRes.json().catch(() => ({}));
      const approvalsData = await approvalsRes.json().catch(() => ({}));
      const autopilotData = await autopilotRes.json().catch(() => ({}));
      const enterpriseData = enterpriseRes ? await enterpriseRes.json().catch(() => ({})) : null;
      const policiesData = policiesRes ? await policiesRes.json().catch(() => ({})) : null;
      const incidentsData = incidentsRes ? await incidentsRes.json().catch(() => ({})) : null;
      const controlData = controlRes ? await controlRes.json().catch(() => ({})) : null;
      const remediationLogsData = remediationLogsRes
        ? await remediationLogsRes.json().catch(() => ({}))
        : null;
      if (!policyRes.ok) {
        setError(policyData?.error || 'No se pudo cargar usage-policy');
        return;
      }
      if (!finopsRes.ok) {
        setError(finopsData?.error || 'No se pudo cargar usage-finops');
        return;
      }
      if (!autopilotRes.ok) {
        setError(autopilotData?.error || 'No se pudo cargar usage-autopilot');
        return;
      }
      setPolicy((policyData.policy as UsagePolicy) || null);
      setSummary((policyData.summary as UsageSummary) || null);
      setSnapshot(finopsData as FinOpsSnapshot);
      setAutopilot(autopilotData as UserAutopilotSnapshot);
      if (approvalsRes.ok && Array.isArray(approvalsData?.requests)) {
        setApprovalRequests(approvalsData.requests as BudgetApprovalRequestItem[]);
      } else {
        setApprovalRequests([]);
      }
      if (sessionUser.role === 'OWNER' && enterpriseRes?.ok) {
        setEnterpriseReport(enterpriseData as EnterpriseFinOpsReport);
      } else {
        setEnterpriseReport(null);
      }
      if (sessionUser.role === 'OWNER' && policiesRes?.ok && Array.isArray(policiesData?.policies)) {
        setPolicies(policiesData.policies as BudgetApprovalPolicyItem[]);
      } else {
        setPolicies([]);
      }
      if (sessionUser.role === 'OWNER' && incidentsRes?.ok) {
        setIncidentReport(incidentsData as IncidentReport);
      } else {
        setIncidentReport(null);
      }
      if (sessionUser.role === 'OWNER' && controlRes?.ok && controlData?.control) {
        setAutomationControl(controlData.control as AutomationControl);
      } else {
        setAutomationControl(null);
      }
      if (
        sessionUser.role === 'OWNER' &&
        remediationLogsRes?.ok &&
        Array.isArray(remediationLogsData?.logs)
      ) {
        setRemediationLogs(remediationLogsData.logs as RemediationLogItem[]);
      } else {
        setRemediationLogs([]);
      }
    } finally {
      setLoading(false);
    }
  }, [months, sessionUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const percent = useMemo(() => {
    if (!summary || summary.totals.monthlyBudgetUsd <= 0) return 0;
    return Math.min(100, (summary.totals.estimatedCostUsd / summary.totals.monthlyBudgetUsd) * 100);
  }, [summary]);

  const saveAll = async () => {
    if (!sessionUser || !policy || !snapshot) return;
    setSaving(true);
    setError('');
    try {
      const [policyRes, finopsRes, autopilotRes] = await Promise.all([
        fetch('/api/user/usage-policy', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(policy),
        }),
        fetch('/api/user/usage-finops', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: snapshot.profile,
            goals: snapshot.goals,
            months,
          }),
        }),
        autopilot
          ? fetch('/api/user/usage-autopilot', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...autopilot.config,
                months,
              }),
            })
          : Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
      ]);
      if (!policyRes.ok || !finopsRes.ok || !autopilotRes.ok) {
        const p = await policyRes.json().catch(() => ({}));
        const f = await finopsRes.json().catch(() => ({}));
        const a = await autopilotRes.json().catch(() => ({}));
        setError(p?.error || f?.error || a?.error || 'No se pudo guardar configuración FinOps');
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  };

  const setGoalForProject = (projectKey: string, patch: { monthlyBudgetUsd?: number; warningRatio?: number }) => {
    if (!snapshot) return;
    const normalizedKey = projectKey.trim().toLowerCase().replace(/\s+/g, '_');
    if (!normalizedKey) return;

    const goals = [...snapshot.goals];
    const index = goals.findIndex((goal) => goal.projectKey === normalizedKey);
    if (index >= 0) {
      goals[index] = {
        ...goals[index],
        monthlyBudgetUsd:
          typeof patch.monthlyBudgetUsd === 'number'
            ? Math.max(1, patch.monthlyBudgetUsd)
            : goals[index].monthlyBudgetUsd,
        warningRatio:
          typeof patch.warningRatio === 'number'
            ? Math.min(0.99, Math.max(0.1, patch.warningRatio))
            : goals[index].warningRatio,
      };
    } else {
      goals.push({
        projectKey: normalizedKey,
        monthlyBudgetUsd: Math.max(1, patch.monthlyBudgetUsd || 10),
        warningRatio: Math.min(0.99, Math.max(0.1, patch.warningRatio || snapshot.profile.projectWarningRatio)),
        isActive: true,
      });
    }
    setSnapshot({ ...snapshot, goals });
  };

  const exportCsv = async () => {
    const response = await fetch(`/api/user/usage-export?format=csv&months=${months}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data?.error || 'No se pudo exportar CSV');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-export-${summary?.period || 'current'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const submitBudgetApprovalRequest = async () => {
    const budget = Number(requestBudget);
    if (!Number.isFinite(budget) || budget <= 0) {
      setError('Ingresa un presupuesto mensual válido para solicitar aprobación.');
      return;
    }
    setRequestSaving(true);
    setError('');
    setRequestMessage('');
    try {
      const response = await fetch('/api/user/budget-approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedMonthlyBudgetUsd: budget,
          reason: requestReason.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'No se pudo enviar la solicitud de aprobación.');
        return;
      }
      setRequestBudget('');
      setRequestReason('');
      setRequestMessage(data?.message || 'Solicitud enviada.');
      await load();
    } finally {
      setRequestSaving(false);
    }
  };

  const decideApproval = async (
    requestId: string,
    decision: 'approve' | 'reject' | 'cancel'
  ) => {
    setDecisionLoadingId(requestId);
    setError('');
    try {
      const note = decisionNoteById[requestId]?.trim();
      const response = await fetch(
        `/api/ops/usage/approvals/${encodeURIComponent(requestId)}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision,
            note: note || undefined,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'No se pudo resolver la solicitud.');
        return;
      }
      setDecisionNoteById((current) => ({ ...current, [requestId]: '' }));
      await load();
    } finally {
      setDecisionLoadingId('');
    }
  };

  const saveApprovalPolicies = async () => {
    if (!sessionUser || sessionUser.role !== 'OWNER') return;
    setPoliciesSaving(true);
    setError('');
    try {
      const response = await fetch('/api/ops/usage/policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policies }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'No se pudieron guardar las policies.');
        return;
      }
      if (Array.isArray(data?.policies)) {
        setPolicies(data.policies as BudgetApprovalPolicyItem[]);
      }
      await load();
    } finally {
      setPoliciesSaving(false);
    }
  };

  const applySuggestedBudget = async () => {
    if (!autopilot?.suggestion?.suggestedBudgetUsd || !policy) return;
    const suggested = Math.max(1, Number(autopilot.suggestion.suggestedBudgetUsd) || 1);
    setPolicy({ ...policy, monthlyBudgetUsd: suggested });
    setAutopilotSaving(true);
    try {
      const response = await fetch('/api/user/usage-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...policy,
          monthlyBudgetUsd: suggested,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.error || 'No se pudo aplicar el presupuesto sugerido.');
        return;
      }
      await load();
    } finally {
      setAutopilotSaving(false);
    }
  };

  const saveAutomation = async () => {
    if (!sessionUser || sessionUser.role !== 'OWNER' || !automationControl) return;
    setAutomationSaving(true);
    setError('');
    try {
      const response = await fetch('/api/ops/usage/automation-control', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(automationControl),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'No se pudo guardar automation control.');
        return;
      }
      setAutomationControl((data?.control as AutomationControl) || automationControl);
    } finally {
      setAutomationSaving(false);
    }
  };

  const runClosedLoop = async (dryRun: boolean) => {
    if (!sessionUser || sessionUser.role !== 'OWNER') return;
    setClosedLoopRunning(true);
    setError('');
    try {
      const response = await fetch('/api/ops/usage/closed-loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun,
          months,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'No se pudo ejecutar closed-loop.');
        return;
      }
      setClosedLoopReport(data as ClosedLoopRunReport);
      await load();
    } finally {
      setClosedLoopRunning(false);
    }
  };

  if (!sessionUser) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
        {authLoading ? 'Cargando sesión...' : 'Inicia sesión para usar FinOps.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-slate-100">FinOps Fase 19</h3>
            <p className="text-xs text-slate-400">
              Autopilot con triage automático, sugerencias estacionales y policies por rol/proyecto.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={months}
              onChange={(event) => setMonths(Number(event.target.value) || 6)}
              className="h-8 rounded border border-slate-700 bg-slate-950 px-2 text-xs"
            >
              <option value={3}>3m</option>
              <option value={6}>6m</option>
              <option value={12}>12m</option>
            </select>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('mr-1 h-3 w-3', loading && 'animate-spin')} /> Actualizar
            </Button>
            <Button size="sm" variant="outline" onClick={() => void exportCsv()}>
              <Download className="mr-1 h-3 w-3" /> CSV
            </Button>
            <Button size="sm" onClick={() => void saveAll()} disabled={saving || !policy || !snapshot}>
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />} Guardar
            </Button>
          </div>
        </div>
        {error ? <div className="mt-2 text-xs text-red-300">{error}</div> : null}
      </div>

      {summary && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <div className="flex items-center gap-2 text-slate-100">
            <Wallet className="h-4 w-4" /> {summary.period}: {money(summary.totals.estimatedCostUsd)} / {money(summary.totals.monthlyBudgetUsd)}
          </div>
          <Progress value={percent} className="mt-2 h-2 bg-slate-800" />
          <div className="mt-2 text-xs text-slate-400">
            Proyección fin de mes: {money(snapshot?.insights?.projections?.projectedMonthEndUsd || 0)}
          </div>
          {policy && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Input
                type="number"
                value={policy.monthlyBudgetUsd}
                onChange={(event) =>
                  setPolicy({ ...policy, monthlyBudgetUsd: Math.max(1, Number(event.target.value) || 1) })
                }
                className="bg-slate-950 border-slate-700"
              />
              <Input
                type="number"
                value={Math.round(policy.warningThresholdRatio * 100)}
                onChange={(event) =>
                  setPolicy({
                    ...policy,
                    warningThresholdRatio: Math.min(0.99, Math.max(0.1, (Number(event.target.value) || 85) / 100)),
                  })
                }
                className="bg-slate-950 border-slate-700"
              />
              <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300">
                Hard stop
                <Switch
                  checked={policy.hardStopEnabled}
                  onCheckedChange={(checked) => setPolicy({ ...policy, hardStopEnabled: checked })}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {autopilot && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-slate-100">Autopilot Budget Advisor</h4>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void applySuggestedBudget()}
              disabled={autopilotSaving || !policy}
            >
              {autopilotSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Aplicar sugerido
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-200">
              Temporada: <span className="text-cyan-300">{autopilot.suggestion.season}</span>
            </div>
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-200">
              Factor: <span className="text-cyan-300">{autopilot.suggestion.seasonalityFactor.toFixed(2)}x</span>
            </div>
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-200">
              Baseline: {money(autopilot.suggestion.baselineMonthlySpendUsd)}
            </div>
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-emerald-300">
              Sugerido: {money(autopilot.suggestion.suggestedBudgetUsd)}
            </div>
          </div>
          <div className="text-xs text-slate-400">{autopilot.suggestion.reason}</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300">
              Autopilot
              <Switch
                checked={autopilot.config.enabled}
                onCheckedChange={(checked) =>
                  setAutopilot({
                    ...autopilot,
                    config: { ...autopilot.config, enabled: checked },
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300">
              Estacional
              <Switch
                checked={autopilot.config.seasonalityEnabled}
                onCheckedChange={(checked) =>
                  setAutopilot({
                    ...autopilot,
                    config: { ...autopilot.config, seasonalityEnabled: checked },
                  })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min={3}
              max={12}
              value={autopilot.config.lookbackMonths}
              onChange={(event) =>
                setAutopilot({
                  ...autopilot,
                  config: {
                    ...autopilot.config,
                    lookbackMonths: Math.max(3, Math.min(12, Number(event.target.value) || 6)),
                  },
                })
              }
              className="bg-slate-950 border-slate-700"
            />
            <Input
              type="number"
              min={2}
              max={100}
              value={Math.round(autopilot.config.budgetBufferRatio * 100)}
              onChange={(event) =>
                setAutopilot({
                  ...autopilot,
                  config: {
                    ...autopilot.config,
                    budgetBufferRatio:
                      Math.min(1, Math.max(0.02, (Number(event.target.value) || 15) / 100)),
                  },
                })
              }
              className="bg-slate-950 border-slate-700"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-300">Sugerencias por proveedor</div>
            {autopilot.suggestion.providerSuggestions.slice(0, 3).map((item) => (
              <div key={item.provider} className="rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300">
                {item.provider}: {money(item.currentCostUsd)} · share {(item.share * 100).toFixed(1)}%
                {item.suggestedBudgetUsd !== null ? ` · sugerido ${money(item.suggestedBudgetUsd)}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {snapshot && (
        <>
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
            <h4 className="text-sm font-medium text-slate-100">Perfil de alertas</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300">
                Activadas
                <Switch
                  checked={snapshot.profile.enabled}
                  onCheckedChange={(checked) =>
                    setSnapshot({ ...snapshot, profile: { ...snapshot.profile, enabled: checked } })
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300">
                Incluir local
                <Switch
                  checked={snapshot.profile.includeLocalProviders}
                  onCheckedChange={(checked) =>
                    setSnapshot({ ...snapshot, profile: { ...snapshot.profile, includeLocalProviders: checked } })
                  }
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
            <h4 className="text-sm font-medium text-slate-100">Objetivos por proyecto</h4>
            {snapshot.projectSummary.projects.length === 0 && (
              <div className="text-xs text-slate-500">Aun no hay consumo por proyecto registrado.</div>
            )}
            {snapshot.projectSummary.projects.map((project) => (
              <div key={project.projectKey} className={cn('rounded border p-2 text-xs space-y-2', tone(project.status))}>
                <div>{project.projectKey}</div>
                <div className="opacity-80">
                  Costo: {money(project.estimatedCostUsd)} | Requests: {project.requestCount} | Objetivo:{' '}
                  {project.monthlyBudgetUsd ? money(project.monthlyBudgetUsd) : 'sin definir'}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={1}
                    step={0.5}
                    value={
                      snapshot.goals.find((goal) => goal.projectKey === project.projectKey)?.monthlyBudgetUsd ?? ''
                    }
                    onChange={(event) =>
                      setGoalForProject(project.projectKey, {
                        monthlyBudgetUsd: Number(event.target.value) || 1,
                      })
                    }
                    placeholder="Objetivo USD"
                    className="bg-slate-950 border-slate-700"
                  />
                  <Input
                    type="number"
                    min={10}
                    max={99}
                    value={Math.round(
                      (snapshot.goals.find((goal) => goal.projectKey === project.projectKey)?.warningRatio ??
                        snapshot.profile.projectWarningRatio) * 100
                    )}
                    onChange={(event) =>
                      setGoalForProject(project.projectKey, {
                        warningRatio: (Number(event.target.value) || 85) / 100,
                      })
                    }
                    placeholder="Umbral %"
                    className="bg-slate-950 border-slate-700"
                  />
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[1.4fr,1fr,auto] gap-2">
              <Input
                value={newGoalProject}
                onChange={(event) => setNewGoalProject(event.target.value)}
                placeholder="nuevo_project_key"
                className="bg-slate-950 border-slate-700"
              />
              <Input
                type="number"
                min={1}
                step={0.5}
                value={newGoalBudget}
                onChange={(event) => setNewGoalBudget(event.target.value)}
                className="bg-slate-950 border-slate-700"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const key = newGoalProject.trim();
                  const budget = Number(newGoalBudget);
                  if (!key || !Number.isFinite(budget) || budget <= 0) return;
                  setGoalForProject(key, { monthlyBudgetUsd: budget });
                  setNewGoalProject('');
                }}
              >
                Agregar
              </Button>
            </div>
          </div>

          {snapshot.alerts.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
              <h4 className="text-sm font-medium text-slate-100">Alertas personalizadas activas</h4>
              {snapshot.alerts.map((alert) => (
                <div key={alert.id} className={cn('rounded border p-2 text-xs', tone(alert.severity))}>
                  <div className="font-medium">{alert.label}</div>
                  <div>{alert.message}</div>
                </div>
              ))}
            </div>
          )}

          {snapshot.insights.recommendations.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
              <div className="flex items-center gap-2 text-slate-100">
                <AlertTriangle className="h-4 w-4" />
                Recomendaciones
              </div>
              {snapshot.insights.recommendations.map((item) => (
                <div key={item.id} className="rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200">
                  <div className="font-medium">{item.title}</div>
                  <div className="opacity-80">{item.detail}</div>
                  <div className="opacity-70">Accion: {item.action}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
        <h4 className="text-sm font-medium text-slate-100">Solicitud de aprobación de presupuesto</h4>
        <div className="grid grid-cols-[1fr,2fr,auto] gap-2">
          <Input
            type="number"
            min={1}
            step={1}
            value={requestBudget}
            onChange={(event) => setRequestBudget(event.target.value)}
            placeholder="Nuevo presupuesto mensual USD"
            className="bg-slate-950 border-slate-700"
          />
          <Input
            value={requestReason}
            onChange={(event) => setRequestReason(event.target.value)}
            placeholder="Motivo de la solicitud (opcional)"
            className="bg-slate-950 border-slate-700"
          />
          <Button
            size="sm"
            onClick={() => void submitBudgetApprovalRequest()}
            disabled={requestSaving}
          >
            {requestSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Solicitar
          </Button>
        </div>
        {requestMessage ? <div className="text-xs text-emerald-300">{requestMessage}</div> : null}
        <div className="space-y-2">
          {approvalRequests.length === 0 ? (
            <div className="text-xs text-slate-500">Aún no has enviado solicitudes.</div>
          ) : (
            approvalRequests.map((item) => (
              <div key={item.id} className={cn('rounded border p-2 text-xs space-y-1', approvalTone(item.status))}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">
                    {item.requestedMonthlyBudgetUsd ? money(item.requestedMonthlyBudgetUsd) : 'Cambio parcial'} ·{' '}
                    {item.status}
                  </div>
                  <div className="opacity-70">{new Date(item.createdAt).toLocaleString()}</div>
                </div>
                {item.reason ? <div className="opacity-90">Motivo: {item.reason}</div> : null}
                {item.decisionNote ? <div className="opacity-80">Respuesta: {item.decisionNote}</div> : null}
              </div>
            ))
          )}
        </div>
      </div>

      {sessionUser.role === 'OWNER' && enterpriseReport && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
          <h4 className="text-sm font-medium text-slate-100">Enterprise FinOps (Owner)</h4>
          <div className="grid grid-cols-5 gap-2 text-xs">
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-200">
              Usuarios: {enterpriseReport.totals.users}
            </div>
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-red-300">
              Críticas: {enterpriseReport.totals.criticalAlerts}
            </div>
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-amber-300">
              Warnings: {enterpriseReport.totals.warningAlerts}
            </div>
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-cyan-300">
              Pendientes: {enterpriseReport.totals.pendingApprovals}
            </div>
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-200">
              Spend: {money(enterpriseReport.totals.monthlySpendUsd)}
            </div>
          </div>

          <div className="space-y-2">
            {enterpriseReport.pendingApprovals.length === 0 ? (
              <div className="text-xs text-slate-500">No hay solicitudes pendientes.</div>
            ) : (
              enterpriseReport.pendingApprovals.map((item) => (
                <div key={item.id} className={cn('rounded border p-2 text-xs space-y-2', approvalTone(item.status))}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">
                      {item.requesterEmail} · {item.requestedMonthlyBudgetUsd ? money(item.requestedMonthlyBudgetUsd) : 'Cambio parcial'}
                    </div>
                    <div className="opacity-70">{new Date(item.createdAt).toLocaleString()}</div>
                  </div>
                  {item.reason ? <div className="opacity-90">Motivo: {item.reason}</div> : null}
                  <Input
                    value={decisionNoteById[item.id] || ''}
                    onChange={(event) =>
                      setDecisionNoteById((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                    placeholder="Nota de decisión (opcional)"
                    className="bg-slate-950 border-slate-700"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => void decideApproval(item.id, 'approve')}
                      disabled={decisionLoadingId === item.id}
                    >
                      {decisionLoadingId === item.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void decideApproval(item.id, 'reject')}
                      disabled={decisionLoadingId === item.id}
                    >
                      <XCircle className="mr-1 h-3 w-3" />
                      Rechazar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {sessionUser.role === 'OWNER' && incidentReport && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
          <h4 className="text-sm font-medium text-slate-100">Auto-Triage de Incidentes</h4>
          <div className="grid grid-cols-5 gap-2 text-xs">
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-slate-200">
              Total: {incidentReport.totals.incidents}
            </div>
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-red-300">
              Critical: {incidentReport.totals.critical}
            </div>
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-orange-300">
              High: {incidentReport.totals.high}
            </div>
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-amber-300">
              Medium: {incidentReport.totals.medium}
            </div>
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-emerald-300">
              Low: {incidentReport.totals.low}
            </div>
          </div>
          <div className="space-y-2">
            {incidentReport.incidents.slice(0, 6).map((incident) => (
              <div key={incident.id} className={cn('rounded border p-2 text-xs space-y-1', incidentTone(incident.severity))}>
                <div className="font-medium">
                  [{incident.severity.toUpperCase()}] {incident.summary}
                </div>
                <div>{incident.suggestedAction}</div>
                <div>Impacto: {money(incident.estimatedImpactUsd)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sessionUser.role === 'OWNER' && policies.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-slate-100">Policies de aprobación (rol/proyecto)</h4>
            <Button size="sm" onClick={() => void saveApprovalPolicies()} disabled={policiesSaving}>
              {policiesSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
              Guardar policies
            </Button>
          </div>
          <div className="space-y-2">
            {policies.map((policyItem) => (
              <div key={policyItem.id} className="rounded border border-slate-700 bg-slate-950 p-2 text-xs space-y-2">
                <div className="font-medium text-slate-200">
                  {policyItem.role} · {policyItem.projectKey || '*'}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Input
                    type="number"
                    value={policyItem.autoApproveBelowUsd ?? ''}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      const value = raw === '' ? null : Number(raw);
                      if (value !== null && (!Number.isFinite(value) || value < 0)) return;
                      setPolicies((current) =>
                        current.map((item) =>
                          item.id === policyItem.id
                            ? { ...item, autoApproveBelowUsd: value }
                            : item
                        )
                      );
                    }}
                    placeholder="Auto-approve USD"
                    className="bg-slate-900 border-slate-700"
                  />
                  <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-900 px-2 text-slate-300">
                    Manual proveedor
                    <Switch
                      checked={policyItem.requireManualForProviderChanges}
                      onCheckedChange={(checked) =>
                        setPolicies((current) =>
                          current.map((item) =>
                            item.id === policyItem.id
                              ? { ...item, requireManualForProviderChanges: checked }
                              : item
                          )
                        )
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-900 px-2 text-slate-300">
                    Requiere motivo
                    <Switch
                      checked={policyItem.requireReason}
                      onCheckedChange={(checked) =>
                        setPolicies((current) =>
                          current.map((item) =>
                            item.id === policyItem.id ? { ...item, requireReason: checked } : item
                          )
                        )
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-900 px-2 text-slate-300">
                    Activa
                    <Switch
                      checked={policyItem.enabled}
                      onCheckedChange={(checked) =>
                        setPolicies((current) =>
                          current.map((item) =>
                            item.id === policyItem.id ? { ...item, enabled: checked } : item
                          )
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sessionUser.role === 'OWNER' && automationControl && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-slate-100">Closed-Loop Control</h4>
            <Button size="sm" onClick={() => void saveAutomation()} disabled={automationSaving}>
              {automationSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
              Guardar control
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300">
              Enabled
              <Switch
                checked={automationControl.enabled}
                onCheckedChange={(checked) =>
                  setAutomationControl({ ...automationControl, enabled: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300">
              Budget mutations
              <Switch
                checked={automationControl.allowBudgetMutations}
                onCheckedChange={(checked) =>
                  setAutomationControl({ ...automationControl, allowBudgetMutations: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300">
              Policy mutations
              <Switch
                checked={automationControl.allowPolicyMutations}
                onCheckedChange={(checked) =>
                  setAutomationControl({ ...automationControl, allowPolicyMutations: checked })
                }
              />
            </div>
            <select
              value={automationControl.minSeverity}
              onChange={(event) =>
                setAutomationControl({
                  ...automationControl,
                  minSeverity: event.target.value as AutomationControl['minSeverity'],
                })
              }
              className="h-9 rounded border border-slate-700 bg-slate-950 px-2 text-xs"
            >
              <option value="critical">critical</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Input
              value={automationControl.windowStartUtc || ''}
              onChange={(event) =>
                setAutomationControl({ ...automationControl, windowStartUtc: event.target.value })
              }
              placeholder="01:00"
              className="bg-slate-950 border-slate-700"
            />
            <Input
              value={automationControl.windowEndUtc || ''}
              onChange={(event) =>
                setAutomationControl({ ...automationControl, windowEndUtc: event.target.value })
              }
              placeholder="06:00"
              className="bg-slate-950 border-slate-700"
            />
            <Input
              type="number"
              value={automationControl.cooldownMinutes}
              onChange={(event) =>
                setAutomationControl({
                  ...automationControl,
                  cooldownMinutes: Math.max(10, Number(event.target.value) || 240),
                })
              }
              className="bg-slate-950 border-slate-700"
            />
            <Input
              type="number"
              value={automationControl.maxActionsPerRun}
              onChange={(event) =>
                setAutomationControl({
                  ...automationControl,
                  maxActionsPerRun: Math.max(1, Number(event.target.value) || 15),
                })
              }
              className="bg-slate-950 border-slate-700"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void runClosedLoop(true)} disabled={closedLoopRunning}>
              {closedLoopRunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Ejecutar Dry-Run
            </Button>
            <Button size="sm" onClick={() => void runClosedLoop(false)} disabled={closedLoopRunning}>
              {closedLoopRunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Aplicar Remediación
            </Button>
          </div>
          {closedLoopReport ? (
            <div className="rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300">
              run: {closedLoopReport.dryRun ? 'dry' : 'apply'} · planned {closedLoopReport.actionsPlanned} · applied{' '}
              {closedLoopReport.actionsApplied} · skipped {closedLoopReport.actionsSkipped} · failed{' '}
              {closedLoopReport.actionsFailed}
              {closedLoopReport.skippedByWindow ? ' · skipped_by_window' : ''}
            </div>
          ) : null}
        </div>
      )}

      {sessionUser.role === 'OWNER' && remediationLogs.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-2">
          <h4 className="text-sm font-medium text-slate-100">Closed-Loop Logs</h4>
          {remediationLogs.map((log) => (
            <div key={log.id} className="rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-300">
              [{log.status}] {log.actionType} · {new Date(log.createdAt).toLocaleString()}
              <div className="opacity-80">{log.reason}</div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
        <h4 className="text-sm font-medium text-slate-100">Límites por proveedor</h4>
        {policy ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PROVIDERS.map((provider) => (
              <Input
                key={provider}
                type="number"
                placeholder={`${provider} USD`}
                value={policy.perProviderBudgets[provider] ?? ''}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  const value = raw === '' ? null : Number(raw);
                  if (value !== null && (!Number.isFinite(value) || value < 0)) return;
                  setPolicy({
                    ...policy,
                    perProviderBudgets: { ...policy.perProviderBudgets, [provider]: value },
                  });
                }}
                className="bg-slate-950 border-slate-700"
              />
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500">Cargando...</div>
        )}
      </div>
    </div>
  );
}
