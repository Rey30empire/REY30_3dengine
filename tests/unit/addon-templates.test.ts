import { describe, expect, it } from 'vitest';
import {
  ADDON_INSTALL_TEMPLATES,
  findAddonTemplate,
  getAddonTemplatesByKind,
} from '@/lib/addon-templates';

describe('addon templates', () => {
  it('exposes tooling and content pack templates for core engine workflows', () => {
    expect(ADDON_INSTALL_TEMPLATES.map((template) => template.id)).toEqual(
      expect.arrayContaining([
        'animation_toolkit_starter',
        'material_studio_essentials',
        'materials_core_pack',
        'vfx_core_pack',
        'animation_starter_pack',
        'ambient_fx_pack',
        'boss_arena_pack',
        'horror_fog_scene_pack',
        'scifi_material_lab_pack',
        'animation_demo_stage_pack',
      ])
    );
  });

  it('finds a template by id', () => {
    const animationTemplate = findAddonTemplate('animation_starter_pack');
    expect(animationTemplate?.category).toBe('animation');
    expect(animationTemplate?.workspaceHints).toContain('animation');
    expect(animationTemplate?.kind).toBe('content-pack');
  });

  it('groups templates by kind', () => {
    const tooling = getAddonTemplatesByKind('tooling');
    const contentPacks = getAddonTemplatesByKind('content-pack');

    expect(tooling.map((template) => template.id)).toEqual(
      expect.arrayContaining(['animation_toolkit_starter', 'material_studio_essentials'])
    );
    expect(contentPacks.map((template) => template.id)).toEqual(
      expect.arrayContaining([
        'materials_core_pack',
        'vfx_core_pack',
        'animation_starter_pack',
        'ambient_fx_pack',
        'boss_arena_pack',
        'horror_fog_scene_pack',
        'scifi_material_lab_pack',
        'animation_demo_stage_pack',
      ])
    );
  });

  it('returns null when template id is unknown', () => {
    expect(findAddonTemplate('missing-template')).toBeNull();
  });
});
