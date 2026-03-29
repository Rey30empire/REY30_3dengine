// ============================================
// Command Bus - The Nervous System
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { v4 as uuidv4 } from 'uuid';
import type {
  Command,
  CommandResult,
  CommandContext,
  CommandStatus,
  CommandRecord,
  Transaction,
  TransactionStatus,
  Checkpoint,
  ValidationResult,
  ResourceCost,
  SerializedCommand,
  HistoryEntry,
  HistoryState,
  LoggerInterface,
  EventBusInterface,
} from '../types';

// ============================================
// Command Bus Implementation
// ============================================

export class CommandBus {
  private commands: Map<string, CommandRecord> = new Map();
  private pendingQueue: string[] = [];
  private transactions: Map<string, Transaction> = new Map();
  private activeTransaction: Transaction | null = null;
  private history: HistoryState;
  private commandRegistry: Map<string, Command> = new Map();
  private logger: LoggerInterface;
  private eventBus: EventBusInterface;
  private maxHistorySize: number = 1000;

  constructor(logger: LoggerInterface, eventBus: EventBusInterface) {
    this.logger = logger;
    this.eventBus = eventBus;
    this.history = {
      entries: [],
      currentIndex: -1,
      maxEntries: this.maxHistorySize,
    };
  }

  // ============================================
  // Command Registration
  // ============================================

  registerCommand(command: Command): void {
    this.commandRegistry.set(command.type, command);
    this.logger.debug(`Registered command: ${command.type}`);
  }

  unregisterCommand(type: string): void {
    this.commandRegistry.delete(type);
    this.logger.debug(`Unregistered command: ${type}`);
  }

  getCommand(type: string): Command | undefined {
    return this.commandRegistry.get(type);
  }

  // ============================================
  // Command Submission
  // ============================================

  async submit(command: Command, ctx: CommandContext): Promise<CommandResult> {
    const record = this.createRecord(command);
    this.commands.set(record.id, record);

    try {
      // Update status
      record.status = 'validating';
      this.emitStatusChange(record);

      // Validate
      const validation = await command.validate(ctx);
      if (!validation.valid) {
        record.status = 'failed';
        record.error = validation.errors.map(e => e.message).join('; ');
        return this.createErrorResult(record.error || 'Validation failed');
      }

      // Check if we're in a transaction
      if (this.activeTransaction) {
        record.transactionId = this.activeTransaction.id;
        this.activeTransaction.commands.push(record);
      }

      // Estimate cost
      const cost = command.costEstimate();
      this.logger.debug(`Command ${command.type} cost estimate:`, cost);

      // Execute
      record.status = 'executing';
      record.startTime = Date.now();
      this.emitStatusChange(record);

      const result = await command.execute(ctx);

      record.endTime = Date.now();
      record.status = result.success ? 'completed' : 'failed';
      record.result = result;
      this.emitStatusChange(record);

      // Add to history if not in transaction
      if (!this.activeTransaction && result.success) {
        this.addToHistory(command, result);
      }

      return result;

    } catch (error) {
      record.status = 'failed';
      record.error = String(error);
      record.endTime = Date.now();
      this.emitStatusChange(record);
      return this.createErrorResult(String(error));
    }
  }

  async submitBatch(commands: Command[], ctx: CommandContext): Promise<CommandResult[]> {
    const results: CommandResult[] = [];

    for (const command of commands) {
      if (ctx.signal?.aborted) {
        break;
      }
      const result = await this.submit(command, ctx);
      results.push(result);
    }

    return results;
  }

  // ============================================
  // Command Cancellation
  // ============================================

  cancel(commandId: string): boolean {
    const record = this.commands.get(commandId);
    if (!record) return false;

    if (record.status === 'pending' || record.status === 'queued') {
      record.status = 'cancelled';
      this.emitStatusChange(record);
      return true;
    }

    return false;
  }

  // ============================================
  // Status & Query
  // ============================================

  getStatus(commandId: string): CommandStatus | null {
    return this.commands.get(commandId)?.status || null;
  }

  getRecord(commandId: string): CommandRecord | undefined {
    return this.commands.get(commandId);
  }

  getPendingCommands(): CommandRecord[] {
    return this.pendingQueue
      .map(id => this.commands.get(id))
      .filter((r): r is CommandRecord => r !== undefined);
  }

  // ============================================
  // Transactions
  // ============================================

  beginTransaction(name: string): Transaction {
    const transaction: Transaction = {
      id: uuidv4(),
      name,
      status: 'active',
      commands: [],
      startTime: Date.now(),
      checkpoints: [],
      parentTransactionId: this.activeTransaction?.id,
    };

    this.transactions.set(transaction.id, transaction);
    this.activeTransaction = transaction;
    this.logger.info(`Transaction started: ${name} (${transaction.id})`);

    return transaction;
  }

  async commitTransaction(): Promise<CommandResult> {
    if (!this.activeTransaction) {
      return this.createErrorResult('No active transaction');
    }

    const transaction = this.activeTransaction;
    
    // Check all commands completed successfully
    const failedCommands = transaction.commands.filter(c => c.status === 'failed');
    if (failedCommands.length > 0) {
      transaction.status = 'failed';
      this.logger.error(`Transaction failed: ${transaction.name}`);
      return this.createErrorResult(`${failedCommands.length} commands failed in transaction`);
    }

    // Add all successful commands to history
    transaction.commands.forEach(record => {
      if (record.result?.success && record.command) {
        const cmd = this.commandRegistry.get(record.command.type);
        if (cmd) {
          this.addToHistoryFromRecord(record);
        }
      }
    });

    transaction.status = 'committed';
    transaction.endTime = Date.now();
    this.activeTransaction = null;

    this.logger.info(`Transaction committed: ${transaction.name}`);
    this.eventBus.emit('transaction:committed', transaction);

    return {
      success: true,
      data: { transactionId: transaction.id, commandCount: transaction.commands.length },
      duration: transaction.endTime - transaction.startTime,
      sideEffects: [],
    };
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.activeTransaction) {
      return;
    }

    const transaction = this.activeTransaction;
    this.logger.info(`Rolling back transaction: ${transaction.name}`);

    // Undo commands in reverse order
    const completedCommands = transaction.commands
      .filter(c => c.status === 'completed')
      .reverse();

    for (const record of completedCommands) {
      try {
        const cmd = this.commandRegistry.get(record.command.type);
        if (cmd && record.result?.undoData) {
          await cmd.undo(this.createDefaultContext(), record.result.undoData);
        }
      } catch (error) {
        this.logger.error(`Failed to undo command ${record.id}:`, error);
      }
    }

    transaction.status = 'rolled_back';
    transaction.endTime = Date.now();
    this.activeTransaction = null;

    this.eventBus.emit('transaction:rolled_back', transaction);
  }

  createCheckpoint(label: string): Checkpoint | null {
    if (!this.activeTransaction) return null;

    const checkpoint: Checkpoint = {
      id: uuidv4(),
      label,
      commandIndex: this.activeTransaction.commands.length,
      timestamp: Date.now(),
      stateSnapshot: this.captureStateSnapshot(),
    };

    this.activeTransaction.checkpoints.push(checkpoint);
    this.logger.debug(`Checkpoint created: ${label}`);

    return checkpoint;
  }

  async rollbackToCheckpoint(checkpointId: string): Promise<void> {
    if (!this.activeTransaction) return;

    const checkpoint = this.activeTransaction.checkpoints.find(c => c.id === checkpointId);
    if (!checkpoint) return;

    // Undo all commands after the checkpoint
    const commandsToUndo = this.activeTransaction.commands
      .slice(checkpoint.commandIndex)
      .filter(c => c.status === 'completed')
      .reverse();

    for (const record of commandsToUndo) {
      try {
        const cmd = this.commandRegistry.get(record.command.type);
        if (cmd && record.result?.undoData) {
          await cmd.undo(this.createDefaultContext(), record.result.undoData);
        }
        record.status = 'undone';
      } catch (error) {
        this.logger.error(`Failed to undo command ${record.id}:`, error);
      }
    }

    // Remove undone commands from transaction
    this.activeTransaction.commands = this.activeTransaction.commands.slice(0, checkpoint.commandIndex);

    // Restore state snapshot
    this.restoreStateSnapshot(checkpoint.stateSnapshot);
  }

  // ============================================
  // Undo / Redo
  // ============================================

  async undo(steps: number = 1): Promise<void> {
    let undone = 0;

    for (let i = this.history.currentIndex; i >= 0 && undone < steps; i--) {
      const entry = this.history.entries[i];
      if (entry && !entry.undone) {
        const cmd = this.commandRegistry.get(entry.command.type);
        if (cmd && entry.result.undoData) {
          try {
            await cmd.undo(this.createDefaultContext(), entry.result.undoData);
            entry.undone = true;
            undone++;
            this.eventBus.emit('command:undone', entry);
          } catch (error) {
            this.logger.error(`Failed to undo: ${entry.command.type}`, error);
            break;
          }
        }
      }
    }

    this.history.currentIndex = Math.max(-1, this.history.currentIndex - undone);
  }

  async redo(steps: number = 1): Promise<void> {
    let redone = 0;

    for (let i = this.history.currentIndex + 1; i < this.history.entries.length && redone < steps; i++) {
      const entry = this.history.entries[i];
      if (entry && entry.undone) {
        const cmd = this.commandRegistry.get(entry.command.type);
        if (cmd) {
          try {
            await cmd.execute(this.createDefaultContext());
            entry.undone = false;
            redone++;
            this.eventBus.emit('command:redone', entry);
          } catch (error) {
            this.logger.error(`Failed to redo: ${entry.command.type}`, error);
            break;
          }
        }
      }
    }

    this.history.currentIndex = Math.min(this.history.entries.length - 1, this.history.currentIndex + redone);
  }

  markHistory(label: string): void {
    const entry = this.history.entries[this.history.currentIndex];
    if (entry) {
      entry.label = label;
    }
  }

  jumpToHistory(label: string): void {
    const index = this.history.entries.findIndex(e => e.label === label);
    if (index !== -1) {
      // Undo or redo to reach that point
      if (index < this.history.currentIndex) {
        this.undo(this.history.currentIndex - index);
      } else if (index > this.history.currentIndex) {
        this.redo(index - this.history.currentIndex);
      }
    }
  }

  // ============================================
  // Replay
  // ============================================

  async replay(logId: string, ctx: CommandContext): Promise<void> {
    const record = this.commands.get(logId);
    if (!record) return;

    const cmd = this.commandRegistry.get(record.command.type);
    if (!cmd) return;

    // Replay by executing the serialized command
    await cmd.execute(ctx);
  }

  async replayTransaction(transactionId: string, ctx: CommandContext): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) return;

    for (const record of transaction.commands) {
      if (record.status === 'completed') {
        await this.replay(record.id, ctx);
      }
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  private createRecord(command: Command): CommandRecord {
    return {
      id: uuidv4(),
      command: command.serialize(),
      status: 'pending',
      startTime: Date.now(),
    };
  }

  private createErrorResult(error: string): CommandResult {
    return {
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: error,
        recoverable: false,
      },
      duration: 0,
      sideEffects: [],
    };
  }

  private createDefaultContext(): CommandContext {
    return {
      engineState: {
        version: '1.0.0',
        fps: 60,
        frameTime: 16.67,
        gpuMemory: 0,
        systemMemory: 0,
        openSceneId: null,
        selectedEntityIds: [],
        activeTool: 'select',
        aiMode: 'OFF',
      },
      sessionId: uuidv4(),
      timestamp: Date.now(),
      eventBus: this.eventBus,
      logger: this.logger,
      permissions: new Set(['read', 'write', 'delete', 'export', 'import']),
    };
  }

  private addToHistory(command: Command, result: CommandResult): void {
    const entry: HistoryEntry = {
      id: uuidv4(),
      command: command.serialize(),
      result,
      timestamp: Date.now(),
      undone: false,
    };

    // Remove any entries after current index (for redo stack)
    this.history.entries = this.history.entries.slice(0, this.history.currentIndex + 1);
    this.history.entries.push(entry);
    this.history.currentIndex = this.history.entries.length - 1;

    // Trim old entries
    if (this.history.entries.length > this.history.maxEntries) {
      const removed = this.history.entries.length - this.history.maxEntries;
      this.history.entries = this.history.entries.slice(removed);
      this.history.currentIndex -= removed;
    }
  }

  private addToHistoryFromRecord(record: CommandRecord): void {
    const entry: HistoryEntry = {
      id: record.id,
      command: record.command,
      result: record.result!,
      timestamp: record.startTime,
      undone: false,
    };

    this.history.entries.push(entry);
    this.history.currentIndex = this.history.entries.length - 1;
  }

  private emitStatusChange(record: CommandRecord): void {
    this.eventBus.emit('command:status_changed', {
      id: record.id,
      status: record.status,
      type: record.command.type,
    });
  }

  private captureStateSnapshot(): unknown {
    // Capture engine state for rollback
    return {
      timestamp: Date.now(),
      // Add engine state here
    };
  }

  private restoreStateSnapshot(snapshot: unknown): void {
    // Restore engine state
    this.logger.debug('Restoring state snapshot:', snapshot);
  }

  // ============================================
  // Export / Import
  // ============================================

  exportLog(): SerializedCommand[] {
    return Array.from(this.commands.values()).map(r => r.command);
  }

  exportTransactionLog(transactionId: string): SerializedCommand[] | null {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) return null;
    return transaction.commands.map(r => r.command);
  }
}

// ============================================
// Default Logger Implementation
// ============================================

export class DefaultLogger implements LoggerInterface {
  private prefix: string;

  constructor(prefix: string = '[CommandBus]') {
    this.prefix = prefix;
  }

  debug(message: string, data?: unknown): void {
    console.debug(`${this.prefix} ${message}`, data || '');
  }

  info(message: string, data?: unknown): void {
    console.info(`${this.prefix} ${message}`, data || '');
  }

  warn(message: string, data?: unknown): void {
    console.warn(`${this.prefix} ${message}`, data || '');
  }

  error(message: string, data?: unknown): void {
    console.error(`${this.prefix} ${message}`, data || '');
  }
}

// ============================================
// Default Event Bus Implementation
// ============================================

export class DefaultEventBus implements EventBusInterface {
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach(handler => handler(data));
  }

  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }
}
