# A2A (Agent-to-Agent) Protocol Implementation

This quiz generation platform now supports the **Agent-to-Agent (A2A) Protocol**, enabling seamless communication and collaboration between AI agents.

## What is A2A Protocol?

A2A (Agent-to-Agent) Protocol is a standardized communication framework that allows AI agents to:
- **Discover** other agents' capabilities
- **Communicate** using JSON-RPC protocol
- **Collaborate** on complex tasks
- **Interoperate** across different platforms

## A2A Endpoints

### Agent Discovery
- **GET** `/.well-known/agent.json` - Discover agent capabilities and endpoints

### Service Endpoints

#### Main Service Endpoint (handles all methods)
- **POST** `/api/a2a/service` - JSON-RPC endpoint for all methods

#### Individual Method Endpoints
- **POST** `/api/a2a/quiz/generate` - Generate quiz questions
- **POST** `/api/a2a/quiz/generate-with-research` - Generate quiz with web research
- **POST** `/api/a2a/web/search` - Web search functionality
- **POST** `/api/a2a/web/batch-extract` - Batch content extraction

## Supported Methods

### 1. `quiz.generate`
Generate exactly 20 multiple-choice quiz questions.

**Parameters:**
- `topic` (string, required) - The quiz topic
- `difficulty` (string, optional) - "easy", "medium", or "hard" 
- `researchContent` (string, optional) - Research content to base questions on

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "quiz.generate",
  "params": {
    "topic": "Ancient Rome",
    "difficulty": "medium"
  },
  "id": 1
}
```

### 2. `quiz.generate_with_research`
Generate quiz questions with automatic web research.

**Parameters:**
- `topic` (string, required) - The quiz topic
- `maxResults` (number, optional) - Max search results (default: 5)

**Example Request:**
```json
{
  "jsonrpc": "2.0", 
  "method": "quiz.generate_with_research",
  "params": {
    "topic": "Quantum Computing",
    "maxResults": 5
  },
  "id": 1
}
```

### 3. `web.search`
Search the web for information.

**Parameters:**
- `query` (string, required) - Search query
- `maxResults` (number, optional) - Max results (default: 5)

### 4. `web.batch_extract_content`
Extract content from multiple URLs concurrently.

**Parameters:**
- `urls` (array, required) - Array of URLs to extract content from
- `maxContentLength` (number, optional) - Max content length per URL (default: 8000)

## A2A Communication Tools

### Agent Discovery
Discover capabilities of other A2A-compatible agents:

```typescript
import { a2aDiscoverAgent } from './agentServices/tools/a2aCommunication';

const result = await a2aDiscoverAgent.invoke({
  agentUrl: "https://other-agent.com"
});
```

### Agent Communication
Communicate with other agents using JSON-RPC:

```typescript
import { a2aCommunicateWithAgent } from './agentServices/tools/a2aCommunication';

const result = await a2aCommunicateWithAgent.invoke({
  agentUrl: "https://other-agent.com",
  method: "quiz.generate",
  params: { topic: "Machine Learning" }
});
```

### Collaborative Quiz Generation
Collaborate with multiple agents to create better quizzes:

```typescript
import { a2aCollaborativeQuizGeneration } from './agentServices/tools/a2aCommunication';

const result = await a2aCollaborativeQuizGeneration.invoke({
  topic: "Artificial Intelligence",
  collaboratorAgentUrl: "https://quiz-agent-2.com",
  researchAgentUrl: "https://research-agent.com",
  difficulty: "hard"
});
```

## Agent Card Example

Our agent exposes this information at `/.well-known/agent.json`:

```json
{
  "name": "Quiz Generation Agent",
  "description": "An AI agent that generates exactly 20 multiple-choice quiz questions on any topic, with web research capabilities for specialized subjects.",
  "version": "1.0.0",
  "protocolVersion": "1.0",
  "capabilities": [
    "quiz.generate",
    "quiz.generate_with_research", 
    "web.search",
    "web.batch_extract_content"
  ],
  "serviceEndpoint": "/api/a2a/service",
  "serviceEndpoints": {
    "quiz.generate": "/api/a2a/quiz/generate",
    "quiz.generate_with_research": "/api/a2a/quiz/generate-with-research",
    "web.search": "/api/a2a/web/search",
    "web.batch_extract_content": "/api/a2a/web/batch-extract"
  }
}
```

## Use Cases

### 1. Single Agent Quiz Generation
```bash
curl -X POST https://your-agent.com/api/a2a/service \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "quiz.generate",
    "params": {"topic": "Physics"},
    "id": 1
  }'
```

### 2. Multi-Agent Collaboration
- **Research Agent** finds and extracts relevant information
- **Quiz Agent 1** generates first set of questions  
- **Quiz Agent 2** generates second set of questions
- **Coordinator Agent** combines and validates final quiz

### 3. Specialized Domain Quizzes
- Use domain-specific research agents for accurate information
- Leverage multiple quiz agents for diverse question styles
- Combine expertise for comprehensive quiz coverage

## Error Handling

All A2A endpoints follow JSON-RPC error conventions:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params - 'topic' is required",
    "data": {...}
  }
}
```

## Health Check

Monitor agent health:
- **GET** `/health` - Returns operational status

## Backward Compatibility

All existing endpoints remain functional:
- **POST** `/` - Original quiz generation endpoint
- **POST** `/api/quiz` - REST API endpoint  
- **GET** `/api/quiz/stream` - Streaming endpoint

## Testing A2A Compatibility

Use the comprehensive A2A testing suite from the LangGraph community to validate implementation:

```python
python a2a-test.py https://your-agent.com --comprehensive
```

## Examples

See the `/examples` directory for sample implementations of:
- Basic A2A client
- Multi-agent orchestration
- Collaborative quiz generation workflows

This A2A implementation enables your quiz agent to participate in the broader agent ecosystem, collaborating with other agents to create better educational content.