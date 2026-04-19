export type StorageBackend = 'filesystem' | 'netlify-blobs';
export type StorageScope = 'filesystem' | 'deploy' | 'global';

export interface StorageObjectRef {
  key: string;
  backend: StorageBackend;
  scope: StorageScope;
  root?: string;
  storeName?: string;
  checksum?: string;
}

export interface StorageAdapterInfo {
  backend: StorageBackend;
  scope: StorageScope;
  root?: string;
  storeName?: string;
}

export interface StorageAdapterStatus extends StorageAdapterInfo {
  available: boolean;
  error?: string;
}

export interface StorageAdapter<TRecord, TWriteInput = unknown> {
  getInfo(env?: NodeJS.ProcessEnv): StorageAdapterInfo;
  getStatus(): Promise<StorageAdapterStatus>;
  list(): Promise<TRecord[]>;
  get(key: string): Promise<TRecord | null>;
  put(input: TWriteInput): Promise<TRecord>;
  delete(key: string): Promise<void>;
  resolveVirtualFileName(key: string): string;
}
