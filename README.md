# quiz_agentic (LangGraph Quiz Agent)

A lightweight Quiz Agent built with LangGraph and LangChain tools with **A2A (Agent-to-Agent) Protocol compatibility**. This project demonstrates a small service that generates exactly 20 multiple-choice quiz questions for a given topic. It uses a combination of a reactive agent graph, web search and batch content extraction tools, JSON schema validation, and **agent-to-agent communication capabilities** to produce robust, validated quiz output.

## Key features

- Generate exactly 20 multiple-choice questions (5 options each: A-E).
- Automatic web research for specialized topics via the `web_search` tool.
- Concurrent batch extraction of web content (3-5 URLs concurrently) for fast research with `batch_web_content_extractor`.
- Internal stateful generation with retries to ensure exactly 20 validated questions.
- Final structured JSON validated against a Zod schema (`schemas/quizSchema.ts`).
- Tool-oriented architecture using `@langchain/langgraph` prebuilt agents and tool wrappers.
- **🚀 NEW: A2A (Agent-to-Agent) Protocol Support** - Enable collaboration with other AI agents
- **🤝 Multi-Agent Collaboration** - Work with research agents and other quiz agents for better results

## A2A Protocol Features

This agent is now **A2A (Agent-to-Agent) compatible**, which means it can:

- **Discover other agents** via standardized `.well-known/agent.json` endpoint
- **Communicate with other agents** using JSON-RPC protocol
- **Collaborate on quiz generation** with multiple agents
- **Provide services to other agents** through standardized endpoints

### A2A Endpoints

- **Agent Discovery**: `GET /.well-known/agent.json`
- **Main Service**: `POST /api/a2a/service` (handles all methods)
- **Individual Methods**:
  - `POST /api/a2a/quiz/generate`
  - `POST /api/a2a/quiz/generate-with-research`
  - `POST /api/a2a/web/search`
  - `POST /api/a2a/web/batch-extract`

See [A2A Implementation Guide](./docs/A2A_IMPLEMENTATION.md) for detailed documentation.

## Project structure (important files)

- `server.ts` — Minimal Express server that accepts a JSON body with `prompt` and runs the main agent.
- `routes.ts` — Router stubs for quiz endpoints (`POST /quiz`, `GET /quiz/stream`) and **A2A endpoints**.
- `agentController/agent.ts` — Creates and runs the main LangGraph agent. Defines the system prompt and orchestrates tools.
- `agentController/agentController.ts` — Express controller functions that expose quiz generation endpoints.
- `agentController/a2aService.ts` — **NEW: A2A-compatible JSON-RPC service handlers**.
- `agentServices/agnetTool.ts` — Tool registry that defines `generate_quiz`, `web_search`, `batch_web_content_extractor`, and `extract_multiple_urls` tools, plus **A2A communication tools**.
- `agentServices/tools/a2aCommunication.ts` — **NEW: A2A agent discovery and communication tools**.
- `agentServices/tools/quizGenerateTool/` — The quiz generation graph and structuring helpers (`generateQuiz.ts`, `structuredResponse.ts`).
- `agentServices/tools/webSearchTool/` — Web search and batch content extraction helpers (`webSearchTool.ts`, `batchWebContentExtractor.ts`).
- `schemas/quizSchema.ts` — Zod schema for validating the final quiz JSON.
- `.well-known/agent.json` — **NEW: A2A agent discovery configuration**.

## How it works (high level)

1. **Agent receives a request** (via HTTP endpoint or A2A protocol)
2. **Agent determines strategy** based on topic complexity:
   - Simple topics: Direct generation
   - Complex topics: Web research + generation
   - **NEW: Collaborative topics: Multi-agent coordination**
3. **Tools are executed** in optimal order (concurrent where possible)
4. **State management** ensures exactly 20 questions through retries
5. **JSON schema validation** confirms output format
6. **A2A compatibility** allows other agents to use these capabilities

## Endpoints

### Original Endpoints (Backward Compatible)
- POST / (main server endpoint)
  - Body: { "prompt": "<topic or request>" }
  - Returns: Validated JSON object matching the schema (only the JSON, no extra text)

- POST /api/quiz — implemented in `routes.ts` and served by `agentController/agentController.ts` (currently stubbed)
- GET /api/quiz/stream — SSE streaming endpoint (stubbed)

### A2A Protocol Endpoints
- GET /.well-known/agent.json — Agent discovery
- POST /api/a2a/service — Main A2A service endpoint (JSON-RPC)
- POST /api/a2a/quiz/generate — Direct quiz generation
- POST /api/a2a/quiz/generate-with-research — Quiz with web research
- POST /api/a2a/web/search — Web search service
- POST /api/a2a/web/batch-extract — Batch content extraction
- GET /health — Health check endpoint

## Environment variables

- `PORT` — port to run the Express server
- `OPENAI_API_KEY` — API key for OpenAI models used by the LLM tools
- `TAVILY_API_KEY` — API key for the Tavily web search provider

Create a `.env` file in the project root with values, for example:

```
PORT=3000
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
```

## How to run (development)

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your API keys
```

3. Build the project:

```bash
npm run build
```

4. Start in dev mode:

```bash
npm run dev
```

The agent will be available at:
- Main endpoint: `http://localhost:3000/`
- A2A discovery: `http://localhost:3000/.well-known/agent.json`
- A2A service: `http://localhost:3000/api/a2a/service`
- Health check: `http://localhost:3000/health`

## A2A Usage Examples

### Discover Agent Capabilities
```bash
curl http://localhost:3000/.well-known/agent.json
```

### Generate Quiz via A2A
```bash
curl -X POST http://localhost:3000/api/a2a/service \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "quiz.generate",
    "params": {"topic": "Machine Learning"},
    "id": 1
  }'
```

### Collaborative Quiz Generation
```bash
curl -X POST http://localhost:3000/api/a2a/service \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0", 
    "method": "quiz.generate_with_research",
    "params": {"topic": "Quantum Computing", "maxResults": 5},
    "id": 1
  }'
```

## Testing A2A Compatibility

Use the community A2A testing tools:

```bash
# Test basic discovery
curl http://localhost:3000/.well-known/agent.json

# Test with A2A testing suite
python a2a-test.py http://localhost:3000 --comprehensive
```

## Developer notes and next steps

- **Multi-agent workflows**: The A2A implementation enables complex workflows where multiple agents collaborate
- **Research enhancement**: Integration with specialized research agents for domain-specific content
- **Quality improvement**: Collaborative generation can leverage different agents' strengths
- **Ecosystem integration**: Full compatibility with the growing A2A agent ecosystem

For detailed A2A implementation information, see [A2A Implementation Guide](./docs/A2A_IMPLEMENTATION.md).

---

For more detailed, developer-oriented documentation see `docs/DEVELOPER_GUIDE.md`.
