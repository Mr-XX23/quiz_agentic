// libraries
import { TavilySearch } from "@langchain/tavily";
import { config } from "dotenv";

// load .env variables
config();

// Enhanced web search tool with URL extraction
export const travilyWebSearchTool = async ({ query, maxResults = 5 }: { query: string; maxResults?: number }) => {
  try {
    const searchTool = new TavilySearch({
      maxResults,
      topic: "general",
      searchDepth: "basic",
      tavilyApiKey: process.env.TAVILY_API_KEY,
    });

    const searchResponse = await searchTool.invoke({ query });

    // Extract URLs for batch loading
    const urls = searchResponse.results
      .map((result: any) => result.url)
      .filter((url: string) => url && url.startsWith('http'))
      .slice(0, maxResults);

    console.log("Extracted URLs:", urls);

    return {
      success: true,
      query,
      searchResults: searchResponse.results,
      extractedUrls: urls,
      summary: `Found ${searchResponse.results.length} results for: ${query}`,
      nextAction: urls.length > 0
        ? "Call batch_web_content_extractor with the extractedUrls for detailed content"
        : "Try a different search query"
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      suggestion: "Try a different search query or check TAVILY_API_KEY"
    };
  }
}