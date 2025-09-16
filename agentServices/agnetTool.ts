// libraries
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// local imports - tools logic
import { runQuizAgentGraph } from "./tools/quizGenerateTool/generateQuiz";
import { batchWebContentExtractorController } from "./tools/webSearchTool/batchWebContentExtractor"
import { travilyWebSearchTool } from "./tools/webSearchTool/webSearchTool"

// TOOL 1 : A tool to generate quiz
const generateQuizTool = tool(
    async ({ prompt, researchContent }: { prompt: string; researchContent?: string }) => {
        let enhancedPrompt = prompt;
        if (researchContent && researchContent.trim().length > 0) {
            enhancedPrompt = `Create a quiz about: ${prompt} RESEARCH CONTENT TO BASE QUESTIONS ON:
            ${researchContent}
            Use this research content to create accurate, detailed quiz questions. Focus on key facts, concepts, and information from the provided content.`;
        }
        const quiz = await runQuizAgentGraph(enhancedPrompt);
        return quiz;
    },
    {
        name: "generate_quiz",
        description: "Generate exactly 20 quiz questions. Can include research content from web sources for accuracy.",
        schema: z.object({
            prompt: z.string(),
            researchContent: z.string().optional().describe("Combined content from web research")
        }),
    }
);

// TOOL 2 : web search tool with URL extraction
const webSearchTool = tool(
    async ({ query, maxResults = 5 }: { query: string; maxResults?: number }) => {
        const results = await travilyWebSearchTool({ query, maxResults });
        return results;
    },
    {
        name: "web_search",
        description: "Search the web and extract URLs for batch content loading. Returns search results and URLs for further processing.",
        schema: z.object({
            query: z.string().describe("Search query for the topic"),
            maxResults: z.number().optional().describe("Number of search results (default: 5)")
        })
    }
);

// TOOL 3 : Batch content extractor
const batchWebContentExtractor = tool(
    async ({ urls, maxContentLength = 8000 }: { urls: string[]; maxContentLength?: number }) => {
        const results = await batchWebContentExtractorController({ urls, maxContentLength });
        return results;
    },
    {
        name: "batch_web_content_extractor",
        description: "Extract content from multiple URLs concurrently for comprehensive research. Much faster than sequential loading.",
        schema: z.object({
            urls: z.array(z.string()).describe("Array of URLs to extract content from simultaneously"),
            maxContentLength: z.number().optional().describe("Maximum content length per URL (default: 8000)")
        })
    }
);

// TOOL 4 : Direct URL batch extractor (if URLs is given directly)
const directUrlBatchExtractor = tool(
    async ({ urls }: { urls: string[] }) => {
        return await batchWebContentExtractor.invoke({ urls });
    },
    {
        name: "extract_multiple_urls",
        description: "Directly extract content from a list of known URLs concurrently.",
        schema: z.object({
            urls: z.array(z.string()).describe("List of URLs to extract content from")
        })
    }
);

// single export for all tools
const tools = [generateQuizTool, batchWebContentExtractor, directUrlBatchExtractor, webSearchTool];

// export tools by name for easy access
const toolbyName = Object.fromEntries(
    tools.map(
        t => [t.name, t]
    )
);

// export tools and toolbyName
export { tools, toolbyName };
