import {
  type ChangeEvidence,
  type JsonObject,
  type ToolCall,
  type ToolResult,
} from '../schemas';

export function okToolResult(
  call: ToolCall,
  message: string,
  evidence: ChangeEvidence[],
  output: JsonObject = {}
): ToolResult {
  const timestamp = new Date().toISOString();
  return {
    callId: call.id,
    toolName: call.toolName,
    success: true,
    message,
    evidence,
    output,
    startedAt: timestamp,
    completedAt: timestamp,
  };
}

export function failToolResult(call: ToolCall, code: string, message: string): ToolResult {
  const timestamp = new Date().toISOString();
  return {
    callId: call.id,
    toolName: call.toolName,
    success: false,
    message,
    evidence: [],
    error: {
      code,
      message,
      recoverable: true,
    },
    startedAt: timestamp,
    completedAt: timestamp,
  };
}
