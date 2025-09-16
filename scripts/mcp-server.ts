#!/usr/bin/env node
// Standalone MCP Server for stdio mode
import { config } from "dotenv";
import { QuizAgentMCPServer } from "../protocols/mcp/mcpServer";

// Load environment variables
config();

async function main() {
  try {
    console.error("Starting Quiz Agent MCP Server in stdio mode...");
    
    const server = new QuizAgentMCPServer();
    await server.start();
    
    // Keep the process running
    process.on('SIGTERM', async () => {
      console.error('SIGTERM received, shutting down MCP server...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.error('SIGINT received, shutting down MCP server...');
      await server.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

main().catch(console.error);