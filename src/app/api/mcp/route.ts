// ============================================
// MCP API Route - Self-contained version
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

// Tool definitions (self-contained)
const AVAILABLE_TOOLS = [
  // MVP Tools
  { name: 'tool.get_engine_state', description: 'Get current engine state', category: 'MVP' },
  { name: 'tool.get_project_tree', description: 'Get project folder structure', category: 'MVP' },
  { name: 'tool.search_assets', description: 'Search for assets', category: 'MVP' },
  { name: 'tool.get_selection', description: 'Get selected entities', category: 'MVP' },
  { name: 'tool.set_selection', description: 'Set selection', category: 'MVP' },
  
  // Scene Tools
  { name: 'scene.create', description: 'Create a new scene', category: 'Scene' },
  { name: 'scene.open', description: 'Open a scene', category: 'Scene' },
  { name: 'scene.save', description: 'Save current scene', category: 'Scene' },
  { name: 'scene.set_sky', description: 'Set skybox', category: 'Scene' },
  { name: 'scene.add_fog', description: 'Add fog to scene', category: 'Scene' },
  
  // Entity Tools
  { name: 'entity.create', description: 'Create an entity', category: 'Entity' },
  { name: 'entity.delete', description: 'Delete an entity', category: 'Entity' },
  { name: 'entity.set_transform', description: 'Set entity transform', category: 'Entity' },
  { name: 'entity.add_component', description: 'Add component to entity', category: 'Entity' },
  { name: 'entity.clone', description: 'Clone an entity', category: 'Entity' },
  
  // Physics Tools
  { name: 'phys.add_collider', description: 'Add collider to entity', category: 'Physics' },
  { name: 'phys.add_rigidbody', description: 'Add rigidbody to entity', category: 'Physics' },
  { name: 'phys.add_character_controller', description: 'Add character controller', category: 'Physics' },
  
  // Render Tools
  { name: 'render.create_light', description: 'Create a light', category: 'Render' },
  { name: 'render.set_quality', description: 'Set render quality', category: 'Render' },
  { name: 'render.set_postprocess', description: 'Configure post-processing', category: 'Render' },
  
  // Gameplay Tools
  { name: 'game.create_weapon', description: 'Create a weapon', category: 'Gameplay' },
  { name: 'game.create_input_action', description: 'Create input action', category: 'Gameplay' },
  { name: 'game.add_health_component', description: 'Add health to entity', category: 'Gameplay' },
  
  // VFX Tools
  { name: 'vfx.create_particle_system', description: 'Create particle system', category: 'VFX' },
  
  // Water Tools
  { name: 'water.create_ocean', description: 'Create ocean/water', category: 'Water' },
  
  // Mount Tools
  { name: 'mount.create_horse', description: 'Create a horse', category: 'Mount' },
  
  // Generator Tools
  { name: 'gen.create_game_from_template', description: 'Create game from template', category: 'Generator' },
  { name: 'gen.plan_from_prompt', description: 'Plan from natural language', category: 'Generator' },
  { name: 'gen.create_platformer_level', description: 'Generate platformer level', category: 'Generator' },
  { name: 'gen.create_shooter_arena', description: 'Generate shooter arena', category: 'Generator' },
  { name: 'gen.create_island_adventure', description: 'Generate island adventure', category: 'Generator' },
  
  // Build Tools
  { name: 'build.set_target', description: 'Set build target platform', category: 'Build' },
  { name: 'build.export_project', description: 'Export project', category: 'Build' },
  { name: 'build.build_and_run', description: 'Build and run game', category: 'Build' },
];

const TOOL_STATS = {
  total: AVAILABLE_TOOLS.length,
  categories: [...new Set(AVAILABLE_TOOLS.map(t => t.category))],
};

const DEPRECATED_MESSAGE =
  'MCP AI generation deshabilitado en este endpoint. Usa /api/ai-chat con configuración BYOK por usuario.';

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
        categories: TOOL_STATS.categories,
      });

    case 'context':
      return NextResponse.json({
        engineState: {
          version: '1.0.0',
          fps: 60,
          frameTime: 16.67,
          gpuMemory: 0,
          systemMemory: 0,
          openSceneId: null,
          selectedEntityIds: [],
          activeTool: 'select',
          aiMode: 'API',
        },
        projectTree: {
          type: 'folder',
          name: 'Project',
          path: '/',
          children: [
            { type: 'folder', name: 'Scenes', path: '/Scenes', children: [] },
            { type: 'folder', name: 'Assets', path: '/Assets', children: [] },
          ],
        },
        constraints: {
          targetFps: 60,
          targetResolution: { width: 1920, height: 1080 },
          maxMemoryMB: 2048,
          platforms: ['windows', 'linux', 'macos', 'web'],
        },
      });

    case 'stats':
      return NextResponse.json(TOOL_STATS);

    default:
      return NextResponse.json({
        status: 'ok',
        version: '1.0.0',
        toolCount: AVAILABLE_TOOLS.length,
        endpoints: {
          'GET ?action=tools': 'List all available tools',
          'GET ?action=context': 'Get current engine context',
          'GET ?action=stats': 'Get tool statistics',
          'POST': 'Execute tool calls',
          'PUT': 'AI-powered game generation',
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
    const results = toolCalls.map((call: { id: string; name: string; arguments: Record<string, unknown> }) => {
      const tool = AVAILABLE_TOOLS.find(t => t.name === call.name);
      
      if (!tool) {
        return {
          toolCallId: call.id,
          status: 'error',
          error: `Tool not found: ${call.name}`,
        };
      }

      // Simulate successful execution
      return {
        toolCallId: call.id,
        status: 'success',
        result: {
          executed: true,
          tool: call.name,
          arguments: call.arguments,
        },
      };
    });

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

// PUT endpoint - AI-powered game generation
export async function PUT(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    return NextResponse.json(
      {
        success: false,
        error: DEPRECATED_MESSAGE,
      },
      { status: 410 }
    );
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
