import { v4 as uuidv4 } from 'uuid';
import type { AIMode } from '@/types/engine';
import type { AISlice, SliceCreator } from '../editorStore.types';
import { pushHistory } from '../editorStore.utils';

export const createAISlice: SliceCreator<AISlice> = (set) => ({
  engineMode: 'MODE_MANUAL',
  aiMode: 'OFF',
  aiEnabled: false,
  agents: new Map(),
  tasks: [],
  chatMessages: [],
  isAiProcessing: false,

  setEngineMode: (mode) =>
    set((state) => {
      if (state.engineMode === mode) return {};

      const mappedAiMode: AIMode =
        mode === 'MODE_MANUAL' ? 'OFF' : mode === 'MODE_HYBRID' ? 'LOCAL' : 'API';

      return {
        ...pushHistory(state),
        engineMode: mode,
        aiMode: mappedAiMode,
        aiEnabled: mappedAiMode !== 'OFF',
      };
    }),

  setAIMode: (mode) =>
    set({
      aiMode: mode,
      aiEnabled: mode !== 'OFF',
    }),

  addAgent: (agent) =>
    set((state) => {
      const nextAgents = new Map(state.agents);
      nextAgents.set(agent.id, agent);
      return { agents: nextAgents };
    }),

  updateAgentStatus: (agentId, status) =>
    set((state) => {
      const nextAgents = new Map(state.agents);
      const agent = nextAgents.get(agentId);
      if (agent) {
        nextAgents.set(agentId, { ...agent, status });
      }
      return { agents: nextAgents };
    }),

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task],
    })),

  updateTask: (taskId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId ? { ...task, ...updates } : task
      ),
    })),

  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        {
          ...message,
          id: uuidv4(),
          timestamp: new Date(),
        },
      ],
    })),

  clearChat: () => set({ chatMessages: [] }),

  setAiProcessing: (processing) => set({ isAiProcessing: processing }),
});
