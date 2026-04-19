# Agentic Legacy Boundaries

This file marks the current boundary between the new agentic architecture and
older AI/tooling modules.

## New Source Of Truth

```txt
src/engine/agentic/
```

This is the only approved place for the new multi-agent execution pipeline.

## Legacy Or Adapter-Only Areas

These areas are useful but must not be treated as the new architecture:

```txt
src/engine/ai/
src/engine/agents/
src/engine/command/tools/
scripts/*.generated.ts
```

Rules:

- Existing code may be reused through explicit adapters.
- Generated scripts with placeholder logic are not valid proof of gameplay AI.
- Legacy command tools must not bypass `ToolPermissionSystem`.
- Old agent classes must not be renamed and presented as agentic execution.

## Next Cleanup Pass

1. Show agentic traces/progress in the chat UI instead of only returning a summary message.
2. Expand editor-backed adapter coverage to animation clips, materials and build/export.
3. Move any reusable command tool logic behind agentic tool wrappers.
4. Mark placeholder generated scripts as experimental in the UI or remove them from validation paths.
5. Delete duplicate agent surfaces only after equivalent agentic tests exist.
