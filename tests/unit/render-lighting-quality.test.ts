import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LightingSystem } from '@/engine/rendering/LightingSystem';
import { GlobalIlluminationFeature } from '@/engine/rendering/RenderPipeline';

describe('render lighting quality', () => {
  it('bakes approximate lightmaps with uv2 and applies them to materials', async () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9b38f') })
    );
    mesh.name = 'TestCrate';
    scene.add(mesh);

    const ambient = new THREE.AmbientLight(new THREE.Color('#666b78'), 0.4);
    const directional = new THREE.DirectionalLight(new THREE.Color('#fff2d6'), 1.1);
    directional.position.set(3, 5, 2);
    scene.add(ambient);
    scene.add(directional);

    const lighting = new LightingSystem();
    await lighting.bakeLightmaps(scene);

    const bakedMaterial = mesh.material as THREE.MeshStandardMaterial;
    expect(mesh.geometry.getAttribute('uv2')).toBeTruthy();
    expect(bakedMaterial.lightMap).toBeInstanceOf(THREE.DataTexture);
    expect(bakedMaterial.lightMapIntensity).toBe(1);
    expect(scene.userData.lightmapBakeSummary).toMatchObject({
      bakedMeshes: 1,
      lights: 2,
    });

    lighting.clearBakedLightmaps(scene);
    expect(bakedMaterial.lightMap).toBeNull();
    expect(scene.userData.lightmapBakeSummary).toBeUndefined();
  });

  it('computes GI volume data and applies bounce lighting to emissive-capable materials', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 1.5, 4);
    camera.lookAt(0, 0.75, 0);

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1.5, 1),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color('#8aa4d9'),
        emissive: new THREE.Color(0, 0, 0),
        emissiveIntensity: 0,
      })
    );
    scene.add(mesh);
    scene.add(new THREE.AmbientLight(new THREE.Color('#556070'), 0.35));

    const directional = new THREE.DirectionalLight(new THREE.Color('#fff0c8'), 1.25);
    directional.position.set(4, 6, 3);
    scene.add(directional);

    const gi = new GlobalIlluminationFeature();
    gi.enabled = true;
    gi.setBounceCount(2);
    gi.initialize({} as unknown as THREE.WebGLRenderer, scene);
    gi.render({} as unknown as THREE.WebGLRenderer, scene, camera);

    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(scene.userData.globalIllumination).toMatchObject({
      enabled: true,
      appliedMeshes: 1,
      bounceCount: 2,
      lights: 2,
    });
    expect(material.emissiveIntensity).toBeGreaterThan(0);
    expect(material.emissive.getHex()).not.toBe(0x000000);

    gi.dispose();
    expect(material.emissiveIntensity).toBe(0);
    expect(material.emissive.getHex()).toBe(0x000000);
  });
});
