
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { cacheManager } from "../../knowledgeBase/knowledgeCacheManager";
import { db } from "../../database/databaseConnection";
import pLimit from "p-limit";

const limit = pLimit(5);

interface BatchExtractorOptions {
  urls: string[];
  maxContentLength: number;
  useCache: boolean;
  backgroundCache: boolean;
}

interface ExtractionResult {
  url: string;
  success: boolean;
  content: string;
  originalLength: number;
  title?: string;
  error?: string;
  cached?: boolean;
  cacheQuality?: number;
}

interface BatchExtractionResult {
  success: boolean;
  totalUrls: number;
  successfulLoads: number;
  cachedLoads: number;
  freshLoads: number;
  failedLoads: number;
  combinedContent: string;
  performanceMetrics: {
    cacheTime: number;
    extractionTime: number;
    totalTime: number;
    savedExtraction: number;
  };
  individualResults: ExtractionResult[];
  failedUrls: { url: string; error: string }[];
  nextAction: string;
}

export const batchWebContentExtractorController = async (options: BatchExtractorOptions): Promise<BatchExtractionResult> => {
  const { urls, maxContentLength, useCache, backgroundCache } = options;
  
  const startTime = Date.now();
  let cacheTime = 0;
  let extractionTime = 0;
  
  try {
    // Ensure database connection
    if (!db.isReady()) {
      await db.connect();
    }

    // FIX: Explicitly type the results array
    const results: ExtractionResult[] = [];
    let cachedLoads = 0;
    let freshLoads = 0;
    let failedLoads = 0;

    // Step 1: Check cache for each URL if enabled
    const urlCacheMap = new Map<string, any>();
    
    if (useCache) {
      const cacheStart = Date.now();
      console.log(`🔍 Checking cache for ${urls.length} URLs...`);
      
      const cacheChecks = await Promise.allSettled(
        urls.map(async (url) => {
          const cached = await cacheManager.searchContent(url, {
            maxResults: 1,
            minRelevanceScore: 0.8,
            includeExpired: false
          });
          
          if (cached.cacheHit && cached.content.length > 0) {
            const content = cached.content[0];
            return { url, cached: content, found: true };
          }
          return { url, cached: null, found: false };
        })
      );
      
      cacheChecks.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.found) {
          urlCacheMap.set(result.value.url, result.value.cached);
          cachedLoads++;
        }
      });
      
      cacheTime = Date.now() - cacheStart;
      console.log(`✅ Found ${cachedLoads}/${urls.length} URLs in cache`);
    }

    // Step 2: Extract fresh content for non-cached URLs
    const urlsToExtract = urls.filter(url => !urlCacheMap.has(url));
    
    if (urlsToExtract.length > 0) {
      const extractionStart = Date.now();
      console.log(`🔄 Extracting ${urlsToExtract.length} URLs from web...`);
      
      const extractionPromises = urlsToExtract.map(url => 
        limit(() => extractSingleUrl(url, maxContentLength))
      );
      
      const extractionResults = await Promise.allSettled(extractionPromises);
      
      extractionResults.forEach((result, index) => {
        const url = urlsToExtract[index];
        
        if (result.status === 'fulfilled' && result.value.success) {
          freshLoads++;
          results.push(result.value);
          
          // Background cache storage
          if (backgroundCache) {
            setImmediate(() => {
              cacheManager.storeContent({
                searchQuery: `url:${url}`,
                url: url,
                title: result.value.title || 'Extracted Content',
                content: result.value.content
              });
            });
          }
        } else {
          failedLoads++;
          results.push({
            url,
            success: false,
            error: result.status === 'rejected' ? result.reason?.message : 'Unknown error',
            content: "",
            originalLength: 0
          });
        }
      });
      
      extractionTime = Date.now() - extractionStart;
    }

    // Step 3: Combine cached and fresh results
    const allResults: ExtractionResult[] = [];
    
    // Add cached results
    for (const [url, cached] of urlCacheMap.entries()) {
      allResults.push({
        url,
        success: true,
        content: cached.contentSummary || cached.content?.substring(0, maxContentLength) || cached.content,
        originalLength: cached.wordCount * 5 || cached.content?.length || 0,
        title: cached.title,
        cached: true,
        cacheQuality: cached.contentQualityScore || 0.5
      });
    }
    
    allResults.push(...results);

    // Step 4: Generate combined content
    const successful = allResults.filter(r => r.success);
    const failed = allResults.filter(r => !r.success);
    
    const combinedContent = successful
      .map(r => `--- Content from ${r.url} ${r.cached ? '(cached)' : '(fresh)'} ---\n${r.content}\n`)
      .join('\n');

    const totalTime = Date.now() - startTime;

    console.log(`✅ Batch extraction completed: ${successful.length}/${urls.length} successful (${cachedLoads} cached, ${freshLoads} fresh, ${failedLoads} failed)`);

    return {
      success: true,
      totalUrls: urls.length,
      successfulLoads: successful.length,
      cachedLoads,
      freshLoads,
      failedLoads,
      combinedContent,
      performanceMetrics: {
        cacheTime,
        extractionTime,
        totalTime,
        savedExtraction: cachedLoads
      },
      individualResults: allResults,
      failedUrls: failed.map(f => ({ url: f.url, error: f.error || 'Unknown error' })),
      nextAction: successful.length > 0 
        ? "Use combinedContent for comprehensive quiz generation"
        : "All extractions failed - try different URLs or check network connectivity"
    };

  } catch (error: any) {
    console.error('❌ Intelligent batch extraction failed:', error);
    return {
      success: false,
      totalUrls: urls.length,
      successfulLoads: 0,
      cachedLoads: 0,
      freshLoads: 0,
      failedLoads: urls.length,
      combinedContent: "",
      performanceMetrics: {
        cacheTime,
        extractionTime,
        totalTime: Date.now() - startTime,
        savedExtraction: 0
      },
      individualResults: [],
      failedUrls: urls.map(url => ({ url, error: error.message })),
      nextAction: `Extraction failed: ${error.message}`
    };
  }
};

// Helper function to extract content from a single URL
async function extractSingleUrl(url: string, maxContentLength: number): Promise<ExtractionResult> {
  try {
    console.log(`🔄 Extracting: ${url}`);
    
    const loader = new CheerioWebBaseLoader(url, {
      selector: "body",
      timeout: 10000,
    });
    
    const docs = await loader.load();
    const content = docs[0]?.pageContent || "";
    
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;
    
    const cleanContent = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    const truncatedContent = cleanContent.length > maxContentLength 
      ? cleanContent.substring(0, maxContentLength) + "... [content truncated]"
      : cleanContent;
    
    console.log(`✅ Extracted ${truncatedContent.length} chars from ${url}`);
    
    return {
      url,
      success: true,
      content: truncatedContent,
      originalLength: content.length,
      title
    };
    
  } catch (error: any) {
    console.warn(`❌ Failed to extract ${url}:`, error.message);
    return {
      url,
      success: false,
      content: "",
      originalLength: 0,
      error: error.message
    };
  }
}
