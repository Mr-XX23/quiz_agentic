// Protocol Configuration and Initialization
import { config } from "dotenv";
import { mcpClient, setupCommonMCPConnections, MCPServerConfig } from "./mcp/mcpClient";
import { createQuizA2AAgent } from "./a2a/a2aAgent";
import { coordinator } from "./a2a/a2aCoordinator";
import { QuizAgentMCPServer } from "./mcp/mcpServer";

config();

export interface ProtocolConfig {
  mcp: {
    enabled: boolean;
    server: {
      enabled: boolean;
      stdio: boolean;
    };
    client: {
      enabled: boolean;
      autoConnect: boolean;
      servers: MCPServerConfig[];
    };
  };
  a2a: {
    enabled: boolean;
    port?: number;
    autoStart: boolean;
    coordinator: {
      enabled: boolean;
    };
  };
}

export const defaultProtocolConfig: ProtocolConfig = {
  mcp: {
    enabled: process.env.MCP_ENABLED === "true",
    server: {
      enabled: process.env.MCP_SERVER_ENABLED === "true",
      stdio: process.env.MCP_SERVER_STDIO === "true",
    },
    client: {
      enabled: process.env.MCP_CLIENT_ENABLED === "true",
      autoConnect: process.env.MCP_AUTO_CONNECT === "true",
      servers: [],
    },
  },
  a2a: {
    enabled: process.env.A2A_ENABLED === "true",
    port: process.env.A2A_PORT ? parseInt(process.env.A2A_PORT) : 8080,
    autoStart: process.env.A2A_AUTO_START === "true",
    coordinator: {
      enabled: process.env.A2A_COORDINATOR_ENABLED === "true",
    },
  },
};

export class ProtocolManager {
  private mcpServer?: QuizAgentMCPServer;
  private a2aAgent?: any;
  private initialized = false;

  constructor(private config: ProtocolConfig = defaultProtocolConfig) {}

  /**
   * Initialize all enabled protocols
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log("Protocols already initialized");
      return;
    }

    console.log("Initializing protocols...");

    try {
      // Initialize MCP
      if (this.config.mcp.enabled) {
        await this.initializeMCP();
      }

      // Initialize A2A
      if (this.config.a2a.enabled) {
        await this.initializeA2A();
      }

      this.initialized = true;
      console.log("Protocol initialization complete");
      
      // Log status
      await this.logStatus();

    } catch (error) {
      console.error("Protocol initialization failed:", error);
      throw error;
    }
  }

  /**
   * Initialize MCP (Model Context Protocol)
   */
  private async initializeMCP(): Promise<void> {
    console.log("Initializing MCP...");

    // Start MCP server if enabled
    if (this.config.mcp.server.enabled) {
      this.mcpServer = new QuizAgentMCPServer();
      
      if (this.config.mcp.server.stdio) {
        // For stdio mode, the server will be started when connected to
        console.log("MCP server configured for stdio mode");
      } else {
        await this.mcpServer.start();
        console.log("MCP server started");
      }
    }

    // Setup MCP client connections if enabled
    if (this.config.mcp.client.enabled) {
      if (this.config.mcp.client.autoConnect) {
        try {
          await setupCommonMCPConnections();
          console.log("MCP client auto-connections established");
        } catch (error) {
          console.warn("Some MCP auto-connections failed:", error);
        }
      }

      // Connect to configured servers
      for (const serverConfig of this.config.mcp.client.servers) {
        try {
          await mcpClient.connectToServer(serverConfig);
          console.log(`Connected to MCP server: ${serverConfig.name}`);
        } catch (error) {
          console.warn(`Failed to connect to MCP server ${serverConfig.name}:`, error);
        }
      }
    }
  }

  /**
   * Initialize A2A (Agent-to-Agent)
   */
  private async initializeA2A(): Promise<void> {
    console.log("Initializing A2A...");

    // Create and start the main quiz agent
    if (this.config.a2a.autoStart) {
      this.a2aAgent = createQuizA2AAgent(this.config.a2a.port);
      await this.a2aAgent.start();
      console.log(`A2A Quiz Agent started on port ${this.config.a2a.port}`);
    }

    // Register with coordinator if enabled
    if (this.config.a2a.coordinator.enabled && this.a2aAgent) {
      coordinator.registerAgent(this.a2aAgent);
      console.log("A2A agent registered with coordinator");
    }
  }

  /**
   * Shutdown all protocols
   */
  async shutdown(): Promise<void> {
    console.log("Shutting down protocols...");

    try {
      // Shutdown A2A
      if (this.a2aAgent) {
        await this.a2aAgent.stop();
        console.log("A2A agent stopped");
      }

      if (this.config.a2a.coordinator.enabled) {
        await coordinator.shutdown();
        console.log("A2A coordinator stopped");
      }

      // Shutdown MCP
      if (this.mcpServer) {
        await this.mcpServer.stop();
        console.log("MCP server stopped");
      }

      await mcpClient.disconnectAll();
      console.log("MCP client disconnected from all servers");

      this.initialized = false;
      console.log("Protocol shutdown complete");

    } catch (error) {
      console.error("Error during protocol shutdown:", error);
      throw error;
    }
  }

  /**
   * Get current protocol status
   */
  async getStatus() {
    if (!this.initialized) {
      return { initialized: false };
    }

    return {
      initialized: true,
      mcp: {
        enabled: this.config.mcp.enabled,
        server: {
          running: !!this.mcpServer,
        },
        client: {
          connectedServers: mcpClient.getConnectedServers(),
        },
      },
      a2a: {
        enabled: this.config.a2a.enabled,
        agent: {
          running: !!this.a2aAgent,
          port: this.config.a2a.port,
        },
        coordinator: coordinator.getStatus(),
      },
    };
  }

  /**
   * Log current status
   */
  private async logStatus(): Promise<void> {
    const status = await this.getStatus();
    console.log("Protocol Status:", JSON.stringify(status, null, 2));
  }

  /**
   * Get MCP server for stdio mode
   */
  getMCPServer(): QuizAgentMCPServer | undefined {
    return this.mcpServer;
  }

  /**
   * Get A2A agent
   */
  getA2AAgent() {
    return this.a2aAgent;
  }

  /**
   * Reconfigure protocols
   */
  async reconfigure(newConfig: Partial<ProtocolConfig>): Promise<void> {
    // Merge configs
    this.config = {
      ...this.config,
      ...newConfig,
      mcp: { ...this.config.mcp, ...newConfig.mcp },
      a2a: { ...this.config.a2a, ...newConfig.a2a },
    };

    // Restart if already initialized
    if (this.initialized) {
      await this.shutdown();
      await this.initialize();
    }
  }
}

// Singleton instance
export const protocolManager = new ProtocolManager();

// Auto-initialize if configured
if (process.env.PROTOCOLS_AUTO_INIT === "true") {
  protocolManager.initialize().catch(console.error);
}