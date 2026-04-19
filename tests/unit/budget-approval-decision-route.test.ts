import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const requireSessionMock = vi.fn();
const logSecurityEventMock = vi.fn();
const authErrorToResponseMock = vi.fn(() =>
  NextResponse.json({ error: 'auth error' }, { status: 401 })
);
const hasValidOpsTokenMock = vi.fn();
const decideBudgetApprovalRequestMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  logSecurityEvent: logSecurityEventMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/security/ops-token', () => ({
  hasValidOpsToken: hasValidOpsTokenMock,
}));

vi.mock('@/lib/security/usage-finops', () => ({
  decideBudgetApprovalRequest: decideBudgetApprovalRequestMock,
}));

describe('budget approval decision route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('audits approval decisions as critical events', async () => {
    hasValidOpsTokenMock.mockReturnValue(true);
    requireSessionMock.mockRejectedValue(new Error('UNAUTHORIZED'));
    decideBudgetApprovalRequestMock.mockResolvedValue({
      id: 'req-1',
      status: 'APPROVED',
    });

    const { POST } = await import('@/app/api/ops/usage/approvals/[requestId]/decision/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ops/usage/approvals/req-1/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-rey30-ops-token': 'test-ops-token' },
        body: JSON.stringify({ decision: 'approve' }),
      }),
      { params: Promise.resolve({ requestId: 'req-1' }) }
    );

    expect(response.status).toBe(200);
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ops.budget_approval.decide',
        target: 'req-1',
        status: 'allowed',
        metadata: { decision: 'approve' },
        durability: 'critical',
      })
    );
  });
});
