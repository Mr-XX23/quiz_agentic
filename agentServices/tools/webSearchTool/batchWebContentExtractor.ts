import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import pLimit from "p-limit";

// Concurrent limit to avoid overwhelming servers and Maximum 5 concurrent requests
const limit = pLimit(5);

export const batchWebContentExtractorController = async ({ urls, maxContentLength = 8000 }: { urls: string[]; maxContentLength?: number }) => {
    try {
        // Function to load single URL with error handling
        const loadSingleUrl = async (url: string) => {
            try {
                console.log(`Loading content from: ${url}`);

                // Use CheerioWebBaseLoader for better content extraction
                const loader = new CheerioWebBaseLoader(url, {

                    // Extract main content
                    selector: "body",
                    // 10 second timeout per URL
                    timeout: 10000,
                });

                const docs = await loader.load();
                const content = docs[0]?.pageContent || "";

                // Clean and truncate content
                const cleanContent = content
                    // Normalize whitespace
                    .replace(/\s+/g, ' ')

                    // Remove empty lines
                    .replace(/\n\s*\n/g, '\n')
                    .trim();

                const truncatedContent = cleanContent.length > maxContentLength
                    ? cleanContent.substring(0, maxContentLength) + "... [content truncated]"
                    : cleanContent;

                return {
                    url,
                    success: true,
                    content: truncatedContent,
                    originalLength: content.length,
                    loadTime: Date.now()
                };
            } catch (error: any) {
                console.warn(`Failed to load ${url}:`, error.message);
                return {
                    url,
                    success: false,
                    error: error.message,
                    content: "",
                    originalLength: 0,
                    loadTime: Date.now()
                };
            }
        };

        // Load all URLs concurrently with rate limiting
        const startTime = Date.now();
        const results = await Promise.all(
            urls.map(url => limit(() => loadSingleUrl(url)))
        );
        const totalTime = Date.now() - startTime;

        // Separate successful and failed loads
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        // Combine all successful content
        const combinedContent = successful
            .map(r => `--- Content from ${r.url} ---\n${r.content}\n`)
            .join('\n');

        return {
            success: true,
            totalUrls: urls.length,
            successfulLoads: successful.length,
            failedLoads: failed.length,
            totalLoadTime: `${totalTime}ms`,
            combinedContent,
            individualResults: results,
            failedUrls: failed.map(f => ({ url: f.url, error: f.error })),
            nextAction: successful.length > 0
                ? "Use the combinedContent for comprehensive quiz generation"
                : "Try different URLs or search for alternative sources"
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message,
            totalUrls: urls.length,
            successfulLoads: 0,
            suggestion: "Check network connection and URL validity"
        };
    }
}