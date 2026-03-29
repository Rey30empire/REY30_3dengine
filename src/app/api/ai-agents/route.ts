// ============================================
// AI Agent Levels API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import {
  AGENT_LEVELS,
  CHARACTER_PIPELINE,
  createPipelinePlan,
  type AgentLevelId,
} from '@/engine/ai/agent-levels';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

type PlanRequestBody = {
  prompt?: string;
  level?: AgentLevelId;
  style?: string;
  target?: string;
  rigRequired?: boolean;
};

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    return NextResponse.json({
      levels: AGENT_LEVELS,
      pipeline: CHARACTER_PIPELINE,
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    const body = (await request.json()) as PlanRequestBody;
    const prompt = (body.prompt || '').trim();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const plan = createPipelinePlan({
      prompt,
      level: body.level || 'level1_copilot',
      style: body.style,
      target: body.target,
      rigRequired: body.rigRequired,
    });

    return NextResponse.json({
      success: true,
      plan,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
