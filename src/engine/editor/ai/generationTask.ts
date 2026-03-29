export interface GenerationTask {
  id: string;
  type: 'preview' | 'refine' | 'character';
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
  progress: number;
  stage?: string;
  provider?: 'meshy' | 'profile_a' | 'local_fallback';
  modelUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}
