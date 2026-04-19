'use client';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';

export interface EditorCommandItem {
  id: string;
  label: string;
  section: string;
  shortcut?: string;
  keywords?: string[];
  action: () => void;
}

interface EditorCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: EditorCommandItem[];
}

export function EditorCommandPalette({
  open,
  onOpenChange,
  commands,
}: EditorCommandPaletteProps) {
  const sections = Array.from(new Set(commands.map((command) => command.section)));

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Editor Command Palette"
      description="Busca comandos del editor, workspaces y acciones operativas."
      className="max-w-2xl border-slate-800 bg-slate-950 p-0"
    >
      <CommandInput placeholder="Buscar comando, workspace o accion..." />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No se encontraron comandos.</CommandEmpty>
        {sections.map((section) => (
          <CommandGroup key={section} heading={section}>
            {commands
              .filter((command) => command.section === section)
              .map((command) => (
                <CommandItem
                  key={command.id}
                  value={[command.label, ...(command.keywords ?? [])].join(' ')}
                  onSelect={() => {
                    command.action();
                    onOpenChange(false);
                  }}
                >
                  <span>{command.label}</span>
                  {command.shortcut ? (
                    <CommandShortcut>{command.shortcut}</CommandShortcut>
                  ) : null}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
