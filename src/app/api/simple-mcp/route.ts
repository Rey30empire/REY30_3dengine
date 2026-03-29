// ============================================
// Simple MCP Route - Bypass Gateway
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

type SimpleToolCall = { id: string; name: string; arguments: Record<string, unknown> };
type SimpleToolResult = {
  toolCallId: string;
  status: 'success' | 'error';
  result?: { executed: boolean; tool: string };
  error?: string;
};

// Simple in-memory tool definitions
const AVAILABLE_TOOLS = [
  { name: 'tool.get_engine_state', description: 'Get current engine state' },
  { name: 'scene.create', description: 'Create a new scene' },
  { name: 'entity.create', description: 'Create an entity' },
  { name: 'entity.set_transform', description: 'Set entity transform' },
];

// GET endpoint
export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
  } catch (error) {
    return authErrorToResponse(error);
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  switch (action) {
    case 'tools':
      return NextResponse.json({
        tools: AVAILABLE_TOOLS,
        count: AVAILABLE_TOOLS.length,
      });
    
    case 'context':
      return NextResponse.json({
        engineState: {
          version: '1.0.0',
          fps: 60,
          openSceneId: null,
        },
      });
    
    default:
      return NextResponse.json({
        status: 'ok',
        version: '1.0.0',
        toolCount: AVAILABLE_TOOLS.length,
        endpoints: {
          'GET ?action=tools': 'List tools',
          'GET ?action=context': 'Get context',
          'POST': 'Execute tool calls',
          'PUT': 'AI generation',
        },
      });
  }
}

// POST endpoint - Execute tool calls
export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    const body = await request.json();
    const { toolCalls } = body;

    if (!toolCalls || !Array.isArray(toolCalls)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request: toolCalls array required',
      }, { status: 400 });
    }

    // Simulate tool execution
    const results: SimpleToolResult[] = toolCalls.map((call: { id: string; name: string; arguments: Record<string, unknown> }) => ({
      toolCallId: call.id,
      status: 'success',
      result: { executed: true, tool: call.name },
    }));

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}

// PUT endpoint - AI generation
export async function PUT(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    const body = await request.json();
    const { prompt } = body;

    if (!prompt) {
      return NextResponse.json({
        success: false,
        error: 'Prompt is required',
      }, { status: 400 });
    }

    // Analyze prompt and generate tool calls
    const toolCalls: SimpleToolCall[] = [];
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('scene') || lowerPrompt.includes('escena')) {
      toolCalls.push({
        id: 'call_1',
        name: 'scene.create',
        arguments: { name: 'New Scene' },
      });
    }

    if (lowerPrompt.includes('character') || lowerPrompt.includes('personaje')) {
      toolCalls.push({
        id: 'call_2',
        name: 'entity.create',
        arguments: { name: 'Character', archetype: 'capsule' },
      });
    }

    if (lowerPrompt.includes('terrain') || lowerPrompt.includes('terreno')) {
      toolCalls.push({
        id: 'call_3',
        name: 'entity.create',
        arguments: { name: 'Terrain', archetype: 'plane' },
      });
    }

    return NextResponse.json({
      success: true,
      prompt,
      toolCalls,
      analysis: `Analyzed prompt: "${prompt}". Generated ${toolCalls.length} tool calls.`,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}
