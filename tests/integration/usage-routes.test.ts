import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as usageAlertsGet } from '@/app/api/ops/usage/alerts/route';
import { GET as usageApprovalsGet } from '@/app/api/ops/usage/approvals/route';
import { GET as usageEnterpriseGet } from '@/app/api/ops/usage/enterprise/route';
import { GET as usageIncidentsGet } from '@/app/api/ops/usage/incidents/route';
import { GET as usagePoliciesGet, PUT as usagePoliciesPut } from '@/app/api/ops/usage/policies/route';
import {
  GET as usageAutomationControlGet,
  PUT as usageAutomationControlPut,
} from '@/app/api/ops/usage/automation-control/route';
import { POST as usageClosedLoopPost } from '@/app/api/ops/usage/closed-loop/route';
import { GET as usageClosedLoopLogsGet } from '@/app/api/ops/usage/closed-loop/logs/route';
import { GET as budgetApprovalsGet } from '@/app/api/user/budget-approvals/route';
import { GET as usageAutopilotGet } from '@/app/api/user/usage-autopilot/route';
import { GET as usageExportGet } from '@/app/api/user/usage-export/route';
import { GET as usageFinopsGet } from '@/app/api/user/usage-finops/route';
import { GET as usageInsightsGet } from '@/app/api/user/usage-insights/route';
import { GET as usagePolicyGet } from '@/app/api/user/usage-policy/route';
import { GET as usageSummaryGet } from '@/app/api/user/usage-summary/route';

describe('Usage governance routes', () => {
  const previousOpsToken = process.env.REY30_OPS_TOKEN;

  beforeAll(() => {
    process.env.REY30_OPS_TOKEN = 'test-ops-token';
  });

  afterAll(() => {
    if (previousOpsToken === undefined) {
      delete process.env.REY30_OPS_TOKEN;
      return;
    }
    process.env.REY30_OPS_TOKEN = previousOpsToken;
  });

  it('ops usage alerts endpoint is available with ops token', async () => {
    const response = await usageAlertsGet(
      new NextRequest('http://localhost/api/ops/usage/alerts', {
        headers: {
          'x-rey30-ops-token': 'test-ops-token',
        },
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(typeof payload.counts?.total).toBe('number');
  });

  it('ops token in query string is rejected', async () => {
    const response = await usageAlertsGet(
      new NextRequest('http://localhost/api/ops/usage/alerts?opsToken=test-ops-token')
    );
    expect(response.status).toBe(401);
  });

  it('ops enterprise governance endpoints are available with ops token', async () => {
    const headers = { 'x-rey30-ops-token': 'test-ops-token' };

    const approvalsResponse = await usageApprovalsGet(
      new NextRequest('http://localhost/api/ops/usage/approvals?status=PENDING', {
        headers,
      })
    );
    const enterpriseResponse = await usageEnterpriseGet(
      new NextRequest('http://localhost/api/ops/usage/enterprise?months=6', {
        headers,
      })
    );
    const incidentsResponse = await usageIncidentsGet(
      new NextRequest('http://localhost/api/ops/usage/incidents?months=6', {
        headers,
      })
    );
    const policiesResponse = await usagePoliciesGet(
      new NextRequest('http://localhost/api/ops/usage/policies', {
        headers,
      })
    );
    const controlResponse = await usageAutomationControlGet(
      new NextRequest('http://localhost/api/ops/usage/automation-control', {
        headers,
      })
    );
    const logsResponse = await usageClosedLoopLogsGet(
      new NextRequest('http://localhost/api/ops/usage/closed-loop/logs?take=5', {
        headers,
      })
    );

    expect(approvalsResponse.status).toBe(200);
    expect(enterpriseResponse.status).toBe(200);
    expect(incidentsResponse.status).toBe(200);
    expect(policiesResponse.status).toBe(200);
    expect(controlResponse.status).toBe(200);
    expect(logsResponse.status).toBe(200);

    const approvalsPayload = await approvalsResponse.json();
    const enterprisePayload = await enterpriseResponse.json();
    const incidentsPayload = await incidentsResponse.json();
    const policiesPayload = await policiesResponse.json();
    const controlPayload = await controlResponse.json();
    const logsPayload = await logsResponse.json();
    expect(approvalsPayload.ok).toBe(true);
    expect(typeof approvalsPayload.count).toBe('number');
    expect(enterprisePayload.ok).toBe(true);
    expect(typeof enterprisePayload.totals?.pendingApprovals).toBe('number');
    expect(incidentsPayload.ok).toBe(true);
    expect(typeof incidentsPayload.totals?.incidents).toBe('number');
    expect(policiesPayload.ok).toBe(true);
    expect(typeof policiesPayload.count).toBe('number');
    expect(controlPayload.ok).toBe(true);
    expect(typeof controlPayload.control?.enabled).toBe('boolean');
    expect(logsPayload.ok).toBe(true);
    expect(typeof logsPayload.count).toBe('number');
  });

  it('ops can update approval policies with token', async () => {
    const headers = {
      'x-rey30-ops-token': 'test-ops-token',
      'content-type': 'application/json',
    };
    const response = await usagePoliciesPut(
      new NextRequest('http://localhost/api/ops/usage/policies', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          policies: [
            {
              role: 'VIEWER',
              projectKey: null,
              alwaysRequireManual: true,
              requireReason: true,
              enabled: true,
            },
            {
              role: 'EDITOR',
              projectKey: 'test_game',
              autoApproveBelowUsd: 50,
              requireManualForProviderChanges: true,
              enabled: true,
            },
            {
              role: 'OWNER',
              projectKey: null,
              requireManualForProviderChanges: false,
              enabled: true,
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.count).toBe(3);
  });

  it('ops can update automation control and run closed-loop dry-run', async () => {
    const headers = {
      'x-rey30-ops-token': 'test-ops-token',
      'content-type': 'application/json',
    };

    const controlResponse = await usageAutomationControlPut(
      new NextRequest('http://localhost/api/ops/usage/automation-control', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          enabled: true,
          minSeverity: 'high',
          maxActionsPerRun: 5,
          cooldownMinutes: 30,
          windowStartUtc: '00:00',
          windowEndUtc: '23:59',
        }),
      })
    );
    expect(controlResponse.status).toBe(200);
    const controlPayload = await controlResponse.json();
    expect(controlPayload.ok).toBe(true);
    expect(controlPayload.control.maxActionsPerRun).toBe(5);

    const runResponse = await usageClosedLoopPost(
      new NextRequest('http://localhost/api/ops/usage/closed-loop', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          dryRun: true,
          force: true,
          months: 3,
        }),
      })
    );
    expect(runResponse.status).toBe(200);
    const runPayload = await runResponse.json();
    expect(runPayload.ok).toBe(true);
    expect(runPayload.dryRun).toBe(true);
    expect(typeof runPayload.actionsPlanned).toBe('number');
  });

  it('usage and approval user routes block anonymous access', async () => {
    const policyResponse = await usagePolicyGet(
      new NextRequest('http://localhost/api/user/usage-policy')
    );
    const summaryResponse = await usageSummaryGet(
      new NextRequest('http://localhost/api/user/usage-summary')
    );
    const insightsResponse = await usageInsightsGet(
      new NextRequest('http://localhost/api/user/usage-insights')
    );
    const finopsResponse = await usageFinopsGet(
      new NextRequest('http://localhost/api/user/usage-finops')
    );
    const exportResponse = await usageExportGet(
      new NextRequest('http://localhost/api/user/usage-export')
    );
    const budgetResponse = await budgetApprovalsGet(
      new NextRequest('http://localhost/api/user/budget-approvals')
    );
    const autopilotResponse = await usageAutopilotGet(
      new NextRequest('http://localhost/api/user/usage-autopilot')
    );

    expect(policyResponse.status).toBe(401);
    expect(summaryResponse.status).toBe(401);
    expect(insightsResponse.status).toBe(401);
    expect(finopsResponse.status).toBe(401);
    expect(exportResponse.status).toBe(401);
    expect(budgetResponse.status).toBe(401);
    expect(autopilotResponse.status).toBe(401);
  });
});
