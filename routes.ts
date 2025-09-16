import express from "express";
import { generateQuiz, generateStreamingQuiz } from "./agentController/agentController";
import { protocolMiddleware, protocolStatusHandler } from "./protocols/protocolRouter";

const quizRouter = express.Router();

// Original quiz endpoints
quizRouter.post("/quiz", generateQuiz);
quizRouter.get("/quiz/stream", generateStreamingQuiz);

// Protocol-enabled endpoints
quizRouter.post("/quiz/protocol", protocolMiddleware);
quizRouter.get("/protocol/status", protocolStatusHandler);

// MCP-specific endpoints
quizRouter.get("/mcp/servers", async (req, res) => {
  try {
    const { mcpClient } = await import("./protocols/mcp/mcpClient");
    const servers = mcpClient.getConnectedServers();
    res.json({ servers });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

quizRouter.post("/mcp/tools/:serverName", async (req, res) => {
  try {
    const { mcpClient } = await import("./protocols/mcp/mcpClient");
    const { serverName } = req.params;
    const tools = await mcpClient.listTools(serverName);
    res.json({ tools });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

quizRouter.post("/mcp/call/:serverName/:toolName", async (req, res) => {
  try {
    const { mcpClient } = await import("./protocols/mcp/mcpClient");
    const { serverName, toolName } = req.params;
    const { args } = req.body;
    const result = await mcpClient.callTool(serverName, toolName, args);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// A2A-specific endpoints
quizRouter.get("/a2a/agents", async (req, res) => {
  try {
    const { coordinator } = await import("./protocols/a2a/a2aCoordinator");
    const agents = coordinator.getAgents();
    res.json({ agents });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

quizRouter.get("/a2a/status", async (req, res) => {
  try {
    const { coordinator } = await import("./protocols/a2a/a2aCoordinator");
    const status = coordinator.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

quizRouter.post("/a2a/task", async (req, res) => {
  try {
    const { coordinator } = await import("./protocols/a2a/a2aCoordinator");
    const { type, params, agentId, priority = 1, timeout = 30000 } = req.body;
    
    const taskRequest = {
      id: require("uuid").v4(),
      type,
      params,
      requiredCapabilities: [type],
      priority,
      timeout,
    };

    const result = agentId 
      ? await coordinator.submitTaskToAgent(taskRequest, agentId)
      : await coordinator.submitTask(taskRequest);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default quizRouter;