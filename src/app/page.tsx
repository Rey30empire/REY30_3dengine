// ============================================
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// Main Application Page
// ============================================

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useSyncExternalStore } from 'react';

// Dynamically import the editor to avoid SSR issues with Three.js
const EditorLayout = dynamic(
  () => import('@/engine/editor/EditorLayout').then(mod => mod.EditorLayout),
  { 
    ssr: false,
    loading: () => <LoadingScreen />
  }
);

// Custom hook for hydration
function useHydration() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export default function Home() {
  const hydrated = useHydration();

  if (!hydrated) {
    return <LoadingScreen />;
  }

  return <EditorLayout />;
}

// Loading Screen Component
function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white">
      <div className="relative">
        {/* Logo Animation */}
        <div className="w-20 h-20 relative">
          <div className="absolute inset-0 border-4 border-blue-500/30 rounded-lg animate-pulse" />
          <div className="absolute inset-2 border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-lg animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-blue-400">R30</span>
          </div>
        </div>
      </div>

      {/* Loading Text */}
      <div className="mt-6 text-center">
        <h1 className="text-xl font-semibold text-white mb-2">
          REY30 3D Engine
        </h1>
        <p className="text-sm text-slate-400 mb-4">
          AI-First Hybrid Game Engine
        </p>
        
        {/* Progress Bar */}
        <div className="w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-loading-bar" />
        </div>
        
        <p className="text-xs text-slate-500 mt-3">
          Initializing engine components...
        </p>
      </div>

      {/* Features */}
      <div className="absolute bottom-8 flex gap-6 text-xs text-slate-500">
        <FeatureItem label="3D Rendering" />
        <FeatureItem label="AI Integration" />
        <FeatureItem label="ECS System" />
        <FeatureItem label="Agent System" />
      </div>
    </div>
  );
}

function FeatureItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
      <span>{label}</span>
    </div>
  );
}
