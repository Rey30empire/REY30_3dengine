// ============================================
// UI Runtime System - Canvas, Widgets, Events
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';

export type UIAnchor = 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type UIFitMode = 'fixed' | 'stretch' | 'fit' | 'fill';

export interface UIEventData {
  type: string;
  target: UIWidget | null;
  position: THREE.Vector2;
  delta: THREE.Vector2;
  button?: number;
  key?: string;
  data?: any;
}

export type UIEventHandler = (event: UIEventData) => void;

export interface UIStyle {
  width?: number | string;
  height?: number | string;
  padding?: number | [number, number] | [number, number, number, number];
  margin?: number | [number, number] | [number, number, number, number];
  backgroundColor?: string;
  backgroundImage?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  visible?: boolean;
  zIndex?: number;
}

/**
 * UI Widget - Base class for all UI elements
 */
export abstract class UIWidget {
  id: string;
  name: string;
  enabled: boolean = true;
  
  protected parent: UIWidget | null = null;
  protected children: UIWidget[] = [];
  protected style: UIStyle = {};
  protected computedStyle: UIStyle = {};
  
  protected position: THREE.Vector2 = new THREE.Vector2();
  protected size: THREE.Vector2 = new THREE.Vector2(100, 100);
  protected anchor: UIAnchor = 'top-left';
  protected pivot: THREE.Vector2 = new THREE.Vector2(0, 0);
  
  protected eventListeners: Map<string, UIEventHandler[]> = new Map();
  protected dirty: boolean = true;
  
  constructor(id: string, name?: string) {
    this.id = id;
    this.name = name || id;
  }
  
  /**
   * Set style properties
   */
  setStyle(style: Partial<UIStyle>): void {
    this.style = { ...this.style, ...style };
    this.dirty = true;
  }
  
  /**
   * Get style
   */
  getStyle(): UIStyle {
    return { ...this.style };
  }
  
  /**
   * Set position
   */
  setPosition(x: number, y: number): void {
    this.position.set(x, y);
    this.dirty = true;
  }
  
  /**
   * Get position
   */
  getPosition(): THREE.Vector2 {
    return this.position.clone();
  }
  
  /**
   * Set size
   */
  setSize(width: number, height: number): void {
    this.size.set(width, height);
    this.dirty = true;
  }
  
  /**
   * Get size
   */
  getSize(): THREE.Vector2 {
    return this.size.clone();
  }
  
  /**
   * Set anchor
   */
  setAnchor(anchor: UIAnchor): void {
    this.anchor = anchor;
    this.dirty = true;
  }
  
  /**
   * Get anchor
   */
  getAnchor(): UIAnchor {
    return this.anchor;
  }
  
  /**
   * Set pivot point (0-1)
   */
  setPivot(x: number, y: number): void {
    this.pivot.set(x, y);
    this.dirty = true;
  }
  
  /**
   * Add child widget
   */
  addChild(child: UIWidget): void {
    child.parent = this;
    this.children.push(child);
    this.dirty = true;
  }
  
  /**
   * Remove child widget
   */
  removeChild(child: UIWidget): void {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      child.parent = null;
      this.children.splice(index, 1);
      this.dirty = true;
    }
  }
  
  /**
   * Get children
   */
  getChildren(): UIWidget[] {
    return [...this.children];
  }
  
  /**
   * Get parent
   */
  getParent(): UIWidget | null {
    return this.parent;
  }
  
  /**
   * Add event listener
   */
  on(event: string, handler: UIEventHandler): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(handler);
  }
  
  /**
   * Remove event listener
   */
  off(event: string, handler: UIEventHandler): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  /**
   * Emit event
   */
  emit(event: string, data?: Partial<UIEventData>): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      const eventData: UIEventData = {
        type: event,
        target: this,
        position: data?.position || this.position.clone(),
        delta: data?.delta || new THREE.Vector2(),
        ...data,
      };
      handlers.forEach(handler => handler(eventData));
    }
  }
  
  /**
   * Check if point is inside widget
   */
  containsPoint(point: THREE.Vector2): boolean {
    const rect = this.getBoundingClientRect();
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }
  
  /**
   * Get bounding rectangle in screen space
   */
  getBoundingClientRect(): { x: number; y: number; width: number; height: number } {
    // This would be computed based on parent canvas and anchor
    return {
      x: this.position.x,
      y: this.position.y,
      width: this.size.x,
      height: this.size.y,
    };
  }
  
  /**
   * Update widget
   */
  update(deltaTime: number): void {
    if (this.dirty) {
      this.computeStyle();
      this.dirty = false;
    }
    
    this.children.forEach(child => {
      if (child.enabled) {
        child.update(deltaTime);
      }
    });
  }
  
  /**
   * Compute final style
   */
  protected computeStyle(): void {
    this.computedStyle = { ...this.style };
    
    // Inherit from parent if not set
    if (this.parent) {
      const parentStyle = this.parent.getStyle();
      this.computedStyle.fontFamily = this.style.fontFamily || parentStyle.fontFamily;
      this.computedStyle.fontSize = this.style.fontSize || parentStyle.fontSize;
      this.computedStyle.color = this.style.color || parentStyle.color;
    }
  }
  
  /**
   * Render widget (abstract - to be implemented by subclasses)
   */
  abstract render(ctx: CanvasRenderingContext2D): void;
}

/**
 * UI Canvas - Root container for UI elements
 */
export class UICanvas extends UIWidget {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private resolution: THREE.Vector2 = new THREE.Vector2(1920, 1080);
  private scaleMode: 'constant-pixel-size' | 'scale-with-screen-size' | 'constant-physical-size' = 'scale-with-screen-size';
  private referenceResolution: THREE.Vector2 = new THREE.Vector2(1920, 1080);
  private scaleFactor: number = 1;
  
  constructor(id: string = 'root-canvas') {
    super(id, 'UICanvas');
    this.createCanvas();
  }
  
  /**
   * Create the HTML canvas
   */
  private createCanvas(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.id = this.id;
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'auto';
    
    this.ctx = this.canvas.getContext('2d');
    this.resize();
  }
  
  /**
   * Get the HTML canvas element
   */
  getElement(): HTMLCanvasElement | null {
    return this.canvas;
  }
  
  /**
   * Resize canvas
   */
  resize(): void {
    if (!this.canvas) return;
    
    const container = this.canvas.parentElement || document.body;
    const rect = container.getBoundingClientRect();
    
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    
    this.resolution.set(rect.width, rect.height);
    
    // Calculate scale factor
    if (this.scaleMode === 'scale-with-screen-size') {
      const scaleX = rect.width / this.referenceResolution.x;
      const scaleY = rect.height / this.referenceResolution.y;
      this.scaleFactor = Math.min(scaleX, scaleY);
    } else {
      this.scaleFactor = 1;
    }
    
    this.dirty = true;
  }
  
  /**
   * Get scale factor
   */
  getScaleFactor(): number {
    return this.scaleFactor;
  }
  
  /**
   * Set reference resolution
   */
  setReferenceResolution(width: number, height: number): void {
    this.referenceResolution.set(width, height);
    this.resize();
  }
  
  /**
   * Convert screen position to canvas position
   */
  screenToCanvas(screenPos: THREE.Vector2): THREE.Vector2 {
    if (!this.canvas) return screenPos.clone();
    
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      (screenPos.x - rect.left) / this.scaleFactor,
      (screenPos.y - rect.top) / this.scaleFactor
    );
  }
  
  /**
   * Render the canvas
   */
  render(ctx: CanvasRenderingContext2D): void {
    if (!this.ctx || !this.canvas) return;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Apply scale
    this.ctx.save();
    this.ctx.scale(this.scaleFactor, this.scaleFactor);
    
    // Render all children
    this.children.forEach(child => {
      if (child.enabled) {
        child.render(this.ctx!);
      }
    });
    
    this.ctx.restore();
  }
  
  /**
   * Update canvas
   */
  update(deltaTime: number): void {
    super.update(deltaTime);
    this.render(this.ctx!);
  }
}

/**
 * UI Panel - Container widget
 */
export class UIPanel extends UIWidget {
  constructor(id: string) {
    super(id, 'UIPanel');
    this.style = {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      borderRadius: 8,
      padding: 10,
    };
  }
  
  render(ctx: CanvasRenderingContext2D): void {
    const rect = this.getBoundingClientRect();
    const style = this.style;
    
    ctx.save();
    
    // Background
    if (style.backgroundColor) {
      ctx.fillStyle = style.backgroundColor;
      if (style.borderRadius) {
        this.roundRect(ctx, rect.x, rect.y, rect.width, rect.height, style.borderRadius);
        ctx.fill();
      } else {
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
    
    // Border
    if (style.borderColor && style.borderWidth) {
      ctx.strokeStyle = style.borderColor;
      ctx.lineWidth = style.borderWidth;
      if (style.borderRadius) {
        this.roundRect(ctx, rect.x, rect.y, rect.width, rect.height, style.borderRadius);
        ctx.stroke();
      } else {
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
    
    ctx.restore();
    
    // Render children
    this.children.forEach(child => {
      if (child.enabled) {
        child.render(ctx);
      }
    });
  }
  
  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * UI Text - Text display widget
 */
export class UIText extends UIWidget {
  private text: string = '';
  private maxWidth: number = 0;
  private lineHeight: number = 1.2;
  private wordWrap: boolean = true;
  
  constructor(id: string, text: string = '') {
    super(id, 'UIText');
    this.text = text;
    this.style = {
      color: '#ffffff',
      fontSize: 16,
      fontFamily: 'Arial, sans-serif',
    };
  }
  
  /**
   * Set text content
   */
  setText(text: string): void {
    this.text = text;
    this.dirty = true;
  }
  
  /**
   * Get text content
   */
  getText(): string {
    return this.text;
  }
  
  render(ctx: CanvasRenderingContext2D): void {
    const rect = this.getBoundingClientRect();
    const style = this.style;
    
    ctx.save();
    
    // Set font
    const fontSize = style.fontSize || 16;
    const fontFamily = style.fontFamily || 'Arial, sans-serif';
    ctx.font = `${style.fontWeight || 'normal'} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = style.color || '#ffffff';
    ctx.textAlign = style.textAlign || 'left';
    ctx.textBaseline = style.verticalAlign || 'top';
    
    // Word wrap
    if (this.wordWrap && this.maxWidth > 0) {
      const lines = this.wrapText(ctx, this.text, this.maxWidth);
      let y = rect.y;
      
      lines.forEach(line => {
        ctx.fillText(line, rect.x, y);
        y += fontSize * this.lineHeight;
      });
    } else {
      ctx.fillText(this.text, rect.x, rect.y);
    }
    
    ctx.restore();
  }
  
  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }
}

/**
 * UI Button - Interactive button widget
 */
export class UIButton extends UIWidget {
  private label: string;
  private state: 'normal' | 'hover' | 'pressed' | 'disabled' = 'normal';
  private stateStyles: Record<string, UIStyle> = {};
  
  constructor(id: string, label: string = 'Button') {
    super(id, 'UIButton');
    this.label = label;
    this.style = {
      width: 120,
      height: 40,
      backgroundColor: '#4a5568',
      borderRadius: 4,
      color: '#ffffff',
      fontSize: 14,
      textAlign: 'center',
      verticalAlign: 'middle',
    };
    
    // State styles
    this.stateStyles = {
      hover: {
        backgroundColor: '#5a6578',
      },
      pressed: {
        backgroundColor: '#3a4558',
      },
      disabled: {
        backgroundColor: '#2a3548',
        color: '#888888',
      },
    };
    
    this.setupEvents();
  }
  
  private setupEvents(): void {
    // These would be connected to the event system
    this.on('mouseenter', () => {
      if (this.state !== 'disabled') {
        this.state = 'hover';
        this.dirty = true;
      }
    });
    
    this.on('mouseleave', () => {
      if (this.state !== 'disabled') {
        this.state = 'normal';
        this.dirty = true;
      }
    });
    
    this.on('mousedown', () => {
      if (this.state !== 'disabled') {
        this.state = 'pressed';
        this.dirty = true;
      }
    });
    
    this.on('mouseup', () => {
      if (this.state !== 'disabled') {
        this.state = 'hover';
        this.emit('click');
        this.dirty = true;
      }
    });
  }
  
  /**
   * Set button label
   */
  setLabel(label: string): void {
    this.label = label;
    this.dirty = true;
  }
  
  /**
   * Set disabled state
   */
  setDisabled(disabled: boolean): void {
    this.state = disabled ? 'disabled' : 'normal';
    this.enabled = !disabled;
    this.dirty = true;
  }
  
  render(ctx: CanvasRenderingContext2D): void {
    const rect = this.getBoundingClientRect();
    const stateStyle = this.stateStyles[this.state] || {};
    const style = { ...this.style, ...stateStyle };
    
    ctx.save();
    
    // Background
    if (style.backgroundColor) {
      ctx.fillStyle = style.backgroundColor;
      if (style.borderRadius) {
        this.roundRect(ctx, rect.x, rect.y, rect.width, rect.height, style.borderRadius);
        ctx.fill();
      } else {
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
    
    // Text
    const fontSize = style.fontSize || 14;
    ctx.font = `${style.fontWeight || 'normal'} ${fontSize}px ${style.fontFamily || 'Arial, sans-serif'}`;
    ctx.fillStyle = style.color || '#ffffff';
    ctx.textAlign = style.textAlign || 'center';
    ctx.textBaseline = style.verticalAlign || 'middle';
    ctx.fillText(
      this.label,
      rect.x + rect.width / 2,
      rect.y + rect.height / 2
    );
    
    ctx.restore();
  }
  
  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * UI Slider - Slider input widget
 */
export class UISlider extends UIWidget {
  private value: number = 0;
  private minValue: number = 0;
  private maxValue: number = 100;
  private handleSize: number = 16;
  private trackHeight: number = 4;
  private dragging: boolean = false;
  
  constructor(id: string) {
    super(id, 'UISlider');
    this.style = {
      width: 200,
      height: 24,
      backgroundColor: '#2a3548',
      color: '#4a90d9',
    };
  }
  
  /**
   * Set value
   */
  setValue(value: number): void {
    this.value = Math.max(this.minValue, Math.min(this.maxValue, value));
    this.emit('change', { data: { value: this.value } });
    this.dirty = true;
  }
  
  /**
   * Get value
   */
  getValue(): number {
    return this.value;
  }
  
  /**
   * Set range
   */
  setRange(min: number, max: number): void {
    this.minValue = min;
    this.maxValue = max;
    this.value = Math.max(min, Math.min(max, this.value));
    this.dirty = true;
  }
  
  render(ctx: CanvasRenderingContext2D): void {
    const rect = this.getBoundingClientRect();
    const style = this.style;
    const trackY = rect.y + (rect.height - this.trackHeight) / 2;
    const fillWidth = ((this.value - this.minValue) / (this.maxValue - this.minValue)) * rect.width;
    
    ctx.save();
    
    // Background track
    ctx.fillStyle = style.backgroundColor || '#2a3548';
    this.roundRect(ctx, rect.x, trackY, rect.width, this.trackHeight, this.trackHeight / 2);
    ctx.fill();
    
    // Fill
    ctx.fillStyle = style.color || '#4a90d9';
    this.roundRect(ctx, rect.x, trackY, fillWidth, this.trackHeight, this.trackHeight / 2);
    ctx.fill();
    
    // Handle
    const handleX = rect.x + fillWidth - this.handleSize / 2;
    const handleY = rect.y + (rect.height - this.handleSize) / 2;
    
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(handleX + this.handleSize / 2, handleY + this.handleSize / 2, this.handleSize / 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
  
  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * UI Image - Image display widget
 */
export class UIImage extends UIWidget {
  private image: HTMLImageElement | null = null;
  private src: string = '';
  private preserveAspect: boolean = true;
  
  constructor(id: string) {
    super(id, 'UIImage');
  }
  
  /**
   * Set image source
   */
  setSrc(src: string): void {
    this.src = src;
    this.image = null;
    this.loadImage();
  }
  
  /**
   * Load image
   */
  private loadImage(): void {
    if (!this.src) return;
    
    this.image = new Image();
    this.image.onload = () => {
      this.dirty = true;
    };
    this.image.src = this.src;
  }
  
  render(ctx: CanvasRenderingContext2D): void {
    if (!this.image) return;
    
    const rect = this.getBoundingClientRect();
    
    ctx.save();
    
    if (this.style.borderRadius) {
      ctx.beginPath();
      this.roundRect(ctx, rect.x, rect.y, rect.width, rect.height, this.style.borderRadius);
      ctx.clip();
    }
    
    if (this.preserveAspect) {
      const aspect = this.image.width / this.image.height;
      let drawWidth = rect.width;
      let drawHeight = rect.height;
      
      if (rect.width / rect.height > aspect) {
        drawWidth = rect.height * aspect;
      } else {
        drawHeight = rect.width / aspect;
      }
      
      const x = rect.x + (rect.width - drawWidth) / 2;
      const y = rect.y + (rect.height - drawHeight) / 2;
      
      ctx.drawImage(this.image, x, y, drawWidth, drawHeight);
    } else {
      ctx.drawImage(this.image, rect.x, rect.y, rect.width, rect.height);
    }
    
    ctx.restore();
  }
  
  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * UI Progress Bar - Progress display widget
 */
export class UIProgressBar extends UIWidget {
  private value: number = 0;
  private maxValue: number = 100;
  private showLabel: boolean = true;
  private fillColor: string = '#4a90d9';
  private backgroundColor: string = '#2a3548';
  
  constructor(id: string) {
    super(id, 'UIProgressBar');
    this.style = {
      width: 200,
      height: 24,
      borderRadius: 4,
    };
  }
  
  /**
   * Set value
   */
  setValue(value: number): void {
    this.value = Math.max(0, Math.min(this.maxValue, value));
    this.dirty = true;
  }
  
  /**
   * Get value
   */
  getValue(): number {
    return this.value;
  }
  
  /**
   * Set max value
   */
  setMaxValue(max: number): void {
    this.maxValue = max;
    this.dirty = true;
  }
  
  render(ctx: CanvasRenderingContext2D): void {
    const rect = this.getBoundingClientRect();
    const fillWidth = (this.value / this.maxValue) * rect.width;
    const borderRadius = this.style.borderRadius || 4;
    
    ctx.save();
    
    // Background
    ctx.fillStyle = this.backgroundColor;
    this.roundRect(ctx, rect.x, rect.y, rect.width, rect.height, borderRadius);
    ctx.fill();
    
    // Fill
    ctx.fillStyle = this.fillColor;
    this.roundRect(ctx, rect.x, rect.y, fillWidth, rect.height, borderRadius);
    ctx.fill();
    
    // Label
    if (this.showLabel) {
      const percentage = Math.round((this.value / this.maxValue) * 100);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${percentage}%`, rect.x + rect.width / 2, rect.y + rect.height / 2);
    }
    
    ctx.restore();
  }
  
  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

/**
 * UI Manager - Manages all UI canvases and input
 */
export class UIManager {
  private static instance: UIManager;
  private canvases: Map<string, UICanvas> = new Map();
  private focusedWidget: UIWidget | null = null;
  private hoveredWidget: UIWidget | null = null;
  
  private constructor() {
    this.setupInputHandlers();
  }
  
  static getInstance(): UIManager {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }
  
  /**
   * Create a new canvas
   */
  createCanvas(id: string): UICanvas {
    const canvas = new UICanvas(id);
    this.canvases.set(id, canvas);
    return canvas;
  }
  
  /**
   * Get canvas
   */
  getCanvas(id: string): UICanvas | undefined {
    return this.canvases.get(id);
  }
  
  /**
   * Remove canvas
   */
  removeCanvas(id: string): void {
    this.canvases.delete(id);
  }
  
  /**
   * Setup input handlers
   */
  private setupInputHandlers(): void {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('resize', () => {
      this.canvases.forEach(canvas => canvas.resize());
    });
    
    // Mouse events would be connected here
    // Touch events would be connected here
  }
  
  /**
   * Update all canvases
   */
  update(deltaTime: number): void {
    this.canvases.forEach(canvas => {
      canvas.update(deltaTime);
    });
  }
  
  /**
   * Find widget at position
   */
  findWidgetAtPosition(position: THREE.Vector2): UIWidget | null {
    // This would do a hit test across all canvases
    return null;
  }
  
  /**
   * Set focused widget
   */
  setFocusedWidget(widget: UIWidget | null): void {
    this.focusedWidget = widget;
  }
  
  /**
   * Get focused widget
   */
  getFocusedWidget(): UIWidget | null {
    return this.focusedWidget;
  }
}

// Export singleton
export const uiManager = UIManager.getInstance();
