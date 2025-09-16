# Developer Guide — LangGraph Quiz Agent

This guide explains the code structure, key functions, data shapes, and important implementation details to help contributors understand and extend the project.

## Architecture overview

- Agent-driven: The core is a LangGraph/reactive agent that uses tools to perform web search, content extraction, and quiz generation.
- Tools: Implemented with `@langchain/core/tools` and exposed to the agent as named tools. Tools have Zod schemas for input validation.
- State graph: Quiz generation uses a StateGraph to manage attempts, merging new questions, trimming excess, and validating the final result.

## Files and responsibilities

- `server.ts`

  - Entry point (Express). Expects a POST body with `{ prompt }`. Calls `runAgent(prompt)` from `agentController/agent.ts` and returns the validated JSON.
  - Important behavior: It expects the agent to return only the final JSON string. `server.ts` parses it and returns JSON to clients.
  - Error handling: Catches and returns 500 with the error message.

- `routes.ts`

  - Provides two routes (stubs):
    - `POST /quiz` — `generateQuiz` controller (currently returns a placeholder).
    - `GET /quiz/stream` — `generateStreamingQuiz` controller (SSE placeholder).
  - Notes: You can wire this router into `server.ts` instead of mounting the root handler. Streaming is currently a stub and will need an SSE-enabled agent run to push partial results.

- `agentController/agent.ts`

  - Exports: `runAgent(prompt: string) => Promise<string>`
  - What it does:
    - Creates an LLM (ChatOpenAI) instance.
    - Creates a `ToolNode` with tools from `agentServices/agnetTool.ts`.
    - Creates and invokes a React-style agent with a `MAIN_SYSTEM_PROMPT` that dictates high-level behavior (use direct generation for common topics, use web search + batch extraction for specialized topics).
    - Returns the final assistant message text (expected to be the full validated JSON string).
  - Important: model selection and temperature are hardcoded; change from `gpt-4o-mini` if needed.

- `agentController/agentController.ts`

  - Express controllers for quiz endpoints. Validate inputs, set SSE headers for streaming, and call underlying agent logic. Currently returns placeholder responses — implementers should call `runAgent` or the streaming agent path here.

- `agentServices/agnetTool.ts`

  - Defines tools (wrapped with `tool(...)`) and Zod input schemas:
    - `generate_quiz` — Calls `runQuizAgentGraph` to produce quiz content.
      - Inputs: `{ prompt: string, researchContent?: string }`
      - Returns: string (quiz JSON or plain text containing JSON)
    - `web_search` — Calls `travilyWebSearchTool` to return search results and extracted URLs.
      - Inputs: `{ query: string, maxResults?: number }`
      - Returns: search object with `extractedUrls`.
    - `batch_web_content_extractor` — Calls controller to load multiple URLs concurrently and returns combined content.
      - Inputs: `{ urls: string[], maxContentLength?: number }`
    - `extract_multiple_urls` — Shortcut wrapper to invoke batch extraction.
  - Implementation notes:
    - Each tool includes a Zod input schema for validation.
    - Tools return plain JS objects. The `ToolNode` wraps these for agent use.

- `agentServices/tools/quizGenerateTool/generateQuiz.ts`

  - Core quiz-generation state graph.
  - Exports:
    - `createQuizAgentGraph()` — builds and compiles the StateGraph.
    - `runQuizAgentGraph(prompt: string)` — creates initial state and invokes the graph, returning the final validated JSON.
  - Workflow:
    1. `generate_initial` — calls `generateQuiz(prompt)` to produce a batch of questions.
    2. `check_count` — compares collected questions to target (20). If exact, route to validation. If fewer, route to `generate_additional`. If more, trims.
    3. `generate_additional` — requests the exact missing count and appends.
    4. `validate` — calls `structuredJSONData` to parse and validate the final quiz JSON against the Zod schema.
    5. `handle_error` — raises errors.
  - Important details:
    - Retries up to 3 attempts to reach exactly 20 questions.
    - Uses regex to extract the first JSON object from model output: `content.match(/\{[\s\S]*\}/)`.
    - Be mindful that the regex may fail if the model wraps JSON in code fences. Consider improving extraction to strip triple backticks and language tags.

- `agentServices/tools/quizGenerateTool/structuredResponse.ts`

  - Exports: `structuredJSONData(data: string) => Promise<ValidatedQuizSchema>`
  - Responsibilities:
    - Parses string output into JSON (tries direct parse first, then extracts the first JSON object/array substring).
    - Normalizes arrays into the wrapper shape expected by `schemas/quizSchema.ts`.
    - Validates using the Zod schema, enforces exactly 20 questions, and returns the validated object.
  - Error modes:
    - Throws if no JSON found.
    - Throws if parsed object is missing `quiz_questions`.
    - Throws if the count is not exactly 20.
    - Throws Zod validation errors with helpful messages.

- `agentServices/tools/webSearchTool/webSearchTool.ts`

  - Exports: `travilyWebSearchTool({ query, maxResults })`.
  - Uses `@langchain/tavily`'s `TavilySearch` to perform web search.
  - Returns: `{ success, extractedUrls, searchResults, summary, nextAction }` or error suggestion when Tavily API fails.
  - Notes: This depends on `TAVILY_API_KEY`.

- `agentServices/tools/webSearchTool/batchWebContentExtractor.ts`

  - Exports: `batchWebContentExtractorController({ urls, maxContentLength })`.
  - Uses `CheerioWebBaseLoader` to load pages concurrently, with `p-limit` to cap concurrency at 5.
  - Returns combined content and metadata about success/failure per URL.
  - Error handling: Individual URL failures are recorded but don't stop the whole batch. If all fail, method returns success: false.

- `schemas/quizSchema.ts`
  - Zod schema exported as `QuizSchemaExport` that enforces:
    - top-level `data` object with `minItems: 20`, `maxItems: 20`, and `quiz_questions` array of length 20.
    - Each question must contain `question`, `correct_answer`, and `answers` (5 answers).

## Data contracts and shapes

- Tool inputs (examples):

  - generate_quiz: { prompt: string, researchContent?: string }
  - web_search: { query: string, maxResults?: number }
  - batch_web_content_extractor: { urls: string[], maxContentLength?: number }

- Final validated quiz shape (after `structuredJSONData`):
  - { data: { minItems: 20, maxItems: 20, quiz_questions: [ { question, correct_answer, answers: [{answer}, ...5] }, ...20 ] } }

## Edge cases and recommendations

- Model output may include surrounding prose, code fences, or multiple JSON objects. The current extractor takes the first JSON block found. Improve resilience by stripping backticks and filtering extraneous text.
- The graph attempts up to 3 times to reach 20 questions. If the model consistently produces more or fewer, consider changing the prompt engineering to be stricter (explicit "Return only JSON, no explanation").
- Concurrency and rate limits: `batchWebContentExtractor` uses `p-limit(5)`. Tune this depending on your environment and allowed request rate.
- Testing: Add unit tests for `structuredJSONData` (valid quiz, fewer than 20, non-JSON input). Write integration tests for the agent tools using small mock LLM responses.

## How to extend

- Add new tools in `agentServices/agnetTool.ts`, following the pattern: implement logic, export a `tool(...)` wrapper, include a Zod schema for inputs.
- If you need streaming, implement a streaming agent run in `agentController/agent.ts` and connect it to the `GET /quiz/stream` controller.
- To change the LLM, update the `ChatOpenAI` instantiation in `agentController/agent.ts` and in `quizGenerateTool/generateQuiz.ts`.

## Quick debugging checklist

- If quizzes fail validation, log the raw LLM output before parsing to inspect formatting.
- If web search returns no URLs, verify `TAVILY_API_KEY` and test `travilyWebSearchTool` in isolation.
- For timeouts while loading URLs, increase the `timeout` in `CheerioWebBaseLoader` or reduce concurrency.

---

If you'd like, I can also create:

- Unit tests for `structuredResponse.ts`.
- Wire `routes.ts` router into `server.ts` and implement the streaming SSE endpoint.
