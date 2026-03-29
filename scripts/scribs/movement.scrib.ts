// scribs/movement.scrib.ts
// Editable Scrib

export default function movementScrib(entity, config, ctx) {
  if (config?.debug) {
    console.log('[movement]', entity?.name || ctx?.entityId);
  }
}
