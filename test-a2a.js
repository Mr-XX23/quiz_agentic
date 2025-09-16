#!/usr/bin/env node

/**
 * Simple A2A Test Script
 * Tests the basic A2A functionality of the quiz agent
 */

const BASE_URL = process.env.QUIZ_AGENT_URL || "http://localhost:3000";

async function testAgentDiscovery() {
  console.log("🔍 Testing A2A Agent Discovery...");
  
  try {
    const response = await fetch(`${BASE_URL}/.well-known/agent.json`);
    
    if (!response.ok) {
      throw new Error(`Discovery failed: ${response.status}`);
    }
    
    const agentCard = await response.json();
    console.log("✅ Agent discovery successful");
    console.log(`   Name: ${agentCard.name}`);
    console.log(`   Version: ${agentCard.version}`);
    console.log(`   Capabilities: ${agentCard.capabilities?.length || 0}`);
    console.log(`   Service Endpoint: ${agentCard.serviceEndpoint}`);
    
    return agentCard;
  } catch (error) {
    console.error("❌ Agent discovery failed:", error.message);
    return null;
  }
}

async function testQuizGeneration() {
  console.log("\n📝 Testing Quiz Generation via A2A...");
  
  const payload = {
    jsonrpc: "2.0",
    method: "quiz.generate",
    params: {
      topic: "Basic Mathematics",
      difficulty: "easy"
    },
    id: 1
  };
  
  try {
    const response = await fetch(`${BASE_URL}/api/a2a/service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Quiz generation failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(`Agent error: ${result.error.message}`);
    }
    
    console.log("✅ Quiz generation successful");
    console.log(`   Total questions: ${result.result?.total_questions || 0}`);
    console.log(`   First question: ${result.result?.quiz_questions?.[0]?.question?.slice(0, 50)}...`);
    
    return result.result;
  } catch (error) {
    console.error("❌ Quiz generation failed:", error.message);
    return null;
  }
}

async function testWebSearch() {
  console.log("\n🔍 Testing Web Search via A2A...");
  
  const payload = {
    jsonrpc: "2.0",
    method: "web.search",
    params: {
      query: "artificial intelligence",
      maxResults: 3
    },
    id: 2
  };
  
  try {
    const response = await fetch(`${BASE_URL}/api/a2a/service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Web search failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(`Agent error: ${result.error.message}`);
    }
    
    console.log("✅ Web search successful");
    console.log(`   Results found: ${result.result?.results?.length || 0}`);
    
    return result.result;
  } catch (error) {
    console.error("❌ Web search failed:", error.message);
    return null;
  }
}

async function testHealthCheck() {
  console.log("\n🏥 Testing Health Check...");
  
  try {
    const response = await fetch(`${BASE_URL}/health`);
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    
    const health = await response.json();
    console.log("✅ Health check successful");
    console.log(`   Status: ${health.status}`);
    console.log(`   Agent: ${health.agent}`);
    
    return health;
  } catch (error) {
    console.error("❌ Health check failed:", error.message);
    return null;
  }
}

async function runTests() {
  console.log(`🧪 Running A2A Tests for Quiz Agent at ${BASE_URL}\n`);
  
  const results = {
    discovery: await testAgentDiscovery(),
    health: await testHealthCheck(),
    quizGeneration: await testQuizGeneration(),
    webSearch: await testWebSearch()
  };
  
  // Summary
  console.log("\n📊 Test Summary:");
  console.log("================");
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([test, result]) => {
    const status = result ? "✅ PASS" : "❌ FAIL";
    console.log(`${status} ${test}`);
  });
  
  console.log(`\nOverall: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log("🎉 All A2A tests passed! The quiz agent is A2A compatible.");
    process.exit(0);
  } else {
    console.log("⚠️  Some tests failed. Check the implementation.");
    process.exit(1);
  }
}

// Handle command line usage
if (require.main === module) {
  runTests().catch(error => {
    console.error("Test runner error:", error);
    process.exit(1);
  });
}

module.exports = { testAgentDiscovery, testQuizGeneration, testWebSearch, testHealthCheck };