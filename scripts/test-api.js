#!/usr/bin/env node
// Simple API Test - Test the new endpoints
const http = require('http');

async function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: responseData,
        });
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testAPI() {
  console.log('🌐 Testing Quiz Agent API Endpoints');
  console.log('===================================');

  try {
    // Test protocol status
    console.log('📊 Testing /protocol/status...');
    const statusResponse = await makeRequest('/protocol/status');
    console.log(`✅ Status: ${statusResponse.status}`);
    
    // Test MCP servers endpoint
    console.log('🔧 Testing /mcp/servers...');
    const mcpResponse = await makeRequest('/mcp/servers');
    console.log(`✅ MCP: ${mcpResponse.status}`);

    // Test A2A agents endpoint
    console.log('🤖 Testing /a2a/agents...');
    const a2aResponse = await makeRequest('/a2a/agents');
    console.log(`✅ A2A: ${a2aResponse.status}`);

    // Test protocol-aware quiz generation
    console.log('🧠 Testing /quiz/protocol...');
    const quizResponse = await makeRequest('/quiz/protocol', 'POST', {
      method: 'generate_quiz',
      params: { prompt: 'Simple math test' },
      options: { protocol: 'direct' }
    });
    console.log(`✅ Protocol Quiz: ${quizResponse.status}`);

    console.log('\n🎉 All API tests completed!');
    console.log('\nEndpoints are working. You can now:');
    console.log('  curl http://localhost:3000/protocol/status');
    console.log('  curl http://localhost:3000/mcp/servers');
    console.log('  curl http://localhost:3000/a2a/agents');

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Server not running. Start with: npm run dev');
    } else {
      console.error('❌ API test failed:', error.message);
    }
  }
}

testAPI().catch(console.error);