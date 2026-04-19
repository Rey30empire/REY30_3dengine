import type { AgentRole } from '../schemas';
import type { AgenticAgent } from './BaseAgent';

export class AgentRegistry {
  private readonly agents = new Map<AgentRole, AgenticAgent>();

  register(agent: AgenticAgent): void {
    if (this.agents.has(agent.role)) {
      throw new Error(`Agent already registered: ${agent.role}`);
    }
    this.agents.set(agent.role, agent);
  }

  registerMany(agents: AgenticAgent[]): void {
    for (const agent of agents) {
      this.register(agent);
    }
  }

  get(role: AgentRole): AgenticAgent | undefined {
    return this.agents.get(role);
  }

  list(): AgenticAgent[] {
    return [...this.agents.values()];
  }
}
