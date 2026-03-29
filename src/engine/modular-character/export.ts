import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { LoadedModularCharacterBundle } from './analysis';
import type { ModularExportProfile, PartAssignmentDraft } from './types';

function isBoneObject(node: THREE.Object3D): node is THREE.Bone {
  return (node as THREE.Bone).isBone === true;
}

function pruneScene(root: THREE.Object3D, keepNodePaths: Set<string>) {
  const sweep = (node: THREE.Object3D) => {
    [...node.children].forEach((child) => {
      sweep(child);

      const childPath = String(child.userData.rey30NodePath || '');
      const mesh = child as THREE.Mesh;
      const isRequiredNode =
        isBoneObject(child) ||
        keepNodePaths.has(childPath) ||
        child.children.some((grandChild) => isBoneObject(grandChild));

      if (mesh.isMesh && !keepNodePaths.has(childPath)) {
        node.remove(child);
        return;
      }

      if (!mesh.isMesh && !isBoneObject(child) && child.children.length === 0 && !isRequiredNode) {
        node.remove(child);
      }
    });
  };

  sweep(root);
}

function exportGroupToGlb(
  scene: THREE.Object3D,
  animations: THREE.AnimationClip[]
): Promise<Uint8Array> {
  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(new Uint8Array(result));
          return;
        }

        resolve(new TextEncoder().encode(JSON.stringify(result, null, 2)));
      },
      (error) => reject(error),
      {
        binary: true,
        includeCustomExtensions: true,
        animations,
      }
    );
  });
}

export interface ExportedModularPartFile {
  assignment: PartAssignmentDraft;
  file: File;
  bytes: Uint8Array;
}

export async function exportAssignmentsToGlb(params: {
  bundle: LoadedModularCharacterBundle;
  assignments: PartAssignmentDraft[];
  exportProfile: ModularExportProfile;
}): Promise<ExportedModularPartFile[]> {
  const results: ExportedModularPartFile[] = [];

  for (const assignment of params.assignments) {
    const clonedScene = params.bundle.cloneScene();
    pruneScene(clonedScene, new Set(assignment.nodePaths));

    const animations =
      params.exportProfile === 'static-modular' || !assignment.hasRig
        ? []
        : params.bundle.animations;

    const bytes = await exportGroupToGlb(clonedScene, animations);
    const fileBytes = Uint8Array.from(bytes);
    const file = new File([fileBytes], assignment.exportFileName, {
      type: 'model/gltf-binary',
    });

    results.push({
      assignment,
      file,
      bytes,
    });
  }

  return results;
}
