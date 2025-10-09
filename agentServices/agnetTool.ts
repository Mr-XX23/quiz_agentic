// libraries
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// local imports - tools logic
import { runQuizAgentGraph } from "./tools/quizGenerateTool/generateQuiz";
import { batchWebContentExtractorController } from "./tools/webSearchTool/batchWebContentExtractor"
import { intelligentWebSearchController } from "./tools/webSearchTool/intelligentWebSearchTool";

// TOOL 1 : A tool to generate quiz
const generateQuizTool = tool(
    async ({ prompt, researchContent, targetCount = 20 }: { prompt: string; researchContent?: string, targetCount: number }) => {

        try {
            let enhancedPrompt = prompt;

            if (researchContent && researchContent.trim().length > 0) {
                enhancedPrompt = `Create a quiz about: ${prompt}
                    RESEARCH CONTENT TO BASE QUESTIONS ON:
                        ${researchContent}
                        Use this research content to create accurate, detailed quiz questions. Focus on key facts, concepts, and information from the provided content.`;
            }

            // Use enhanced quiz generation with options
            const quiz = await runQuizAgentGraph(enhancedPrompt, {
                targetCount,
                maxAttempts: 4
            });

            return {
                success: true,
                quiz,
                message: `Successfully generated ${targetCount} quiz questions`,
                targetCount
            };

        } catch (error: any) {
            // Return structured error that LLM can understand and act upon
            return {
                success: false,
                error: error.message,
                targetCount,
                suggestion: error.message.includes('Max attempts')
                    ? 'Try a simpler topic or break down the request into smaller parts'
                    : 'Check if the topic has sufficient available information for quiz creation'
            };
        }
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

// TOOL 2: Intelligent Web Search - Enhanced with comprehensive options
const intelligentWebSearchTool = tool(
    async ({
        query,
        maxResults = 5,
        forceRefresh = false,
        preferFresh = false,
        minCacheRelevance = 0.6
    }: {
        query: string;
        maxResults?: number;
        forceRefresh?: boolean;
        preferFresh?: boolean;
        minCacheRelevance?: number;
    }) => {
        // Delegate to controller with comprehensive error handling
        try {
            return await intelligentWebSearchController({
                query,
                maxResults,
                forceRefresh,
                preferFresh,
                minCacheRelevance
            });
        } catch (error: any) {
            return {
                success: false,
                cacheHit: false,
                source: 'error' as const,
                content: [],
                performanceMetrics: {
                    searchTime: 0,
                    cacheTime: 0,
                    totalTime: 0
                },
                nextAction: `Search controller error: ${error.message}`
            };
        }
    },
    {
        name: "intelligent_web_search",
        description: `Intelligent web search with advanced caching capabilities.
Features:
- Cache-first strategy with multiple fallback methods
- Semantic similarity matching for related content
- Topic-based content discovery
- Performance metrics and token usage tracking
- Background content caching for future requests
- Configurable cache relevance thresholds
- Force refresh option for current information`,
        schema: z.object({
            query: z.string().describe("Search query for the topic - be specific for better results"),
            maxResults: z.number().optional().describe("Number of search results (1-10, default: 5)"),
            forceRefresh: z.boolean().optional().describe("Force fresh search, bypass cache (default: false)"),
            preferFresh: z.boolean().optional().describe("Prefer fresh content over older cached content (default: false)"),
            minCacheRelevance: z.number().optional().describe("Minimum relevance score for cache results (0.1-1.0, default: 0.6)")
        })
    }
);

// TOOL 3: Batch Content Extractor - Enhanced with smart caching
const batchWebContentExtractorTool = tool(
    async ({
        urls,
        maxContentLength = 8000,
        useCache = true,
        backgroundCache = true
    }: {
        urls: string[];
        maxContentLength?: number;
        useCache?: boolean;
        backgroundCache?: boolean;
    }) => {
        // Validate input
        if (!urls || urls.length === 0) {
            return {
                success: false,
                totalUrls: 0,
                successfulLoads: 0,
                cachedLoads: 0,
                freshLoads: 0,
                failedLoads: 0,
                combinedContent: "",
                performanceMetrics: {
                    cacheTime: 0,
                    extractionTime: 0,
                    totalTime: 0,
                    savedExtraction: 0
                },
                individualResults: [],
                failedUrls: [],
                nextAction: "No URLs provided for extraction"
            };
        }

        try {
            return await batchWebContentExtractorController({
                urls,
                maxContentLength,
                useCache,
                backgroundCache
            });
        } catch (error: any) {
            return {
                success: false,
                totalUrls: urls.length,
                successfulLoads: 0,
                cachedLoads: 0,
                freshLoads: 0,
                failedLoads: urls.length,
                combinedContent: "",
                performanceMetrics: {
                    cacheTime: 0,
                    extractionTime: 0,
                    totalTime: 0,
                    savedExtraction: 0
                },
                individualResults: [],
                failedUrls: urls.map(url => ({ url, error: error.message })),
                nextAction: `Extraction controller error: ${error.message}`
            };
        }
    },
    {
        name: "batch_web_content_extractor",
        description: `Extract content from multiple URLs with intelligent caching.
Features:
- Concurrent processing of multiple URLs (up to 5 simultaneous)
- Smart cache checking before web extraction
- Background caching of new content
- Content cleaning and truncation
- Detailed performance metrics
- Individual result tracking with success/failure status
- Configurable content length limits`,
        schema: z.object({
            urls: z.array(z.string()).min(1).max(20).describe("Array of URLs to extract content from (1-20 URLs)"),
            maxContentLength: z.number().optional().describe("Maximum content length per URL (1000-50000, default: 8000)"),
            useCache: z.boolean().optional().describe("Use cached content when available (default: true)"),
            backgroundCache: z.boolean().optional().describe("Store new extractions in cache (default: true)")
        })
    }
);

// TOOL 4: Direct URL Batch Extractor - Simplified interface for direct URL processing
const directUrlBatchExtractor = tool(
    async ({ urls }: { urls: string[] }) => {
        // Input validation
        if (!urls || urls.length === 0) {
            return {
                success: false,
                message: "No URLs provided",
                suggestion: "Provide an array of valid URLs to extract content from"
            };
        }

        if (urls.length > 10) {
            return {
                success: false,
                message: "Too many URLs provided",
                suggestion: "Maximum 10 URLs allowed per request. Split into smaller batches."
            };
        }

        // Validate URL format
        const invalidUrls = urls.filter(url => {
            try {
                new URL(url);
                return false;
            } catch {
                return true;
            }
        });

        if (invalidUrls.length > 0) {
            return {
                success: false,
                message: "Invalid URLs detected",
                invalidUrls,
                suggestion: "Ensure all URLs are properly formatted (include http:// or https://)"
            };
        }

        try {
            // Delegate to batch extractor controller with default settings optimized for direct extraction
            const result = await batchWebContentExtractorController({
                urls,
                maxContentLength: 6000,
                useCache: true,
                backgroundCache: true
            });

            // Enhanced response for direct URL extraction
            return {
                ...result,
                extractionSummary: {
                    totalRequested: urls.length,
                    successful: result.successfulLoads,
                    fromCache: result.cachedLoads,
                    freshlyExtracted: result.freshLoads,
                    failed: result.failedLoads,
                    efficiency: result.cachedLoads > 0 ? `${Math.round((result.cachedLoads / urls.length) * 100)}% cache hit rate` : "No cache hits"
                }
            };

        } catch (error: any) {
            return {
                success: false,
                message: "Direct extraction failed",
                error: error.message,
                urls,
                suggestion: "Check network connectivity and URL accessibility"
            };
        }
    },
    {
        name: "extract_multiple_urls",
        description: `Directly extract content from a list of known URLs with intelligent processing.
Perfect for:
- Processing specific URLs provided by users
- Quick content extraction from known sources  
- Batch processing of research links
- Following up on search results with detailed content

Features:
- Automatic URL validation
- Optimized cache utilization
- Concurrent processing
- Detailed extraction summary
- Error handling with specific feedback`,
        schema: z.object({
            urls: z.array(z.string()).min(1).max(10).describe("List of URLs to extract content from (1-10 URLs, must be valid HTTP/HTTPS URLs)")
        })
    }
);

// single export for all tools
const tools = [generateQuizTool, batchWebContentExtractorTool, directUrlBatchExtractor, intelligentWebSearchTool,];

// export tools by name for easy access
const toolbyName = Object.fromEntries(
    tools.map(
        t => [t.name, t]
    )
);

// export tools and toolbyName
export { tools, toolbyName };
