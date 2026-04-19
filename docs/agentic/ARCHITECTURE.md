# Rey30 Agentic Architecture

This is the executable agentic foundation for scene and gameplay editing.

## Runtime Flow

```txt
User request
-> AI chat command bridge
-> IntentAnalyzer
-> TaskPlanner
-> MasterOrchestrator
-> AgentRegistry
-> ToolPermissionSystem
-> ToolRegistry
-> WorldStateManager
-> FinalDeliveryValidatorAgent
-> replan or approve
```

## Module Map

```txt
src/engine/agentic/
  intent/       request normalization and structured intent extraction
  planning/     task plan creation and agent assignment
  agents/       specialized agents with role-scoped tools
  tools/        real WorldState mutations with evidence
  execution/    MasterOrchestrator and pipeline executor
  validation/   final delivery validator and retry decisions
  memory/       WorldState and pipeline execution state
  schemas/      strict contracts used across the pipeline
  telemetry/    structured traces for observability
  examples/     runnable scenario entry points
```

## Current Integration Contract

The agentic system can run in two modes:

- Pure mode: tools mutate only `WorldState`.
- Editor-backed mode: tools mutate the existing editor store and then mirror the
  result into `WorldState`.

Editor-backed integration lives behind:

```txt
src/engine/agentic/tools/adapters/sceneStoreAdapter.ts
src/engine/agentic/tools/createEditorBackedToolRegistry.ts
src/engine/editor/ai/agenticCommandBridge.ts
```

Agents still do not import React panels, Zustand slices or legacy command tools.

Approved integration direction:

```txt
agentic tools -> adapter -> existing editor/project store
```

Forbidden direction:

```txt
agent -> editor panel
agent -> arbitrary Zustand mutation
validator -> UI state
```

## Proof Points

The current base has tests for:

- fog, lighting and layout pipeline
- NPC creation with patrol script and physics
- dark environment correction
- validator rejection followed by replan and approval
- editor-backed fog, lighting and layout mutations through the real store
- editor-backed NPC creation with Script, Collider, Rigidbody and script asset
- chat command bridge that routes supported scene-edit prompts to the agentic pipeline
- guard that keeps asset-only prompts such as downloadable GLB generation out of the agentic editor path
