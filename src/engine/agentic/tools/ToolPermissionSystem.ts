import type { AgentRole } from '../schemas';

export type ToolPermissionMap = Record<AgentRole, string[]>;

export const DEFAULT_TOOL_PERMISSIONS: ToolPermissionMap = {
  project_manager: ['scene.analyze', 'world.inspect', 'build.validateScene', 'build.generateReport'],
  scene_architect: [
    'scene.analyze',
    'scene.create',
    'scene.modify',
    'scene.moveObject',
    'scene.groupObjects',
    'scene.duplicateObject',
    'scene.deleteObject',
    'entity.create',
    'entity.editHierarchy',
    'entity.editTransform',
  ],
  modeling: [
    'entity.create',
    'entity.assignComponent',
    'entity.editTransform',
    'material.create',
    'material.change',
    'asset.import',
    'asset.register',
  ],
  animation: [
    'animation.createClip',
    'animation.attachClip',
    'animation.editTimeline',
    'animation.assignState',
  ],
  gameplay: ['script.create', 'script.attach', 'script.updateParameters', 'trigger.register'],
  technical_integration: ['build.validateScene', 'build.export', 'build.generateReport', 'asset.validate', 'asset.reindex'],
  maintenance: [
    'scene.analyze',
    'world.inspect',
    'scene.modify',
    'scene.deleteObject',
    'entity.editHierarchy',
    'asset.validate',
    'asset.reindex',
    'physics.fixBasicCollisions',
  ],
  lighting_environment: [
    'lighting.adjustLight',
    'environment.configureFog',
    'environment.changeSky',
    'material.change',
  ],
  physics: [
    'physics.addCollider',
    'physics.adjustRigidbody',
    'physics.fixBasicCollisions',
    'physics.applyPreset',
    'entity.assignComponent',
  ],
  final_delivery_validator: [],
};

export class ToolPermissionSystem {
  constructor(private readonly permissions: ToolPermissionMap = DEFAULT_TOOL_PERMISSIONS) {}

  canAgentUseTool(agentRole: AgentRole, toolName: string): boolean {
    return this.getAllowedTools(agentRole).includes(toolName);
  }

  getAllowedTools(agentRole: AgentRole): string[] {
    return [...(this.permissions[agentRole] ?? [])];
  }
}
