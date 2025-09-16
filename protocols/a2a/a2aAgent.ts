// A2A (Agent-to-Agent) Communication Protocol
import { EventEmitter } from "events";
import { WebSocket, WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";

export interface AgentMessage {
  id: string;
  type: "request" | "response" | "broadcast" | "notification";
  source: string;
  target?: string; // undefined for broadcast
  method: string;
  params?: any;
  result?: any;
  error?: string;
  timestamp: string;
}

export interface AgentCapability {
  name: string;
  description: string;
  inputSchema?: any;
  outputSchema?: any;
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  endpoint?: string;
  lastSeen: string;
}

export class A2AAgent extends EventEmitter {
  private id: string;
  private name: string;
  private description: string;
  private capabilities: Map<string, AgentCapability> = new Map();
  private connections: Map<string, WebSocket> = new Map();
  private server?: WebSocketServer;
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(
    name: string,
    description: string,
    private port?: number
  ) {
    super();
    this.id = uuidv4();
    this.name = name;
    this.description = description;
  }

  /**
   * Start the agent and optionally create a WebSocket server
   */
  async start(): Promise<void> {
    if (this.port) {
      this.server = new WebSocketServer({ port: this.port });
      
      this.server.on("connection", (ws, request) => {
        const agentId = request.headers["x-agent-id"] as string || uuidv4();
        this.connections.set(agentId, ws);
        
        ws.on("message", (data) => {
          try {
            const message: AgentMessage = JSON.parse(data.toString());
            this.handleMessage(message, agentId);
          } catch (error) {
            console.error("Failed to parse message:", error);
          }
        });

        ws.on("close", () => {
          this.connections.delete(agentId);
          this.emit("agent_disconnected", agentId);
        });

        this.emit("agent_connected", agentId);
      });

      console.log(`A2A Agent ${this.name} started on port ${this.port}`);
    }
  }

  /**
   * Stop the agent and close all connections
   */
  async stop(): Promise<void> {
    // Close all connections
    for (const ws of this.connections.values()) {
      ws.close();
    }
    this.connections.clear();

    // Close server
    if (this.server) {
      this.server.close();
    }

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Agent stopped"));
    }
    this.pendingRequests.clear();

    console.log(`A2A Agent ${this.name} stopped`);
  }

  /**
   * Connect to another agent
   */
  async connectToAgent(agentId: string, endpoint: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(endpoint, {
        headers: {
          "x-agent-id": this.id,
        },
      });

      ws.on("open", () => {
        this.connections.set(agentId, ws);
        
        ws.on("message", (data) => {
          try {
            const message: AgentMessage = JSON.parse(data.toString());
            this.handleMessage(message, agentId);
          } catch (error) {
            console.error("Failed to parse message:", error);
          }
        });

        ws.on("close", () => {
          this.connections.delete(agentId);
          this.emit("agent_disconnected", agentId);
        });

        this.emit("agent_connected", agentId);
        resolve();
      });

      ws.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Register a capability that this agent can handle
   */
  registerCapability(capability: AgentCapability, handler: (params: any) => Promise<any>): void {
    this.capabilities.set(capability.name, capability);
    this.on(`capability_${capability.name}`, handler);
  }

  /**
   * Send a request to another agent
   */
  async sendRequest(targetAgentId: string, method: string, params?: any, timeoutMs: number = 30000): Promise<any> {
    const ws = this.connections.get(targetAgentId);
    if (!ws) {
      throw new Error(`Not connected to agent: ${targetAgentId}`);
    }

    const messageId = uuidv4();
    const message: AgentMessage = {
      id: messageId,
      type: "request",
      source: this.id,
      target: targetAgentId,
      method,
      params,
      timestamp: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(messageId, { resolve, reject, timeout });
      
      ws.send(JSON.stringify(message));
    });
  }

  /**
   * Send a response to a request
   */
  private sendResponse(targetAgentId: string, requestId: string, result?: any, error?: string): void {
    const ws = this.connections.get(targetAgentId);
    if (!ws) {
      console.error(`Cannot send response, not connected to agent: ${targetAgentId}`);
      return;
    }

    const message: AgentMessage = {
      id: requestId,
      type: "response",
      source: this.id,
      target: targetAgentId,
      method: "",
      result,
      error,
      timestamp: new Date().toISOString(),
    };

    ws.send(JSON.stringify(message));
  }

  /**
   * Broadcast a message to all connected agents
   */
  broadcast(method: string, params?: any): void {
    const message: AgentMessage = {
      id: uuidv4(),
      type: "broadcast",
      source: this.id,
      method,
      params,
      timestamp: new Date().toISOString(),
    };

    for (const ws of this.connections.values()) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Handle incoming messages
   */
  private async handleMessage(message: AgentMessage, senderId: string): Promise<void> {
    switch (message.type) {
      case "request":
        await this.handleRequest(message, senderId);
        break;
      
      case "response":
        this.handleResponse(message);
        break;
      
      case "broadcast":
        this.emit("broadcast_received", message);
        break;
      
      case "notification":
        this.emit("notification_received", message);
        break;
    }
  }

  /**
   * Handle incoming requests
   */
  private async handleRequest(message: AgentMessage, senderId: string): Promise<void> {
    try {
      // Check if we have a capability for this method
      if (this.capabilities.has(message.method)) {
        const result = await new Promise((resolve, reject) => {
          this.emit(`capability_${message.method}`, message.params, resolve, reject);
        });
        
        this.sendResponse(senderId, message.id, result);
      } else {
        this.sendResponse(senderId, message.id, undefined, `Unknown method: ${message.method}`);
      }
    } catch (error) {
      this.sendResponse(senderId, message.id, undefined, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Handle incoming responses
   */
  private handleResponse(message: AgentMessage): void {
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  /**
   * Get agent information
   */
  getInfo(): AgentInfo {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      capabilities: Array.from(this.capabilities.values()),
      endpoint: this.port ? `ws://localhost:${this.port}` : undefined,
      lastSeen: new Date().toISOString(),
    };
  }

  /**
   * Get connected agents
   */
  getConnectedAgents(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Discover capabilities of a connected agent
   */
  async discoverCapabilities(targetAgentId: string): Promise<AgentCapability[]> {
    try {
      const result = await this.sendRequest(targetAgentId, "list_capabilities");
      return result || [];
    } catch (error) {
      console.error(`Failed to discover capabilities for ${targetAgentId}:`, error);
      return [];
    }
  }
}

// Helper function to create a quiz agent with A2A capabilities
export function createQuizA2AAgent(port?: number): A2AAgent {
  const agent = new A2AAgent(
    "quiz-agent", 
    "Quiz generation agent with web search and content extraction capabilities",
    port
  );

  // Register quiz generation capability
  agent.registerCapability(
    {
      name: "generate_quiz",
      description: "Generate exactly 20 quiz questions on any topic",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          researchContent: { type: "string" },
        },
        required: ["prompt"],
      },
    },
    async (params) => {
      const { runAgent } = await import("../../agentController/agent");
      return await runAgent(params.prompt);
    }
  );

  // Register web search capability
  agent.registerCapability(
    {
      name: "web_search",
      description: "Search the web for information",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          maxResults: { type: "number" },
        },
        required: ["query"],
      },
    },
    async (params) => {
      const { toolbyName } = await import("../../agentServices/agnetTool");
      return await toolbyName.web_search.invoke(params);
    }
  );

  // Register capability listing
  agent.registerCapability(
    {
      name: "list_capabilities",
      description: "List all available capabilities",
    },
    async () => {
      return Array.from(agent["capabilities"].values());
    }
  );

  return agent;
}