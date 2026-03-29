import type { CharacterPreviewState } from './types';

const MIN_ZOOM = 2.1;
const MAX_ZOOM = 8;

export class PreviewViewport {
  private state: CharacterPreviewState = {
    yaw: 0.45,
    pitch: 0.1,
    zoom: 3.8,
  };

  snapshot() {
    return { ...this.state };
  }

  reset() {
    this.state = {
      yaw: 0.45,
      pitch: 0.1,
      zoom: 3.8,
    };
    return this.snapshot();
  }

  rotate(deltaYaw: number, deltaPitch = 0) {
    this.state.yaw += deltaYaw;
    this.state.pitch = Math.max(-0.45, Math.min(0.45, this.state.pitch + deltaPitch));
    return this.snapshot();
  }

  zoomBy(delta: number) {
    this.state.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.state.zoom + delta));
    return this.snapshot();
  }
}
