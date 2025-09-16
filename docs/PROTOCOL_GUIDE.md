# Protocol Support Guide - Quiz Agent

This guide explains how to use the A2A (Agent-to-Agent) and MCP (Model Context Protocol) support in the Quiz Agent.

## Overview

The Quiz Agent now supports three execution modes:
1. **Direct**: Traditional single-agent execution
2. **MCP**: Model Context Protocol for external system integration
3. **A2A**: Agent-to-Agent communication for distributed execution

## Model Context Protocol (MCP)

MCP enables the Quiz Agent to connect with external systems and tools.

### Features
- **Server Mode**: Expose Quiz Agent capabilities via MCP
- **Client Mode**: Connect to external MCP servers
- **Tool Integration**: Seamless tool calling across systems
- **Resource Access**: Read data from external sources

### MCP Server Usage

Start the Quiz Agent as an MCP server:

```bash
npm run mcp-server
```

This exposes the following tools:
- `generate_quiz`: Generate 20 quiz questions
- `web_search`: Search the web for information
- `batch_web_content_extractor`: Extract content from URLs
- `run_full_agent`: Complete quiz generation with research

### MCP Client Usage

Connect to external MCP servers via the API:

```bash
# List connected servers
curl http://localhost:3000/mcp/servers

# List tools on a server
curl -X POST http://localhost:3000/mcp/tools/filesystem

# Call a tool
curl -X POST http://localhost:3000/mcp/call/filesystem/read_file \
  -H "Content-Type: application/json" \
  -d '{"args": {"path": "/path/to/file.txt"}}'
```

### Protocol-Aware Requests

Use the protocol middleware for automatic routing:

```bash
curl -X POST http://localhost:3000/quiz/protocol \
  -H "Content-Type: application/json" \
  -H "X-Protocol: mcp" \
  -d '{
    "method": "generate_quiz",
    "params": {"prompt": "JavaScript fundamentals"},
    "options": {"serverName": "quiz-server"}
  }'
```

## Agent-to-Agent (A2A) Communication

A2A enables multiple Quiz Agent instances to work together.

### Features
- **Distributed Execution**: Load balancing across agents
- **Agent Discovery**: Automatic capability detection
- **Task Coordination**: Intelligent task routing
- **Performance Monitoring**: Agent performance tracking

### Starting A2A Agents

Run the A2A demo to see agents in action:

```bash
npm run a2a-demo
```

This starts multiple agents on different ports and demonstrates:
- Agent network establishment
- Inter-agent communication
- Task coordination
- Load balancing

### A2A API Usage

```bash
# List active agents
curl http://localhost:3000/a2a/agents

# Check coordinator status  
curl http://localhost:3000/a2a/status

# Submit a task to any available agent
curl -X POST http://localhost:3000/a2a/task \
  -H "Content-Type: application/json" \
  -d '{
    "type": "generate_quiz",
    "params": {"prompt": "Machine Learning"},
    "priority": 1,
    "timeout": 30000
  }'

# Submit to specific agent
curl -X POST http://localhost:3000/a2a/task \
  -H "Content-Type: application/json" \
  -d '{
    "type": "web_search", 
    "params": {"query": "AI trends", "maxResults": 5},
    "agentId": "specific-agent-id"
  }'
```

### Protocol-Aware A2A Requests

```bash
curl -X POST http://localhost:3000/quiz/protocol \
  -H "Content-Type: application/json" \
  -H "X-Protocol: a2a" \
  -d '{
    "method": "generate_quiz",
    "params": {"prompt": "Data Science"},
    "options": {"priority": 2, "timeout": 45000}
  }'
```

## Configuration

Configure protocols via environment variables:

```bash
# Enable/disable protocols
MCP_ENABLED=true
A2A_ENABLED=true

# MCP settings
MCP_SERVER_ENABLED=true
MCP_CLIENT_ENABLED=true
MCP_AUTO_CONNECT=true

# A2A settings  
A2A_PORT=8080
A2A_AUTO_START=true
A2A_COORDINATOR_ENABLED=true
```

## API Endpoints

### Core Endpoints
- `POST /` - Direct quiz generation (original)
- `POST /quiz` - Controller-based generation
- `GET /quiz/stream` - Streaming generation
- `POST /quiz/protocol` - Protocol-aware generation

### Protocol Status
- `GET /protocol/status` - Overall protocol status

### MCP Endpoints
- `GET /mcp/servers` - List connected servers
- `POST /mcp/tools/:server` - List server tools
- `POST /mcp/call/:server/:tool` - Call specific tool

### A2A Endpoints  
- `GET /a2a/agents` - List active agents
- `GET /a2a/status` - Coordinator status
- `POST /a2a/task` - Submit task to agents

## Protocol Selection

The system automatically selects the best protocol based on:

1. **Header specification**: `X-Protocol: mcp|a2a|direct`
2. **Request options**: `protocol` field in request body
3. **Fallback order**: A2A → MCP → Direct

## Error Handling

All protocols include comprehensive error handling:

- **Timeouts**: Configurable per request
- **Retries**: Automatic retry on failure
- **Fallbacks**: Graceful degradation between protocols
- **Logging**: Detailed error and performance logging

## Best Practices

### MCP
- Use MCP for external system integration
- Configure timeout appropriately for external calls
- Handle server disconnections gracefully
- Monitor server availability

### A2A
- Use A2A for load distribution and scalability
- Configure agent priorities based on capabilities
- Monitor agent performance and health
- Implement proper cleanup on shutdown

### General
- Always check protocol status before critical operations
- Use protocol-aware endpoints for optimal routing
- Monitor execution times and adjust timeouts
- Implement proper error handling in client code

## Troubleshooting

### Common Issues

1. **MCP Server Connection Failed**
   - Check server availability and configuration
   - Verify stdio/network connectivity
   - Review server logs for errors

2. **A2A Agent Not Responding**
   - Check agent status via coordinator
   - Verify network connectivity between agents
   - Review agent performance metrics

3. **Protocol Selection Issues**
   - Check protocol headers and options
   - Verify protocol availability via status endpoint
   - Review fallback behavior in logs

### Debug Mode

Enable debug logging:

```bash
DEBUG_PROTOCOLS=true npm run dev
```

This provides detailed logging of:
- Protocol selection decisions
- Inter-agent communication
- MCP server interactions
- Performance metrics

## Examples

See the `scripts/` directory for working examples:
- `mcp-server.ts`: Standalone MCP server
- `a2a-demo.ts`: Multi-agent demonstration

These scripts show real-world usage patterns and can be adapted for your specific needs.