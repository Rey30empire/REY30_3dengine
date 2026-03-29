'use client';

// ============================================
// RebindUI - Control Rebinding Component
// REY30 3D Engine - Input System
// ============================================

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { InputBinding, InputActionDefinition, AxisConfig } from './types';
import { KeyCode, MouseButton, GamepadButton, getKeyDisplayName, getGamepadButtonDisplayName } from './KeyCode';
import { InputManager } from './InputManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Keyboard, 
  Gamepad2, 
  Mouse, 
  Smartphone, 
  RotateCcw, 
  Save, 
  Download,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';

/**
 * Props for the RebindUI component
 */
export interface RebindUIProps {
  /** Whether to show save/reset buttons */
  showActions?: boolean;
  /** Whether to show category tabs */
  showCategories?: boolean;
  /** Whether to show gamepad bindings */
  showGamepad?: boolean;
  /** Whether to show touch bindings */
  showTouch?: boolean;
  /** Callback when bindings are saved */
  onSave?: () => void;
  /** Callback when bindings are reset */
  onReset?: () => void;
  /** Additional CSS class */
  className?: string;
}

/**
 * State for a rebinding operation
 */
interface RebindingState {
  actionName: string;
  bindingIndex: number;
  deviceType: 'keyboard' | 'mouse' | 'gamepad' | 'touch';
}

/**
 * Control Rebinding UI component.
 * Allows users to customize their input bindings.
 * 
 * @example
 * ```tsx
 * <RebindUI
 *   showActions
 *   showCategories
 *   onSave={() => console.log('Saved!')}
 * />
 * ```
 */
export function RebindUI({
  showActions = true,
  showCategories = true,
  showGamepad = true,
  showTouch = false,
  onSave,
  onReset,
  className = '',
}: RebindUIProps) {
  const [rebinding, setRebinding] = useState<RebindingState | null>(null);
  const [pendingBinding, setPendingBinding] = useState<InputBinding | null>(null);
  const [activeTab, setActiveTab] = useState<string>('Movement');
  const [hasChanges, setHasChanges] = useState(false);

  // Get all action definitions grouped by category
  const actionDefinitions = useMemo(() => {
    return InputManager.map.getAllActionDefinitions();
  }, []);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    actionDefinitions.forEach(action => {
      if (action.category) cats.add(action.category);
    });
    return Array.from(cats);
  }, [actionDefinitions]);

  const actionsByCategory = useMemo(() => {
    const map = new Map<string, InputActionDefinition[]>();
    actionDefinitions.forEach(action => {
      const cat = action.category || 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(action);
    });
    return map;
  }, [actionDefinitions]);

  // Listen for input during rebinding
  useEffect(() => {
    if (!rebinding) return;

    let cleanup: (() => void) | null = null;

    if (rebinding.deviceType === 'keyboard') {
      cleanup = InputManager.events.onKeyDown((event) => {
        if (event.repeat) return;
        
        const binding: InputBinding = {
          id: `kb-${event.code}-${Date.now()}`,
          deviceType: 'keyboard',
          input: event.code,
          enabled: true,
        };
        
        setPendingBinding(binding);
      });
    } else if (rebinding.deviceType === 'mouse') {
      cleanup = InputManager.events.onMouseDown((event) => {
        const binding: InputBinding = {
          id: `mouse-${event.button}-${Date.now()}`,
          deviceType: 'mouse',
          input: event.button as MouseButton,
          enabled: true,
        };
        
        setPendingBinding(binding);
      });
    } else if (rebinding.deviceType === 'gamepad') {
      cleanup = InputManager.events.onGamepadButtonDown((event) => {
        if (event.button === undefined) return;
        
        const binding: InputBinding = {
          id: `gp-btn-${event.button}-${Date.now()}`,
          deviceType: 'gamepad',
          input: event.button,
          enabled: true,
        };
        
        setPendingBinding(binding);
      });
    }

    return () => {
      cleanup?.();
    };
  }, [rebinding]);

  // Handle starting rebind
  const startRebind = useCallback((
    actionName: string,
    bindingIndex: number,
    deviceType: 'keyboard' | 'mouse' | 'gamepad' | 'touch'
  ) => {
    setRebinding({ actionName, bindingIndex, deviceType });
    setPendingBinding(null);
  }, []);

  // Handle cancel rebind
  const cancelRebind = useCallback(() => {
    setRebinding(null);
    setPendingBinding(null);
  }, []);

  // Handle confirm binding
  const confirmBinding = useCallback(() => {
    if (!rebinding || !pendingBinding) return;

    const action = InputManager.map.getActionDefinition(rebinding.actionName);
    if (!action) return;

    if (rebinding.bindingIndex >= 0) {
      // Replace existing binding
      action.bindings[rebinding.bindingIndex] = pendingBinding;
    } else {
      // Add new binding
      action.bindings.push(pendingBinding);
    }

    setHasChanges(true);
    setRebinding(null);
    setPendingBinding(null);
  }, [rebinding, pendingBinding]);

  // Handle remove binding
  const removeBinding = useCallback((actionName: string, bindingId: string) => {
    InputManager.map.removeBinding(actionName, bindingId);
    setHasChanges(true);
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    InputManager.saveBindings();
    setHasChanges(false);
    onSave?.();
  }, [onSave]);

  // Handle reset
  const handleReset = useCallback(() => {
    InputManager.resetBindings();
    setHasChanges(false);
    onReset?.();
  }, [onReset]);

  // Render binding button
  const renderBindingButton = (
    action: InputActionDefinition,
    binding: InputBinding,
    index: number
  ) => {
    const isRebinding = rebinding?.actionName === action.name && rebinding?.bindingIndex === index;
    const deviceType = binding.deviceType;

    let displayText = '';
    let icon: React.ReactNode = null;

    switch (deviceType) {
      case 'keyboard':
        displayText = getKeyDisplayName(binding.input as KeyCode);
        icon = <Keyboard className="w-4 h-4 mr-2" />;
        break;
      case 'mouse':
        displayText = `Mouse ${binding.input}`;
        icon = <Mouse className="w-4 h-4 mr-2" />;
        break;
      case 'gamepad':
        if (typeof binding.input === 'number' && binding.input <= 16) {
          displayText = getGamepadButtonDisplayName(binding.input as GamepadButton);
        } else {
          displayText = `Axis ${binding.input}`;
        }
        icon = <Gamepad2 className="w-4 h-4 mr-2" />;
        break;
      case 'touch':
        displayText = String(binding.input);
        icon = <Smartphone className="w-4 h-4 mr-2" />;
        break;
    }

    return (
      <div key={binding.id} className="flex items-center gap-2">
        <Button
          variant={isRebinding ? 'default' : 'outline'}
          size="sm"
          className={`min-w-[100px] ${isRebinding ? 'animate-pulse' : ''}`}
          onClick={() => startRebind(action.name, index, deviceType)}
        >
          {icon}
          {isRebinding ? 'Press any key...' : displayText}
        </Button>
        
        {!isRebinding && action.bindings.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeBinding(action.name, binding.id)}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    );
  };

  // Render action row
  const renderActionRow = (action: InputActionDefinition) => {
    const isRebindingThis = rebinding?.actionName === action.name;
    
    return (
      <div
        key={action.name}
        className="flex flex-col sm:flex-row sm:items-center justify-between py-3 px-4 rounded-lg hover:bg-muted/50 transition-colors"
      >
        <div className="mb-2 sm:mb-0">
          <div className="font-medium">{action.displayName}</div>
          {action.description && (
            <div className="text-sm text-muted-foreground">{action.description}</div>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Keyboard bindings */}
          {action.bindings
            .map((b, i) => ({ b, i }))
            .filter(({ b }) => b.deviceType === 'keyboard')
            .map(({ b, i }) => renderBindingButton(action, b, i))}
          
          {/* Gamepad bindings */}
          {showGamepad && action.bindings
            .map((b, i) => ({ b, i }))
            .filter(({ b }) => b.deviceType === 'gamepad')
            .map(({ b, i }) => renderBindingButton(action, b, i))}
          
          {/* Mouse bindings */}
          {action.bindings
            .map((b, i) => ({ b, i }))
            .filter(({ b }) => b.deviceType === 'mouse')
            .map(({ b, i }) => renderBindingButton(action, b, i))}
          
          {/* Touch bindings */}
          {showTouch && action.bindings
            .map((b, i) => ({ b, i }))
            .filter(({ b }) => b.deviceType === 'touch')
            .map(({ b, i }) => renderBindingButton(action, b, i))}
          
          {/* Add new binding button */}
          {isRebindingThis && rebinding?.bindingIndex === -1 ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="animate-pulse">
                Waiting for input...
              </Badge>
              <Button variant="ghost" size="sm" onClick={cancelRebind}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : !isRebindingThis && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => startRebind(action.name, -1, 'keyboard')}
              disabled={!!rebinding}
            >
              + Add
            </Button>
          )}
        </div>
      </div>
    );
  };

  // Render pending binding confirmation
  const renderPendingBinding = () => {
    if (!pendingBinding || !rebinding) return null;

    let displayText = '';
    switch (pendingBinding.deviceType) {
      case 'keyboard':
        displayText = getKeyDisplayName(pendingBinding.input as KeyCode);
        break;
      case 'mouse':
        displayText = `Mouse Button ${pendingBinding.input}`;
        break;
      case 'gamepad':
        if (typeof pendingBinding.input === 'number' && pendingBinding.input <= 16) {
          displayText = getGamepadButtonDisplayName(pendingBinding.input as GamepadButton);
        } else {
          displayText = `Gamepad Axis ${pendingBinding.input}`;
        }
        break;
    }

    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-4 z-50">
        <AlertCircle className="w-5 h-5 text-blue-500" />
        <span>
          Bind <strong>{displayText}</strong> to <strong>{rebinding.actionName}</strong>?
        </span>
        <div className="flex gap-2">
          <Button size="sm" onClick={confirmBinding}>
            <Check className="w-4 h-4 mr-1" /> Confirm
          </Button>
          <Button size="sm" variant="outline" onClick={cancelRebind}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className={`w-full max-w-4xl mx-auto ${className}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Control Settings</CardTitle>
            <CardDescription>
              Customize your keyboard, mouse, and gamepad controls
            </CardDescription>
          </div>
          
          {showActions && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={!hasChanges}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {showCategories && categories.length > 1 ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              {categories.map(cat => (
                <TabsTrigger key={cat} value={cat}>
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {categories.map(cat => (
              <TabsContent key={cat} value={cat}>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-1">
                    {(actionsByCategory.get(cat) || []).map(renderActionRow)}
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-1">
              {actionDefinitions.map(renderActionRow)}
            </div>
          </ScrollArea>
        )}
        
        {renderPendingBinding()}
      </CardContent>
    </Card>
  );
}

/**
 * Props for AxisConfigPanel component
 */
export interface AxisConfigPanelProps {
  /** Action name */
  actionName: string;
  /** Binding ID */
  bindingId: string;
  /** Current axis config */
  config: AxisConfig;
  /** Callback when config changes */
  onChange?: (config: AxisConfig) => void;
}

/**
 * Panel for configuring axis settings
 */
export function AxisConfigPanel({
  actionName,
  bindingId,
  config,
  onChange,
}: AxisConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const updateConfig = useCallback(
    (updates: Partial<AxisConfig>) => {
      const newConfig = { ...localConfig, ...updates };
      setLocalConfig(newConfig);
      InputManager.map.updateAxisConfig(actionName, bindingId, updates);
      onChange?.(newConfig);
    },
    [actionName, bindingId, localConfig, onChange]
  );

  return (
    <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="deadzone">Dead Zone</Label>
          <span className="text-sm text-muted-foreground">
            {localConfig.deadZone.toFixed(2)}
          </span>
        </div>
        <Slider
          id="deadzone"
          min={0}
          max={0.5}
          step={0.01}
          value={[localConfig.deadZone]}
          onValueChange={([value]) => updateConfig({ deadZone: value })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="sensitivity">Sensitivity</Label>
          <span className="text-sm text-muted-foreground">
            {localConfig.sensitivity.toFixed(2)}
          </span>
        </div>
        <Slider
          id="sensitivity"
          min={0.1}
          max={3}
          step={0.1}
          value={[localConfig.sensitivity]}
          onValueChange={([value]) => updateConfig({ sensitivity: value })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="invert">Invert Axis</Label>
        <Switch
          id="invert"
          checked={localConfig.invert}
          onCheckedChange={(checked) => updateConfig({ invert: checked })}
        />
      </div>
    </div>
  );
}

export default RebindUI;
