import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  executeMcpToolCalls,
  getMcpContextSummary,
  getMcpStats,
  listMcpTools,
  MCP_EXECUTION_MODE,
  MCP_GENERATION_DEPRECATED_MESSAGE,
  MCP_MINIMUM_ROLE,
  parseToolCalls,
  sanitizeMcpRouteError,
} from '@/lib/server/mcp-surface';

function isAuthError(error: unknown): boolean {
  const value = String(error || '');
  return value.includes('UNAUTHORIZED') || value.includes('FORBIDDEN');
}

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireSession(request, MCP_MINIMUM_ROLE);
  } catch (error) {
    return authErrorToResponse(error);
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const stats = getMcpStats();

  switch (action) {
    case 'tools': {
      const tools = listMcpTools();
      return NextResponse.json({
        tools,
        count: tools.length,
        categories: stats.categories,
        executableCount: stats.executableCount,
        executionMode: stats.executionMode,
      });
    }

    case 'context':
      return NextResponse.json({
        ...(await getMcpContextSummary({
          userId: user.id,
          preferredSessionId: request.headers.get('x-rey30-editor-session'),
          projectKey: request.headers.get('x-rey30-project'),
        })),
        executionMode: MCP_EXECUTION_MODE,
      });

    case 'stats':
      return NextResponse.json(stats);

    default:
      return NextResponse.json({
        status: 'ok',
        version: '2.0.0',
        toolCount: stats.total,
        executableCount: stats.executableCount,
        executionMode: stats.executionMode,
        endpoints: {
          'GET ?action=tools': 'Lista las herramientas MCP registradas',
          'GET ?action=context': 'Devuelve el contexto disponible en servidor',
          'GET ?action=stats': 'Resume cobertura y modo de ejecución',
          POST: 'Ejecuta herramientas compatibles con la superficie MCP del servidor',
          PUT: 'Obsoleto',
        },
      });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, MCP_MINIMUM_ROLE);
    const body = await request.json();
    const parsed = parseToolCalls(body);

    if (!parsed.ok) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error,
        },
        { status: parsed.status }
      );
    }

    const results = await executeMcpToolCalls(parsed.toolCalls, {
      userId: user.id,
      preferredSessionId: request.headers.get('x-rey30-editor-session'),
      projectKey: request.headers.get('x-rey30-project'),
    });
    return NextResponse.json({
      success: true,
      executionMode: MCP_EXECUTION_MODE,
      results,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: sanitizeMcpRouteError(error),
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireSession(request, MCP_MINIMUM_ROLE);
    return NextResponse.json(
      {
        success: false,
        error: MCP_GENERATION_DEPRECATED_MESSAGE,
      },
      { status: 410 }
    );
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: sanitizeMcpRouteError(error),
      },
      { status: 500 }
    );
  }
}
