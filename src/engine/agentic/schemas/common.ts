export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export type RiskLevel = 'low' | 'medium' | 'high';

let idCounter = 0;

export function createAgenticId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function cloneJson<T extends JsonValue | undefined>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export function toIsoTimestamp(date = new Date()): string {
  return date.toISOString();
}

export const ZERO_VECTOR: Vector3 = { x: 0, y: 0, z: 0 };
export const ONE_VECTOR: Vector3 = { x: 1, y: 1, z: 1 };
