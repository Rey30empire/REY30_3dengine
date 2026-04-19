import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  listRuntimeForensicsPrometheusIncidents,
  runtimeForensicsPrometheusIncidentsToCsv,
} from '@/lib/server/runtime-forensics-prometheus-incidents';

function readLimit(request: NextRequest): number {
  const value = Number(new URL(request.url).searchParams.get('limit') || 100);
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(500, Math.round(value)));
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const searchParams = new URL(request.url).searchParams;
    const format = searchParams.get('format');
    const incidents = await listRuntimeForensicsPrometheusIncidents(readLimit(request));

    if (format === 'csv') {
      return new Response(runtimeForensicsPrometheusIncidentsToCsv(incidents), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="runtime-forensics-prometheus-incidents.csv"',
        },
      });
    }

    if (format === 'json') {
      return new Response(
        JSON.stringify(
          {
            ok: true,
            exportedAt: new Date().toISOString(),
            incidentCount: incidents.length,
            incidents,
          },
          null,
          2
        ),
        {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'content-disposition': 'attachment; filename="runtime-forensics-prometheus-incidents.json"',
          },
        }
      );
    }

    return NextResponse.json({
      ok: true,
      incidentCount: incidents.length,
      incidents,
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}
