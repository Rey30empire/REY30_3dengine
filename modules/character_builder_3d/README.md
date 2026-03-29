# CharacterBuilder3D Ruby Module

`CharacterBuilder3D` is an isolated Ruby package for modular 3D character assembly.
It is kept outside the active Next.js runtime on purpose so the current app behavior stays unchanged.

## What is included

- `CharacterBuilder3D::CharacterBuilder3D` as the main orchestrator
- `PartLibrary` for folder, JSON, and repository loading
- `CharacterAssembler` for node loading, replacement, and material updates
- `DragDropController` for drag hover, zone detection, and drop application
- `CompatibilityValidator` for category, skeleton, body type, and socket rules
- `PreviewViewport` for preview camera control
- `PresetSaver` for JSON save and load
- `EngineAdapter` as the only required bridge to the real engine

## Package layout

```text
modules/character_builder_3d/
  README.md
  examples/
    sample_parts.json
    sample_preset.json
  lib/
    character_builder_3d.rb
    character_builder_3d/
      character_builder_3d.rb
      character_assembler.rb
      character_state.rb
      compatibility_report.rb
      compatibility_validator.rb
      drag_drop_controller.rb
      engine_adapter.rb
      errors.rb
      part.rb
      part_library.rb
      preset_saver.rb
      preview_viewport.rb
```

## Integration points for this repo

The Ruby package does not guess hidden engine methods.
Instead, the adapter names line up with concepts that already exist in the current codebase:

- Model loading: [src/engine/rendering/ModelLoader.ts](/C:/Users/rey30/REY30_3dengine/src/engine/rendering/ModelLoader.ts)
- Skeleton and avatar metadata: [src/engine/animation/Avatar.ts](/C:/Users/rey30/REY30_3dengine/src/engine/animation/Avatar.ts)
- Thumbnail rendering: [src/engine/editor/visualThumbnails.tsx](/C:/Users/rey30/REY30_3dengine/src/engine/editor/visualThumbnails.tsx)
- Existing editor drag patterns: [src/engine/editor/AssetBrowserPanel.tsx](/C:/Users/rey30/REY30_3dengine/src/engine/editor/AssetBrowserPanel.tsx)

## Minimal usage

```ruby
require_relative 'lib/character_builder_3d'

class MyEngineAdapter < CharacterBuilder3D::EngineAdapter
  # Implement the adapter methods with your real engine API.
end

builder = CharacterBuilder3D::CharacterBuilder3D.new(
  engine_adapter: MyEngineAdapter.new
)

builder.load_library_from_json('modules/character_builder_3d/examples/sample_parts.json')
builder.set_base_character('body_human_female_medium_v1')
builder.apply_part('hair_long_01')
builder.apply_part('torso_hoodie_01')
builder.save_preset('Assets/Characters/Presets/casual_character.json')
```

## Notes

- Ruby is not installed in the current workspace runtime, so this package is delivered as source-only integration code.
- The module is safe to add because nothing in the current TypeScript build imports it.
- If you want, the next step can be a TS bridge panel inside the editor that drives this same data model.
