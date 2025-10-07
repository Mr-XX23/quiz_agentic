// agentServices/tools/webSearchTool/intelligentWebSearchController.ts
import { TavilySearch } from "@langchain/tavily";
import { cacheManager } from "../../knowledgeBase/knowledgeCacheManager";
import { db } from "../../database/databaseConnection";

interface SearchControllerOptions {
    query: string;
    maxResults: number;
    forceRefresh: boolean;
    preferFresh: boolean;
    minCacheRelevance: number;
}

interface SearchResult {
    success: boolean;
    cacheHit: boolean;
    source: 'cache_exact' | 'cache_semantic' | 'fresh_search' | 'hybrid';
    content: any[];
    searchResults?: any[];
    extractedUrls?: string[];
    cacheInfo?: {
        relevanceScore: number;
        suggestions?: string[];
    };
    performanceMetrics: {
        searchTime: number;
        cacheTime: number;
        totalTime: number;
        savedTokens?: number;
        savedApiCalls?: number;
    };
    nextAction: string;
}

export const intelligentWebSearchController = async (options: SearchControllerOptions): Promise<SearchResult> => {
    const { query, maxResults, forceRefresh, preferFresh, minCacheRelevance } = options;

    const startTime = Date.now();
    let cacheTime = 0;
    let searchTime = 0;

    try {
        // Ensure database connection
        if (!db.isReady()) {
            await db.connect();
        }

        // Step 1: Check intelligent cache first (unless forced refresh)
        if (!forceRefresh) {
            const cacheStart = Date.now();

            const cacheResult = await cacheManager.searchContent(query, {
                maxResults,
                minRelevanceScore: minCacheRelevance,
                preferFresh,
                includeExpired: false
            });

            cacheTime = Date.now() - cacheStart;

            // If cache hit with sufficient relevance, return cached results
            if (cacheResult.cacheHit && cacheResult.relevanceScore >= minCacheRelevance) {
                console.log(`✅ Cache HIT for "${query}" - relevance: ${cacheResult.relevanceScore.toFixed(2)}, source: ${cacheResult.source}`);

                return {
                    success: true,
                    cacheHit: true,
                    source: cacheResult.source as any,
                    content: cacheResult.content,
                    cacheInfo: {
                        relevanceScore: cacheResult.relevanceScore,
                        suggestions: cacheResult.suggestions
                    },
                    performanceMetrics: {
                        searchTime: 0,
                        cacheTime,
                        totalTime: cacheTime,
                        savedTokens: estimateTokensSaved(cacheResult.content),
                        savedApiCalls: 1
                    },
                    nextAction: "Use cached content for quiz generation - no web search needed"
                };
            }

            // Partial cache hit - supplement with fresh search
            if (cacheResult.content.length > 0 && cacheResult.relevanceScore > 0.3) {
                console.log(`🔄 Partial cache hit for "${query}" - will supplement with fresh search`);

                const searchStart = Date.now();
                const freshSearch = await performWebSearch(query, Math.max(2, maxResults - cacheResult.content.length));
                searchTime = Date.now() - searchStart;

                if (freshSearch.success) {
                    // Background: Store new search results in cache
                    setImmediate(() => storeSearchResultsInCache(query, freshSearch.searchResults));

                    return {
                        success: true,
                        cacheHit: true,
                        source: 'hybrid',
                        content: [...cacheResult.content, ...freshSearch.searchResults],
                        searchResults: freshSearch.searchResults,
                        extractedUrls: freshSearch.extractedUrls,
                        cacheInfo: {
                            relevanceScore: cacheResult.relevanceScore,
                            suggestions: cacheResult.suggestions
                        },
                        performanceMetrics: {
                            searchTime,
                            cacheTime,
                            totalTime: cacheTime + searchTime,
                            savedTokens: estimateTokensSaved(cacheResult.content),
                            savedApiCalls: 0
                        },
                        nextAction: "Use hybrid cached + fresh content for comprehensive quiz generation"
                    };
                }
            }

            console.log(`❌ Cache MISS for "${query}" - proceeding with fresh search`);
        } else {
            console.log(`🔄 Forced refresh for "${query}" - bypassing cache`);
        }

        // Step 2: Perform fresh web search
        const searchStart = Date.now();
        const freshSearch = await performWebSearch(query, maxResults);
        searchTime = Date.now() - searchStart;

        if (!freshSearch.success) {
            return {
                success: false,
                cacheHit: false,
                source: 'fresh_search',
                content: [],
                performanceMetrics: {
                    searchTime,
                    cacheTime,
                    totalTime: cacheTime + searchTime
                },
                nextAction: "Search failed - try different query or check API keys"
            };
        }

        // Step 3: Background cache storage
        setImmediate(() => storeSearchResultsInCache(query, freshSearch.searchResults));

        return {
            success: true,
            cacheHit: false,
            source: 'fresh_search',
            content: freshSearch.searchResults,
            searchResults: freshSearch.searchResults,
            extractedUrls: freshSearch.extractedUrls,
            performanceMetrics: {
                searchTime,
                cacheTime,
                totalTime: cacheTime + searchTime
            },
            nextAction: "Use fresh search results for quiz generation - results cached for future use"
        };

    } catch (error: any) {
        console.error('❌ Intelligent search failed:', error);
        return {
            success: false,
            cacheHit: false,
            source: 'fresh_search',
            content: [],
            performanceMetrics: {
                searchTime,
                cacheTime,
                totalTime: Date.now() - startTime
            },
            nextAction: `Search error: ${error.message}`
        };
    }
};

// Helper Functions
async function performWebSearch(query: string, maxResults: number): Promise<{
    success: boolean;
    searchResults: any[];
    extractedUrls: string[];
}> {
    try {
        const searchTool = new TavilySearch({
            maxResults,
            tavilyApiKey: process.env.TAVILY_API_KEY,
        });

        const searchResponse = await searchTool.invoke({ query });
        const urls = searchResponse.results
            .map((result: any) => result.url)
            .filter((url: string) => url && url.startsWith('http'))
            .slice(0, maxResults);

        return {
            success: true,
            searchResults: searchResponse.results,
            extractedUrls: urls
        };
    } catch (error) {
        console.error('❌ Web search API failed:', error);
        return {
            success: false,
            searchResults: [],
            extractedUrls: []
        };
    }
}

async function storeSearchResultsInCache(query: string, searchResults: any[]): Promise<void> {
    try {
        console.log(`💾 Background caching ${searchResults.length} results for "${query}"`);

        const storePromises = searchResults.map(async (result) => {
            if (result.url && result.title && result.content) {
                return cacheManager.storeContent({
                    searchQuery: query,
                    url: result.url,
                    title: result.title,
                    content: result.content
                });
            }
        });

        await Promise.allSettled(storePromises);
        console.log(`✅ Background caching completed for "${query}"`);
    } catch (error) {
        console.error('⚠️ Background caching failed:', error);
    }
}

function estimateTokensSaved(cachedContent: any[]): number {
    return cachedContent.reduce((total, content) => {
        const contentLength = (content.content || '').length + (content.title || '').length;
        return total + Math.ceil(contentLength / 4);
    }, 0);
}
