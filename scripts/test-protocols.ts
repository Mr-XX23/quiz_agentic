#!/usr/bin/env node
// Quick Protocol Test - Validates basic functionality
import { config } from "dotenv";

config();

async function testProtocols() {
  console.log("🧪 Testing Quiz Agent Protocol Support");
  console.log("=====================================");

  try {
    // Test imports
    console.log("✅ Testing imports...");
    const { protocolManager } = await import("../protocols/protocolManager");
    const { QuizAgentMCPServer } = await import("../protocols/mcp/mcpServer");
    const { createQuizA2AAgent } = await import("../protocols/a2a/a2aAgent");
    const { coordinator } = await import("../protocols/a2a/a2aCoordinator");
    console.log("✅ All imports successful");

    // Test MCP Server
    console.log("\n🔧 Testing MCP Server...");
    const mcpServer = new QuizAgentMCPServer();
    const tools = await mcpServer.listTools();
    console.log(`✅ MCP Server created with ${tools.tools.length} tools`);
    
    const resources = await mcpServer.listResources();
    console.log(`✅ MCP Server has ${resources.resources.length} resources`);

    // Test A2A Agent
    console.log("\n🤖 Testing A2A Agent...");
    const agent = createQuizA2AAgent();
    const agentInfo = agent.getInfo();
    console.log(`✅ A2A Agent created: ${agentInfo.name}`);
    console.log(`✅ Agent capabilities: ${agentInfo.capabilities.map(c => c.name).join(", ")}`);

    // Test Coordinator
    console.log("\n⚡ Testing A2A Coordinator...");
    coordinator.registerAgent(agent);
    const coordinatorStatus = coordinator.getStatus();
    console.log(`✅ Coordinator status: ${coordinatorStatus.agents} agents registered`);

    // Test Protocol Manager Status
    console.log("\n📊 Testing Protocol Manager...");
    const managerStatus = await protocolManager.getStatus();
    console.log("✅ Protocol Manager status:", {
      initialized: managerStatus.initialized,
      mcp: managerStatus.mcp?.enabled || false,
      a2a: managerStatus.a2a?.enabled || false,
    });

    console.log("\n🎉 All Protocol Tests Passed!");
    console.log("\n📚 Available Endpoints:");
    console.log("  POST /quiz/protocol     - Protocol-aware quiz generation");
    console.log("  GET  /protocol/status   - Protocol status");
    console.log("  GET  /mcp/servers      - List MCP servers");
    console.log("  GET  /a2a/agents       - List A2A agents");
    console.log("  GET  /a2a/status       - A2A coordinator status");
    
    console.log("\n🚀 To test full functionality:");
    console.log("  npm run dev            - Start main server");
    console.log("  npm run mcp-server     - Start MCP server");
    console.log("  npm run a2a-demo       - Run A2A demo");

  } catch (error) {
    console.error("❌ Protocol test failed:", error);
    process.exit(1);
  }
}

testProtocols().catch(console.error);