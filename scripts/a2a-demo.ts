#!/usr/bin/env node
// A2A Demo Script - Shows agent-to-agent communication
import { config } from "dotenv";
import { createQuizA2AAgent } from "../protocols/a2a/a2aAgent";
import { coordinator } from "../protocols/a2a/a2aCoordinator";

config();

async function runA2ADemo() {
  console.log("Starting A2A Demo...");

  try {
    // Create multiple agents
    const mainAgent = createQuizA2AAgent(8080);
    const helperAgent1 = createQuizA2AAgent(8081);
    const helperAgent2 = createQuizA2AAgent(8082);

    // Start agents
    await mainAgent.start();
    await helperAgent1.start();
    await helperAgent2.start();

    console.log("Agents started:");
    console.log("- Main Agent on port 8080");
    console.log("- Helper Agent 1 on port 8081");  
    console.log("- Helper Agent 2 on port 8082");

    // Register agents with coordinator
    coordinator.registerAgent(mainAgent);
    coordinator.registerAgent(helperAgent1);
    coordinator.registerAgent(helperAgent2);

    console.log("Agents registered with coordinator");

    // Connect agents to each other
    await mainAgent.connectToAgent("helper1", "ws://localhost:8081");
    await mainAgent.connectToAgent("helper2", "ws://localhost:8082");
    await helperAgent1.connectToAgent("main", "ws://localhost:8080");
    await helperAgent2.connectToAgent("main", "ws://localhost:8080");

    console.log("Agent network established");

    // Demonstrate inter-agent communication
    console.log("\n=== Testing Agent Communication ===");

    // Test direct agent-to-agent communication
    console.log("Testing direct agent communication...");
    const capabilities1 = await mainAgent.discoverCapabilities("helper1");
    console.log("Helper1 capabilities:", capabilities1.map(c => c.name));

    // Test quiz generation via coordinator
    console.log("\nTesting quiz generation via coordinator...");
    const quizTask = {
      id: "demo-task-1",
      type: "generate_quiz",
      params: { prompt: "Basic mathematics" },
      requiredCapabilities: ["generate_quiz"],
      priority: 1,
      timeout: 30000,
    };

    const result = await coordinator.submitTask(quizTask);
    console.log("Quiz generation result:", {
      success: result.success,
      agentId: result.agentId,
      duration: result.duration,
      questionsGenerated: result.result ? "Yes" : "No",
    });

    // Show coordinator status
    console.log("\n=== Coordinator Status ===");
    const status = coordinator.getStatus();
    console.log(JSON.stringify(status, null, 2));

    // Test web search capability
    console.log("\nTesting web search capability...");
    const searchTask = {
      id: "demo-task-2",
      type: "web_search",
      params: { query: "artificial intelligence", maxResults: 3 },
      requiredCapabilities: ["web_search"],
      priority: 1,
      timeout: 30000,
    };

    const searchResult = await coordinator.submitTask(searchTask);
    console.log("Web search result:", {
      success: searchResult.success,
      agentId: searchResult.agentId,
      duration: searchResult.duration,
      urlsFound: searchResult.result?.extractedUrls?.length || 0,
    });

    // Test broadcast
    console.log("\nTesting broadcast communication...");
    mainAgent.broadcast("status_check", { timestamp: new Date().toISOString() });

    // Wait a bit and show final status
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log("\n=== Final Agent Network Status ===");
    const agents = coordinator.getAgents();
    for (const [agentId, agentData] of Object.entries(agents)) {
      console.log(`Agent ${agentId}:`, {
        name: agentData.info.name,
        status: agentData.status,
        capabilities: agentData.info.capabilities.length,
        performance: agentData.performance,
      });
    }

    console.log("\n=== Demo Complete ===");
    console.log("Press Ctrl+C to stop all agents");

    // Keep running until interrupted
    process.on('SIGTERM', async () => {
      console.log('\nShutting down agents...');
      await mainAgent.stop();
      await helperAgent1.stop();
      await helperAgent2.stop();
      await coordinator.shutdown();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('\nShutting down agents...');
      await mainAgent.stop();
      await helperAgent1.stop();
      await helperAgent2.stop();
      await coordinator.shutdown();
      process.exit(0);
    });

  } catch (error) {
    console.error("A2A Demo failed:", error);
    process.exit(1);
  }
}

runA2ADemo().catch(console.error);