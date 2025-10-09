<<<<<<< HEAD

# LangGraph Quiz Agent

A lightweight Quiz Agent built with LangGraph and LangChain tools. This project demonstrates a small service that generates exactly 20 multiple-choice quiz questions for a given topic. It uses a combination of a reactive agent graph, web search and batch content extraction tools, and JSON schema validation to produce robust, validated quiz output.

## Key features

- Generate exactly 20 multiple-choice questions (5 options each: A-E).
- Automatic web research for specialized topics via the `web_search` tool.
- Concurrent batch extraction of web content (3-5 URLs concurrently) for fast research with `batch_web_content_extractor`.
- Internal stateful generation with retries to ensure exactly 20 validated questions.
- Final structured JSON validated against a Zod schema (`schemas/quizSchema.ts`).
- Tool-oriented architecture using `@langchain/langgraph` prebuilt agents and tool wrappers.

## Project structure (important files)

- `server.ts` — Minimal Express server that accepts a JSON body with `prompt` and runs the main agent.
- `routes.ts` — Router stubs for quiz endpoints (`POST /quiz`, `GET /quiz/stream`).
- `agentController/agent.ts` — Creates and runs the main LangGraph agent. Defines the system prompt and orchestrates tools.
- `agentController/agentController.ts` — Express controller functions that expose quiz generation endpoints.
- `agentServices/agnetTool.ts` — Tool registry that defines `generate_quiz`, `web_search`, `batch_web_content_extractor`, and `extract_multiple_urls` tools.
- `agentServices/tools/quizGenerateTool/` — The quiz generation graph and structuring helpers (`generateQuiz.ts`, `structuredResponse.ts`).
- `agentServices/tools/webSearchTool/` — Web search and batch content extraction helpers (`webSearchTool.ts`, `batchWebContentExtractor.ts`).
- `schemas/quizSchema.ts` — Zod schema for validating the final quiz JSON.

## How it works (high level)

1. The Express server (`server.ts`) receives a POST request with `{ prompt }`.
2. `agentController/agent.ts` creates a reactive LangGraph agent with tools and a main system prompt (`MAIN_SYSTEM_PROMPT`).
3. For well-known topics the agent calls `generate_quiz` directly. For specialized topics, the agent uses `web_search` to fetch URLs, `batch_web_content_extractor` to load content concurrently, then calls `generate_quiz` with research content.
4. `generate_quiz` (tool) uses a stateful graph (`quizGenerateTool/generateQuiz.ts`) to generate, check, retry, and validate until exactly 20 questions are produced.
5. `structuredResponse.ts` parses and validates the output JSON against the `QuizSchema` using Zod; it enforces exactly 20 questions.

## Endpoints

- POST / (main server endpoint)

  - Body: { "prompt": "<topic or request>" }
  - Returns: Validated JSON object matching the schema (only the JSON, no extra text)

- (Planned) POST /quiz — implemented in `routes.ts` and served by `agentController/agentController.ts` (currently stubbed)
- (Planned) GET /quiz/stream — SSE streaming endpoint (stubbed)

## Environment variables

- `PORT` — port to run the Express server
- `OPENAI_API_KEY` — API key for OpenAI models used by the LLM tools
- `TAVILY_API_KEY` — API key for the Tavily web search provider

Create a `.env` file in the project root with values, for example:

PORT=3000
OPENAI_API_KEY=sk-...

# quiz_agentic (LangGraph Quiz Agent)

A lightweight Quiz Agent built with LangGraph and LangChain tools. This project demonstrates a small service that generates exactly 20 multiple-choice quiz questions for a given topic. It uses a combination of a reactive agent graph, web search and batch content extraction tools, and JSON schema validation to produce robust, validated quiz output.

## Key features

- Generate exactly 20 multiple-choice questions (5 options each: A-E).
- Automatic web research for specialized topics via the `web_search` tool.
- Concurrent batch extraction of web content (3-5 URLs concurrently) for fast research with `batch_web_content_extractor`.
- Internal stateful generation with retries to ensure exactly 20 validated questions.
- Final structured JSON validated against a Zod schema (`schemas/quizSchema.ts`).
- Tool-oriented architecture using `@langchain/langgraph` prebuilt agents and tool wrappers.

## Project structure (important files)

- `server.ts` — Minimal Express server that accepts a JSON body with `prompt` and runs the main agent.
- `routes.ts` — Router stubs for quiz endpoints (`POST /quiz`, `GET /quiz/stream`).
- `agentController/agent.ts` — Creates and runs the main LangGraph agent. Defines the system prompt and orchestrates tools.
- `agentController/agentController.ts` — Express controller functions that expose quiz generation endpoints.
- `agentServices/agnetTool.ts` — Tool registry that defines `generate_quiz`, `web_search`, `batch_web_content_extractor`, and `extract_multiple_urls` tools.
- `agentServices/tools/quizGenerateTool/` — The quiz generation graph and structuring helpers (`generateQuiz.ts`, `structuredResponse.ts`).
- `agentServices/tools/webSearchTool/` — Web search and batch content extraction helpers (`webSearchTool.ts`, `batchWebContentExtractor.ts`).
- `schemas/quizSchema.ts` — Zod schema for validating the final quiz JSON.

## How it works (high level)

1. The Express server (`server.ts`) receives a POST request with `{ prompt }`.
2. `agentController/agent.ts` creates a reactive LangGraph agent with tools and a main system prompt (`MAIN_SYSTEM_PROMPT`).
3. For well-known topics the agent calls `generate_quiz` directly. For specialized topics, the agent uses `web_search` to fetch URLs, `batch_web_content_extractor` to load content concurrently, then calls `generate_quiz` with research content.
4. `generate_quiz` (tool) uses a stateful graph (`quizGenerateTool/generateQuiz.ts`) to generate, check, retry, and validate until exactly 20 questions are produced.
5. `structuredResponse.ts` parses and validates the output JSON against the `QuizSchema` using Zod; it enforces exactly 20 questions.

## Endpoints

- POST / (main server endpoint)

  - Body: { "prompt": "<topic or request>" }
  - Returns: Validated JSON object matching the schema (only the JSON, no extra text)

- (Planned) POST /quiz — implemented in `routes.ts` and served by `agentController/agentController.ts` (currently stubbed)
- (Planned) GET /quiz/stream — SSE streaming endpoint (stubbed)

## Environment variables

- `PORT` — port to run the Express server
- `OPENAI_API_KEY` — API key for OpenAI models used by the LLM tools
- `TAVILY_API_KEY` — API key for the Tavily web search provider

Create a `.env` file in the project root with values, for example:

PORT=3000
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=...

## How to run (development)

1. Install dependencies:

```powershell
npm install
```

2. Start in dev mode:

```powershell
npm run dev
```

3. Send a POST request to the server root with JSON `{ "prompt": "Create a quiz about basic algebra" }`.

Notes:

- The server expects the model keys to be configured and accessible to the environment. If you don't have `OPENAI_API_KEY` or `TAVILY_API_KEY` set, parts of the toolchain will fail.

## Developer notes and next steps

- The `routes.ts` file wires up quiz endpoints but the main server currently mounts the root path directly to `agentController/agent.runAgent` flow. You may want to replace the root mount with the router in `server.ts` for clarity.
- Consider adding tests for the structuring logic in `structuredResponse.ts` (happy path + invalid JSON + fewer than 20 questions).
- Streaming endpoint (`GET /quiz/stream`) is stubbed — implement event streaming from the LangChain agent for real-time progress.

---

For more detailed, developer-oriented documentation see `docs/DEVELOPER_GUIDE.md`.
