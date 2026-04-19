import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearStaleMetadataRevertPolicyConfigForTest } from '@/lib/server/stale-metadata-revert-policy';

const requireSessionMock = vi.fn();
const authErrorToResponseMock = vi.fn((error: unknown) =>
  Response.json(
    {
      error: String(error).includes('FORBIDDEN')
        ? 'No tienes permisos para esta acción.'
        : 'Debes iniciar sesión o usar un token de acceso.',
    },
    { status: String(error).includes('FORBIDDEN') ? 403 : 401 }
  )
);

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

describe('stale metadata revert policy route', () => {
  afterEach(() => {
    clearStaleMetadataRevertPolicyConfigForTest();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('requires OWNER access to read and update the persisted allowlist', async () => {
    requireSessionMock.mockRejectedValueOnce(new Error('FORBIDDEN'));

    const { GET } = await import('@/app/api/ai-agents/stale-revert-policy/route');
    const forbiddenResponse = await GET(
      new NextRequest('http://localhost/api/ai-agents/stale-revert-policy')
    );
    const forbiddenPayload = await forbiddenResponse.json();

    expect(forbiddenResponse.status).toBe(403);
    expect(forbiddenPayload.error).toBe('No tienes permisos para esta acción.');
    expect(requireSessionMock).toHaveBeenCalledWith(expect.any(NextRequest), 'OWNER');
  });

  it('persists allowlist changes and records a specific audit event', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'owner-1',
      role: 'OWNER',
      email: 'owner@example.com',
      sessionId: 'session-owner',
    });

    const { GET, PATCH } = await import('@/app/api/ai-agents/stale-revert-policy/route');
    const updateResponse = await PATCH(
      new NextRequest('http://localhost/api/ai-agents/stale-revert-policy', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          allowedRoles: ['OWNER', 'EDITOR'],
          reason: 'Allow editors to confirm stale metadata reverts during supervised QA.',
        }),
      })
    );
    const updatePayload = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updatePayload).toMatchObject({
      success: true,
      config: {
        policyId: 'stale_metadata_revert_confirmation_roles',
        version: 1,
        allowedRoles: ['OWNER', 'EDITOR'],
        updatedByUserId: 'owner-1',
        updatedByEmail: 'owner@example.com',
      },
      event: {
        eventType: 'stale_metadata_revert_allowlist_changed',
        actorUserId: 'owner-1',
        actorEmail: 'owner@example.com',
        beforeRoles: ['OWNER'],
        afterRoles: ['OWNER', 'EDITOR'],
        reason: 'Allow editors to confirm stale metadata reverts during supervised QA.',
      },
      policySnapshot: {
        source: 'persisted_config',
        allowedRoles: ['OWNER', 'EDITOR'],
        evaluatedRole: 'OWNER',
        allowed: true,
        configVersion: 1,
      },
    });

    const readResponse = await GET(
      new NextRequest('http://localhost/api/ai-agents/stale-revert-policy')
    );
    const readPayload = await readResponse.json();

    expect(readResponse.status).toBe(200);
    expect(readPayload.configured).toBe(true);
    expect(readPayload.config.auditTrail).toEqual([
      expect.objectContaining({
        eventType: 'stale_metadata_revert_allowlist_changed',
        beforeRoles: ['OWNER'],
        afterRoles: ['OWNER', 'EDITOR'],
      }),
    ]);

    const { GET: GET_EXPORT } = await import(
      '@/app/api/ai-agents/stale-revert-policy/export/route'
    );
    const exportResponse = await GET_EXPORT(
      new NextRequest('http://localhost/api/ai-agents/stale-revert-policy/export?format=json')
    );
    const exportPayload = JSON.parse(await exportResponse.text());

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get('content-disposition')).toContain(
      'stale-metadata-revert-policy-audit.json'
    );
    expect(exportPayload).toMatchObject({
      kind: 'stale_metadata_revert_policy_audit',
      configured: true,
      auditCount: 1,
      auditTrail: [
        expect.objectContaining({
          eventType: 'stale_metadata_revert_allowlist_changed',
          beforeRoles: ['OWNER'],
          afterRoles: ['OWNER', 'EDITOR'],
        }),
      ],
    });

    const markdownResponse = await GET_EXPORT(
      new NextRequest('http://localhost/api/ai-agents/stale-revert-policy/export?format=markdown')
    );
    const markdownPayload = await markdownResponse.text();

    expect(markdownResponse.status).toBe(200);
    expect(markdownPayload).toContain('# Stale Metadata Revert Policy Audit');
    expect(markdownPayload).toContain('beforeRoles: OWNER');
    expect(markdownPayload).toContain('afterRoles: OWNER, EDITOR');
  });

  it('rejects invalid allowlist roles without writing config', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'owner-1',
      role: 'OWNER',
      email: 'owner@example.com',
      sessionId: 'session-owner',
    });

    const { GET, PATCH } = await import('@/app/api/ai-agents/stale-revert-policy/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/ai-agents/stale-revert-policy', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          allowedRoles: ['EDITOR', 'ADMIN'],
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      success: false,
      invalidValues: ['ADMIN'],
    });

    const readResponse = await GET(
      new NextRequest('http://localhost/api/ai-agents/stale-revert-policy')
    );
    const readPayload = await readResponse.json();
    expect(readPayload.configured).toBe(false);
  });

  it('paginates allowlist audit events and resets persisted config back to env with an audit event', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'owner-1',
      role: 'OWNER',
      email: 'owner@example.com',
      sessionId: 'session-owner',
    });

    const { GET, PATCH, DELETE } = await import('@/app/api/ai-agents/stale-revert-policy/route');

    for (const roles of [
      ['OWNER', 'EDITOR'],
      ['OWNER', 'EDITOR', 'VIEWER'],
      ['OWNER'],
    ]) {
      const response = await PATCH(
        new NextRequest('http://localhost/api/ai-agents/stale-revert-policy?auditLimit=2&auditOffset=0', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            allowedRoles: roles,
            reason: `Policy pagination test ${roles.join('-')}`,
          }),
        })
      );
      expect(response.status).toBe(200);
    }

    const firstPageResponse = await GET(
      new NextRequest('http://localhost/api/ai-agents/stale-revert-policy?auditLimit=2&auditOffset=0')
    );
    const firstPagePayload = await firstPageResponse.json();

    expect(firstPageResponse.status).toBe(200);
    expect(firstPagePayload).toMatchObject({
      configured: true,
      auditEventType: 'all',
      auditCount: 2,
      totalAuditCount: 3,
      auditPagination: {
        limit: 2,
        offset: 0,
        total: 3,
        hasMore: true,
        nextOffset: 2,
      },
    });
    expect(firstPagePayload.auditTrail[0]).toMatchObject({
      afterRoles: ['OWNER'],
    });

    const { GET: GET_AUDIT } = await import(
      '@/app/api/ai-agents/stale-revert-policy/audit/route'
    );
    const filteredAuditResponse = await GET_AUDIT(
      new NextRequest(
        'http://localhost/api/ai-agents/stale-revert-policy/audit?limit=2&offset=0&eventType=stale_metadata_revert_allowlist_changed'
      )
    );
    const filteredAuditPayload = await filteredAuditResponse.json();

    expect(filteredAuditResponse.status).toBe(200);
    expect(filteredAuditPayload).toMatchObject({
      success: true,
      eventType: 'stale_metadata_revert_allowlist_changed',
      auditCount: 2,
      totalAuditCount: 3,
      auditPagination: {
        limit: 2,
        offset: 0,
        total: 3,
        hasMore: true,
        nextOffset: 2,
      },
    });
    expect(filteredAuditPayload.auditTrail).toEqual([
      expect.objectContaining({
        eventType: 'stale_metadata_revert_allowlist_changed',
      }),
      expect.objectContaining({
        eventType: 'stale_metadata_revert_allowlist_changed',
      }),
    ]);

    const actorAuditResponse = await GET_AUDIT(
      new NextRequest(
        'http://localhost/api/ai-agents/stale-revert-policy/audit?limit=2&offset=0&actor=owner%40example.com'
      )
    );
    const actorAuditPayload = await actorAuditResponse.json();

    expect(actorAuditResponse.status).toBe(200);
    expect(actorAuditPayload).toMatchObject({
      actorFilter: 'owner@example.com',
      auditCount: 2,
      totalAuditCount: 3,
    });

    const emptyActorAuditResponse = await GET_AUDIT(
      new NextRequest(
        'http://localhost/api/ai-agents/stale-revert-policy/audit?limit=2&offset=0&actor=missing%40example.com'
      )
    );
    const emptyActorAuditPayload = await emptyActorAuditResponse.json();

    expect(emptyActorAuditResponse.status).toBe(200);
    expect(emptyActorAuditPayload).toMatchObject({
      actorFilter: 'missing@example.com',
      auditCount: 0,
      totalAuditCount: 0,
      auditTrail: [],
    });

    const futureDateAuditResponse = await GET_AUDIT(
      new NextRequest(
        'http://localhost/api/ai-agents/stale-revert-policy/audit?limit=2&offset=0&from=2999-01-01T00%3A00%3A00.000Z'
      )
    );
    const futureDateAuditPayload = await futureDateAuditResponse.json();

    expect(futureDateAuditResponse.status).toBe(200);
    expect(futureDateAuditPayload).toMatchObject({
      dateFromFilter: '2999-01-01T00:00:00.000Z',
      dateToFilter: null,
      auditCount: 0,
      totalAuditCount: 0,
      auditTrail: [],
    });

    const invalidDateAuditResponse = await GET_AUDIT(
      new NextRequest(
        'http://localhost/api/ai-agents/stale-revert-policy/audit?limit=2&offset=0&from=not-a-date'
      )
    );
    const invalidDateAuditPayload = await invalidDateAuditResponse.json();

    expect(invalidDateAuditResponse.status).toBe(400);
    expect(invalidDateAuditPayload).toMatchObject({
      success: false,
      error: 'from debe ser una fecha válida.',
    });

    const { GET: GET_EXPORT } = await import(
      '@/app/api/ai-agents/stale-revert-policy/export/route'
    );
    const pageExportResponse = await GET_EXPORT(
      new NextRequest(
        'http://localhost/api/ai-agents/stale-revert-policy/export?format=json&eventType=stale_metadata_revert_allowlist_changed&actor=owner%40example.com&from=1970-01-01T00%3A00%3A00.000Z&to=2999-01-01T00%3A00%3A00.000Z&exportScope=page&limit=1&offset=1'
      )
    );
    const pageExportPayload = JSON.parse(await pageExportResponse.text());

    expect(pageExportResponse.status).toBe(200);
    expect(pageExportPayload).toMatchObject({
      configured: true,
      eventTypeFilter: 'stale_metadata_revert_allowlist_changed',
      actorFilter: 'owner@example.com',
      dateFromFilter: '1970-01-01T00:00:00.000Z',
      dateToFilter: '2999-01-01T00:00:00.000Z',
      exportScope: 'page',
      auditCount: 1,
      totalAuditCount: 3,
      pagination: {
        limit: 1,
        offset: 1,
        total: 3,
        hasMore: true,
        nextOffset: 2,
      },
    });

    const resetResponse = await DELETE(
      new NextRequest('http://localhost/api/ai-agents/stale-revert-policy?auditLimit=2&auditOffset=0', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason: 'Return to environment controlled default policy.',
        }),
      })
    );
    const resetPayload = await resetResponse.json();

    expect(resetResponse.status).toBe(200);
    expect(resetPayload).toMatchObject({
      success: true,
      configured: false,
      config: null,
      event: {
        eventType: 'stale_metadata_revert_allowlist_reset_to_env',
        beforeRoles: ['OWNER'],
        afterRoles: ['OWNER'],
        reason: 'Return to environment controlled default policy.',
      },
      policySnapshot: {
        source: 'env',
      },
      totalAuditCount: 4,
    });

    const exportResponse = await GET_EXPORT(
      new NextRequest(
        'http://localhost/api/ai-agents/stale-revert-policy/export?format=json&eventType=stale_metadata_revert_allowlist_reset_to_env&exportScope=all'
      )
    );
    const exportPayload = JSON.parse(await exportResponse.text());

    expect(exportResponse.status).toBe(200);
    expect(exportPayload).toMatchObject({
      configured: false,
      eventTypeFilter: 'stale_metadata_revert_allowlist_reset_to_env',
      exportScope: 'all',
      auditCount: 1,
      totalAuditCount: 1,
      auditTrail: [
        expect.objectContaining({
          eventType: 'stale_metadata_revert_allowlist_reset_to_env',
        }),
      ],
    });
  });
});
