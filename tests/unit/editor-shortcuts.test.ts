import { describe, expect, it } from 'vitest';
import {
  createDefaultEditorShortcutConfig,
  eventMatchesAnyShortcut,
  eventMatchesShortcut,
  findShortcutConflicts,
  formatShortcutCombo,
  getPrimaryShortcutLabel,
  normalizeShortcutCombo,
} from '@/lib/editor-shortcuts';

function createKeyboardEvent(
  key: string,
  modifiers?: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>>
) {
  return {
    key,
    ctrlKey: modifiers?.ctrlKey ?? false,
    metaKey: modifiers?.metaKey ?? false,
    altKey: modifiers?.altKey ?? false,
    shiftKey: modifiers?.shiftKey ?? false,
  } as KeyboardEvent;
}

describe('editor shortcuts', () => {
  it('normalizes and formats combos consistently', () => {
    expect(normalizeShortcutCombo(' Shift + Ctrl/Cmd + k ')).toBe('mod+shift+k');
    expect(formatShortcutCombo('mod+shift+k')).toBe('Ctrl/Cmd+Shift+K');
  });

  it('matches Ctrl/Cmd shortcuts on both control and meta keyboards', () => {
    const ctrlEvent = createKeyboardEvent('k', { ctrlKey: true });
    const metaEvent = createKeyboardEvent('k', { metaKey: true });
    const wrongEvent = createKeyboardEvent('k', { ctrlKey: true, shiftKey: true });

    expect(eventMatchesShortcut(ctrlEvent, 'Ctrl/Cmd+K')).toBe(true);
    expect(eventMatchesShortcut(metaEvent, 'Ctrl/Cmd+K')).toBe(true);
    expect(eventMatchesShortcut(wrongEvent, 'Ctrl/Cmd+K')).toBe(false);
  });

  it('supports aliases and special keys for selection/history commands', () => {
    const deleteEvent = createKeyboardEvent('Delete');
    const backspaceEvent = createKeyboardEvent('Backspace');
    const redoEvent = createKeyboardEvent('z', { ctrlKey: true, shiftKey: true });

    expect(eventMatchesAnyShortcut(deleteEvent, ['Delete', 'Backspace'])).toBe(true);
    expect(eventMatchesAnyShortcut(backspaceEvent, ['Delete', 'Backspace'])).toBe(true);
    expect(eventMatchesAnyShortcut(redoEvent, ['Ctrl/Cmd+Shift+Z', 'Ctrl/Cmd+Y'])).toBe(true);
  });

  it('reports conflicts when two commands share the same combo', () => {
    const config = createDefaultEditorShortcutConfig();
    config['workspace.scene'] = ['1'];
    config['workspace.modeling'] = ['1'];

    const conflicts = findShortcutConflicts(config);
    const duplicate = conflicts.find((conflict) => conflict.combo === '1');

    expect(duplicate).toBeDefined();
    expect(duplicate?.definitions.map((definition) => definition.id)).toEqual(
      expect.arrayContaining(['workspace.scene', 'workspace.modeling'])
    );
  });

  it('returns friendly labels for UI badges and command palette hints', () => {
    const config = createDefaultEditorShortcutConfig();

    expect(getPrimaryShortcutLabel(config, 'shell.command_palette')).toBe('Ctrl/Cmd+K');
    expect(getPrimaryShortcutLabel(config, 'selection.delete')).toBe('Delete');
  });
});
