// Protocol Router - Routes requests between MCP, A2A, and direct execution
import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { mcpClient } from "../mcp/mcpClient";
import { coordinator } from "../a2a/a2aCoordinator";
import { runAgent } from "../../agentController/agent";

export interface ProtocolRequest {
  protocol?: "mcp" | "a2a" | "direct";
  method: string;
  params: any;
  options?: {
    serverName?: string; // For MCP
    agentId?: string;    // For A2A
    timeout?: number;
    priority?: number;
  };
}

export interface ProtocolResponse {
  success: boolean;
  data?: any;
  error?: string;
  protocol: string;
  executionTime: number;
  metadata?: any;
}

export class ProtocolRouter {
  /**
   * Route a request to the appropriate protocol handler
   */
  async routeRequest(request: ProtocolRequest): Promise<ProtocolResponse> {
    const startTime = Date.now();
    
    try {
      let result: any;
      let protocol = request.protocol || "direct";

      switch (protocol) {
        case "mcp":
          result = await this.handleMCPRequest(request);
          break;
        
        case "a2a":
          result = await this.handleA2ARequest(request);
          break;
        
        case "direct":
        default:
          result = await this.handleDirectRequest(request);
          protocol = "direct";
          break;
      }

      return {
        success: true,
        data: result,
        protocol,
        executionTime: Date.now() - startTime,
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        protocol: request.protocol || "direct",
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Handle MCP protocol requests
   */
  private async handleMCPRequest(request: ProtocolRequest): Promise<any> {
    const { method, params, options } = request;
    
    if (!options?.serverName) {
      throw new Error("MCP requests require serverName in options");
    }

    // Try to call the tool on the specified MCP server
    try {
      return await mcpClient.callTool(options.serverName, method, params);
    } catch (error) {
      // If the specific server fails, try across all servers
      const results = await mcpClient.executeToolAcrossServers(method, params);
      const successfulResults = results.filter(r => r.success);
      
      if (successfulResults.length > 0) {
        return successfulResults[0].result;
      }
      
      throw new Error(`MCP execution failed: ${error}`);
    }
  }

  /**
   * Handle A2A protocol requests
   */
  private async handleA2ARequest(request: ProtocolRequest): Promise<any> {
    const { method, params, options } = request;
    
    const taskRequest = {
      id: uuidv4(),
      type: method,
      params,
      requiredCapabilities: [method],
      priority: options?.priority || 1,
      timeout: options?.timeout || 30000,
    };

    if (options?.agentId) {
      // Submit to specific agent
      const result = await coordinator.submitTaskToAgent(taskRequest, options.agentId);
      if (!result.success) {
        throw new Error(result.error || "A2A task failed");
      }
      return result.result;
    } else {
      // Submit to best available agent
      const result = await coordinator.submitTask(taskRequest);
      if (!result.success) {
        throw new Error(result.error || "A2A task failed");
      }
      return result.result;
    }
  }

  /**
   * Handle direct execution requests
   */
  private async handleDirectRequest(request: ProtocolRequest): Promise<any> {
    const { method, params } = request;
    
    switch (method) {
      case "generate_quiz":
      case "run_full_agent":
        return await runAgent(params.prompt);
      
      case "web_search":
        const { toolbyName } = await import("../../agentServices/agnetTool");
        return await toolbyName.web_search.invoke(params);
      
      case "batch_web_content_extractor":
        const tools = await import("../../agentServices/agnetTool");
        return await tools.toolbyName.batch_web_content_extractor.invoke(params);
      
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  /**
   * Get available protocols and their status
   */
  async getProtocolStatus() {
    return {
      direct: {
        available: true,
        description: "Direct execution on local agent",
      },
      mcp: {
        available: mcpClient.getConnectedServers().length > 0,
        servers: mcpClient.getConnectedServers(),
        description: "Model Context Protocol for external integrations",
      },
      a2a: {
        available: Object.keys(coordinator.getAgents()).length > 0,
        agents: coordinator.getStatus(),
        description: "Agent-to-Agent communication for distributed execution",
      },
    };
  }
}

// Singleton router instance
export const protocolRouter = new ProtocolRouter();

// Express middleware for protocol routing
export async function protocolMiddleware(req: Request, res: Response) {
  try {
    const protocolRequest: ProtocolRequest = {
      protocol: req.headers["x-protocol"] as any,
      method: req.body.method || "generate_quiz",
      params: req.body.params || { prompt: req.body.prompt },
      options: req.body.options || {},
    };

    const result = await protocolRouter.routeRequest(protocolRequest);
    
    if (result.success) {
      res.json({
        ...result.data,
        _protocol: {
          used: result.protocol,
          executionTime: result.executionTime,
          metadata: result.metadata,
        },
      });
    } else {
      res.status(500).json({
        error: result.error,
        protocol: result.protocol,
        executionTime: result.executionTime,
      });
    }

  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      protocol: "unknown",
    });
  }
}

// Status endpoint handler
export async function protocolStatusHandler(req: Request, res: Response) {
  try {
    const status = await protocolRouter.getProtocolStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}