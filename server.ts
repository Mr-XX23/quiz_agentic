// libraries
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";

// local imports
import { runAgent } from "./agentController/agent";
import quizRouter from "./routes";
import { protocolManager } from "./protocols/protocolManager";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Initialize protocols on startup
protocolManager.initialize().catch(console.error);

// Use the router for quiz endpoints
app.use("/", quizRouter);

// Keep the original direct endpoint for backward compatibility
app.post("/", async (req, res, next) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    // run the agent with the user prompt
    const result = await runAgent(prompt);

    // log and return the final structured response
    console.log("Quiz agent result:", result);

    // final response must be ONLY the complete validated JSON
    const finalResponse = JSON.parse(result);

    // return the final structured JSON response
    res.json(finalResponse);

  } catch (error: any) {
    // log and return error
    console.error("Server error:", error);

    // If the error is a known type, return a specific message
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Quiz agent API listening on http://localhost:${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`  POST /                       - Direct quiz generation (original)`);
  console.log(`  POST /quiz                   - Quiz generation via controller`);
  console.log(`  GET  /quiz/stream           - Streaming quiz generation`);
  console.log(`  POST /quiz/protocol         - Protocol-aware quiz generation`);
  console.log(`  GET  /protocol/status       - Protocol status`);
  console.log(`  GET  /mcp/servers           - List MCP servers`);
  console.log(`  POST /mcp/tools/:server     - List tools on MCP server`);
  console.log(`  POST /mcp/call/:server/:tool - Call MCP tool`);
  console.log(`  GET  /a2a/agents            - List A2A agents`);
  console.log(`  GET  /a2a/status            - A2A coordinator status`);
  console.log(`  POST /a2a/task              - Submit A2A task`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await protocolManager.shutdown();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await protocolManager.shutdown();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});