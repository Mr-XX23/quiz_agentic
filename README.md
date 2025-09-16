# Quiz Agent with A2A and MCP Protocol Support

A LangGraph-powered quiz generation agent with advanced protocol support for distributed execution and external system integration.

## 🚀 New Protocol Features

### Model Context Protocol (MCP) Support
- **MCP Server**: Expose Quiz Agent tools via Anthropic's Model Context Protocol
- **MCP Client**: Connect to external MCP servers for enhanced capabilities
- **Tool Integration**: Seamless tool calling across systems
- **Resource Access**: Read data from external sources

### Agent-to-Agent (A2A) Communication
- **Distributed Execution**: Load balancing across multiple agent instances
- **WebSocket Communication**: Real-time agent networking
- **Task Coordination**: Intelligent routing and task distribution
- **Performance Monitoring**: Agent health and performance tracking

### Protocol-Aware Routing
- **Intelligent Selection**: Automatic protocol selection based on capabilities
- **Fallback Handling**: Graceful degradation between protocols
- **Unified API**: Single endpoint supporting all protocols

## 📡 API Endpoints

### Core Endpoints
- `POST /` - Direct quiz generation (original)
- `POST /quiz` - Controller-based generation  
- `GET /quiz/stream` - Streaming generation
- `POST /quiz/protocol` - **NEW** Protocol-aware generation

### Protocol Management
- `GET /protocol/status` - **NEW** Overall protocol status

### MCP Endpoints
- `GET /mcp/servers` - **NEW** List connected MCP servers
- `POST /mcp/tools/:server` - **NEW** List tools on MCP server
- `POST /mcp/call/:server/:tool` - **NEW** Call MCP tool

### A2A Endpoints
- `GET /a2a/agents` - **NEW** List active agents
- `GET /a2a/status` - **NEW** Coordinator status
- `POST /a2a/task` - **NEW** Submit task to agent network

## 🛠 Usage Examples

### Protocol-Aware Quiz Generation
```bash
curl -X POST http://localhost:3000/quiz/protocol \
  -H "Content-Type: application/json" \
  -H "X-Protocol: a2a" \
  -d '{
    "method": "generate_quiz",
    "params": {"prompt": "Machine Learning Fundamentals"},
    "options": {"priority": 2, "timeout": 45000}
  }'
```

### MCP Tool Calling
```bash
curl -X POST http://localhost:3000/mcp/call/filesystem/read_file \
  -H "Content-Type: application/json" \
  -d '{"args": {"path": "/path/to/questions.txt"}}'
```

### A2A Task Distribution
```bash
curl -X POST http://localhost:3000/a2a/task \
  -H "Content-Type: application/json" \
  -d '{
    "type": "web_search",
    "params": {"query": "Latest AI research", "maxResults": 5},
    "priority": 1
  }'
```

## 🎮 Getting Started

### Install Dependencies
```bash
npm install
```

### Environment Configuration
Copy `.env.example` to `.env` and configure:
```bash
# Basic configuration
PORT=3000
OPENAI_API_KEY=your_key_here
TAVILY_API_KEY=your_key_here

# Protocol configuration
MCP_ENABLED=true
A2A_ENABLED=true
A2A_PORT=8080
```

### Start the Server
```bash
npm run dev
```

### Test Protocol Support
```bash
npm run test:api
```

### Run Protocol Demos
```bash
# Start MCP server
npm run mcp-server

# Run A2A demo
npm run a2a-demo
```

## 📖 Documentation

- [`docs/PROTOCOL_GUIDE.md`](docs/PROTOCOL_GUIDE.md) - Comprehensive protocol usage guide
- [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) - Original developer documentation

## 🏗 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Clients   │    │   HTTP Clients  │    │   A2A Agents    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │                      │                      │
     ┌────▼──────────────────────▼──────────────────────▼────┐
     │              Protocol Router                         │
     │  ┌─────────┐ ┌─────────┐ ┌─────────────────────────┐ │
     │  │   MCP   │ │ Direct  │ │         A2A             │ │
     │  │Handler  │ │Handler  │ │     Coordinator         │ │
     │  └─────────┘ └─────────┘ └─────────────────────────┘ │
     └─────────────────────┬───────────────────────────────┘
                           │
     ┌─────────────────────▼───────────────────────────────┐
     │              Quiz Agent Core                        │
     │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
     │  │ Quiz        │ │ Web Search  │ │ Content     │   │
     │  │ Generation  │ │ Tool        │ │ Extraction  │   │
     │  └─────────────┘ └─────────────┘ └─────────────┘   │
     └─────────────────────────────────────────────────────┘
```

## 🔧 Configuration Options

### Protocol Configuration
- `MCP_ENABLED` - Enable MCP support
- `MCP_SERVER_ENABLED` - Run as MCP server
- `A2A_ENABLED` - Enable A2A networking
- `A2A_PORT` - A2A WebSocket port
- `A2A_COORDINATOR_ENABLED` - Enable task coordination

### Performance Tuning
- `DEFAULT_TIMEOUT` - Default request timeout (30000ms)
- `MAX_CONCURRENT_TASKS` - Max concurrent A2A tasks (5)
- `AGENT_RETRY_ATTEMPTS` - Retry attempts for failed tasks (3)

## 🧪 Testing

### Unit Tests
```bash
npm run test:protocols  # Test protocol implementations
npm run test:api        # Test API endpoints
```

### Manual Testing
```bash
# Check protocol status
curl http://localhost:3000/protocol/status

# Test original endpoint (backward compatibility)
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Basic algebra"}'
```

## 🚧 Current Implementation Status

✅ **Completed**
- MCP server interface (simplified)
- A2A agent networking with WebSocket
- Protocol routing and selection
- API endpoint integration
- Configuration management
- Comprehensive documentation

🔄 **Future Enhancements**
- Full MCP SDK integration when stable
- Advanced load balancing algorithms
- Protocol-specific error recovery
- Performance metrics dashboard
- Agent discovery mechanisms

## 🤝 Contributing

The protocol implementation provides a foundation for:
- External system integration via MCP
- Distributed quiz generation via A2A
- Extensible tool calling across protocols
- Scalable agent orchestration

See the [Protocol Guide](docs/PROTOCOL_GUIDE.md) for detailed usage patterns and examples.

## 🎯 Original Features

- Generate exactly 20 multiple-choice questions (5 options each: A-E)
- Automatic web research for specialized topics
- Concurrent batch extraction of web content (3-5 URLs concurrently)
- Internal stateful generation with retries to ensure exactly 20 validated questions
- Final structured JSON validated against a Zod schema
- Tool-oriented architecture using `@langchain/langgraph` prebuilt agents

## 📝 License

MIT