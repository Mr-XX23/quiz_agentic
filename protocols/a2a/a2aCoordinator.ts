// A2A (Agent-to-Agent) Coordinator
import { EventEmitter } from "events";
import { A2AAgent, AgentInfo, AgentMessage } from "./a2aAgent";

export interface TaskRequest {
  id: string;
  type: string;
  params: any;
  requiredCapabilities: string[];
  priority: number;
  timeout: number;
  metadata?: any;
}

export interface TaskResult {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  agentId: string;
  duration: number;
}

export interface AgentPool {
  [agentId: string]: {
    info: AgentInfo;
    agent?: A2AAgent;
    status: "active" | "busy" | "inactive";
    currentTasks: string[];
    performance: {
      tasksCompleted: number;
      averageTime: number;
      successRate: number;
    };
  };
}

export class A2ACoordinator extends EventEmitter {
  private agents: AgentPool = {};
  private taskQueue: TaskRequest[] = [];
  private activeTasks: Map<string, {
    request: TaskRequest;
    agentId: string;
    startTime: number;
  }> = new Map();
  private taskHistory: TaskResult[] = [];

  constructor() {
    super();
  }

  /**
   * Register an agent with the coordinator
   */
  registerAgent(agent: A2AAgent): void {
    const info = agent.getInfo();
    
    this.agents[info.id] = {
      info,
      agent,
      status: "active",
      currentTasks: [],
      performance: {
        tasksCompleted: 0,
        averageTime: 0,
        successRate: 1.0,
      },
    };

    // Listen for agent events
    agent.on("agent_connected", (agentId) => {
      this.emit("agent_network_change", { type: "connected", agentId });
    });

    agent.on("agent_disconnected", (agentId) => {
      this.emit("agent_network_change", { type: "disconnected", agentId });
    });

    console.log(`Registered agent: ${info.name} (${info.id})`);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    const agentData = this.agents[agentId];
    if (agentData?.agent) {
      agentData.agent.removeAllListeners();
    }
    
    delete this.agents[agentId];
    console.log(`Unregistered agent: ${agentId}`);
  }

  /**
   * Submit a task to be executed by the most suitable agent
   */
  async submitTask(request: TaskRequest): Promise<TaskResult> {
    // Find the best agent for this task
    const agentId = this.selectBestAgent(request);
    
    if (!agentId) {
      throw new Error("No suitable agent available for this task");
    }

    return this.executeTask(request, agentId);
  }

  /**
   * Submit a task with agent preference
   */
  async submitTaskToAgent(request: TaskRequest, preferredAgentId: string): Promise<TaskResult> {
    const agentData = this.agents[preferredAgentId];
    if (!agentData) {
      throw new Error(`Agent not found: ${preferredAgentId}`);
    }

    if (agentData.status === "inactive") {
      throw new Error(`Agent is inactive: ${preferredAgentId}`);
    }

    return this.executeTask(request, preferredAgentId);
  }

  /**
   * Execute a task on a specific agent
   */
  private async executeTask(request: TaskRequest, agentId: string): Promise<TaskResult> {
    const agentData = this.agents[agentId];
    const startTime = Date.now();

    // Mark agent as busy
    agentData.status = "busy";
    agentData.currentTasks.push(request.id);
    
    this.activeTasks.set(request.id, {
      request,
      agentId,
      startTime,
    });

    try {
      // Execute the task
      let result: any;
      
      if (agentData.agent) {
        // Use direct agent communication
        result = await agentData.agent.sendRequest(
          agentId, 
          request.type, 
          request.params, 
          request.timeout
        );
      } else {
        // Use registered capabilities
        const capability = agentData.info.capabilities.find(c => c.name === request.type);
        if (!capability) {
          throw new Error(`Agent ${agentId} does not support capability: ${request.type}`);
        }
        
        // This would need to be implemented based on how external agents are called
        throw new Error("External agent execution not implemented");
      }

      const duration = Date.now() - startTime;
      
      // Update performance metrics
      this.updateAgentPerformance(agentId, duration, true);
      
      const taskResult: TaskResult = {
        id: request.id,
        success: true,
        result,
        agentId,
        duration,
      };

      this.taskHistory.push(taskResult);
      this.emit("task_completed", taskResult);
      
      return taskResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Update performance metrics
      this.updateAgentPerformance(agentId, duration, false);
      
      const taskResult: TaskResult = {
        id: request.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        agentId,
        duration,
      };

      this.taskHistory.push(taskResult);
      this.emit("task_failed", taskResult);
      
      return taskResult;

    } finally {
      // Clean up
      agentData.status = "active";
      agentData.currentTasks = agentData.currentTasks.filter(id => id !== request.id);
      this.activeTasks.delete(request.id);
    }
  }

  /**
   * Select the best agent for a task based on capabilities and performance
   */
  private selectBestAgent(request: TaskRequest): string | null {
    const suitableAgents = Object.entries(this.agents)
      .filter(([_, agentData]) => {
        // Agent must be active
        if (agentData.status === "inactive") return false;
        
        // Agent must have required capabilities
        return request.requiredCapabilities.every(capability =>
          agentData.info.capabilities.some(c => c.name === capability)
        );
      })
      .map(([agentId, agentData]) => ({
        agentId,
        agentData,
        score: this.calculateAgentScore(agentData, request),
      }))
      .sort((a, b) => b.score - a.score);

    return suitableAgents.length > 0 ? suitableAgents[0].agentId : null;
  }

  /**
   * Calculate a score for agent selection
   */
  private calculateAgentScore(agentData: any, request: TaskRequest): number {
    let score = 0;

    // Base score for having the capability
    score += 100;

    // Bonus for success rate
    score += agentData.performance.successRate * 50;

    // Penalty for being busy
    if (agentData.status === "busy") {
      score -= 30;
    }

    // Bonus for fewer current tasks
    score -= agentData.currentTasks.length * 10;

    // Bonus for faster average time (inverse relationship)
    if (agentData.performance.averageTime > 0) {
      score += Math.max(0, 50 - (agentData.performance.averageTime / 1000));
    }

    // Priority adjustment
    score += request.priority * 10;

    return score;
  }

  /**
   * Update agent performance metrics
   */
  private updateAgentPerformance(agentId: string, duration: number, success: boolean): void {
    const agentData = this.agents[agentId];
    if (!agentData) return;

    const perf = agentData.performance;
    
    // Update average time
    const totalTime = perf.averageTime * perf.tasksCompleted + duration;
    perf.tasksCompleted += 1;
    perf.averageTime = totalTime / perf.tasksCompleted;
    
    // Update success rate
    const totalSuccess = perf.successRate * (perf.tasksCompleted - 1) + (success ? 1 : 0);
    perf.successRate = totalSuccess / perf.tasksCompleted;
  }

  /**
   * Get coordinator status
   */
  getStatus() {
    return {
      agents: Object.keys(this.agents).length,
      activeAgents: Object.values(this.agents).filter(a => a.status === "active").length,
      busyAgents: Object.values(this.agents).filter(a => a.status === "busy").length,
      queuedTasks: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
      completedTasks: this.taskHistory.length,
    };
  }

  /**
   * Get detailed agent information
   */
  getAgents(): AgentPool {
    return { ...this.agents };
  }

  /**
   * Get task history
   */
  getTaskHistory(limit?: number): TaskResult[] {
    return limit ? this.taskHistory.slice(-limit) : [...this.taskHistory];
  }

  /**
   * Broadcast a message to all agents
   */
  broadcast(method: string, params?: any): void {
    for (const agentData of Object.values(this.agents)) {
      if (agentData.agent && agentData.status !== "inactive") {
        agentData.agent.broadcast(method, params);
      }
    }
  }

  /**
   * Shutdown the coordinator
   */
  async shutdown(): Promise<void> {
    // Stop all agents
    for (const [agentId, agentData] of Object.entries(this.agents)) {
      if (agentData.agent) {
        await agentData.agent.stop();
      }
      this.unregisterAgent(agentId);
    }

    // Clear all data
    this.taskQueue = [];
    this.activeTasks.clear();
    
    console.log("A2A Coordinator shutdown complete");
  }
}

// Singleton coordinator instance
export const coordinator = new A2ACoordinator();