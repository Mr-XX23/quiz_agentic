
import { KnowledgeCache } from '../database/schemas/knowledgeCache';
import { QueryPattern } from '../database/schemas/queryPatterns';
import { contentProcessor } from './contentProcessor';
import mongoose from 'mongoose';

export interface CacheSearchResult {
  content: any[];
  cacheHit: boolean;
  relevanceScore: number;
  source: 'exact_match' | 'semantic_match' | 'topic_match' | 'no_match';
  suggestions?: string[];
}

export interface CacheStoreOptions {
  searchQuery: string;
  url: string;
  title: string;
  content: string;
  bypassDuplicateCheck?: boolean;
}

export class KnowledgeCacheManager {
  
  // Store content in cache with background processing
  public async storeContent(options: CacheStoreOptions): Promise<{ success: boolean; cacheId?: string; isDuplicate?: boolean }> {
    try {
      const { searchQuery, url, title, content } = options;
      
      // Process content for quality metrics and metadata
      const processed = await contentProcessor.processContent(url, title, content, searchQuery);
      
      // Check for duplicates first
      if (!options.bypassDuplicateCheck) {
        const existing = await KnowledgeCache.findOne({ contentHash: processed.contentHash });
        if (existing) {
          // FIX 1: Type assertion for _id
          const existingId = existing._id as mongoose.Types.ObjectId;
          await this.updateContentUsage(existingId.toString());
          return { success: true, cacheId: existingId.toString(), isDuplicate: true };
        }
      }
      
      // Create new cache entry
      const cacheEntry = new KnowledgeCache({
        contentHash: processed.contentHash,
        searchQuery,
        normalizedQuery: contentProcessor.normalizeQuery(searchQuery),
        url,
        domain: contentProcessor.extractDomain(url),
        title,
        content,
        contentSummary: processed.contentSummary,
        
        // Quality metrics
        sourceReliabilityScore: processed.sourceReliabilityScore,
        contentQualityScore: processed.contentQualityScore,
        freshnessScore: processed.freshnessScore,
        
        // Categorization
        topicTags: processed.topicTags,
        entityExtractions: processed.entityExtractions,
        contentType: processed.contentType,
        
        // Metadata
        wordCount: processed.wordCount,
        readingTime: processed.readingTime,
        searchableText: processed.searchableText,
        expiresAt: processed.expiresAt,
        
        // Initialize usage stats
        accessCount: 1,
        lastAccessedAt: new Date(),
        successfulQuizGenerations: 0
      });
      
      const saved = await cacheEntry.save();
      
      // FIX 2: Type assertion for saved._id
      const savedId = saved._id as mongoose.Types.ObjectId;
      
      // Background: Update query patterns (don't await - fire and forget)
      setImmediate(() => this.updateQueryPattern(searchQuery, savedId));
      
      console.log(`✅ Cached content: ${title.substring(0, 50)}... (${processed.wordCount} words, quality: ${processed.contentQualityScore.toFixed(2)})`);
      
      return { success: true, cacheId: savedId.toString(), isDuplicate: false };
      
    } catch (error) {
      console.error('❌ Cache store failed:', error);
      return { success: false };
    }
  }

  // Intelligent content search with multiple fallback strategies
  public async searchContent(query: string, options: { 
    maxResults?: number, 
    minRelevanceScore?: number,
    preferFresh?: boolean,
    includeExpired?: boolean 
  } = {}): Promise<CacheSearchResult> {
    
    const { maxResults = 5, minRelevanceScore = 0.3, preferFresh = true, includeExpired = false } = options;
    const normalizedQuery = contentProcessor.normalizeQuery(query);
    
    try {
      // Strategy 1: Exact normalized query match
      const exactMatches = await this.findExactMatches(normalizedQuery, maxResults, includeExpired);
      if (exactMatches.length > 0) {
        await this.updateContentUsageMultiple(exactMatches.map(m => (m._id as mongoose.Types.ObjectId).toString()));
        return {
          content: exactMatches,
          cacheHit: true,
          relevanceScore: 1.0,
          source: 'exact_match'
        };
      }

      // Strategy 2: Semantic/full-text search
      const semanticMatches = await this.findSemanticMatches(query, maxResults, includeExpired);
      if (semanticMatches.length > 0) {
        const avgRelevance = semanticMatches.reduce((acc, m) => acc + (m.relevanceScore || 0.5), 0) / semanticMatches.length;
        if (avgRelevance >= minRelevanceScore) {
          await this.updateContentUsageMultiple(semanticMatches.map(m => (m._id as mongoose.Types.ObjectId).toString()));
          return {
            content: semanticMatches,
            cacheHit: true,
            relevanceScore: avgRelevance,
            source: 'semantic_match'
          };
        }
      }

      // Strategy 3: Topic-based matching
      const topicTags = contentProcessor.extractTopicTags(query, query);
      if (topicTags.length > 0) {
        const topicMatches = await this.findTopicMatches(topicTags, maxResults, includeExpired);
        if (topicMatches.length > 0) {
          const avgRelevance = topicMatches.reduce((acc, m) => acc + (m.relevanceScore || 0.4), 0) / topicMatches.length;
          if (avgRelevance >= minRelevanceScore) {
            await this.updateContentUsageMultiple(topicMatches.map(m => (m._id as mongoose.Types.ObjectId).toString()));
            return {
              content: topicMatches,
              cacheHit: true,
              relevanceScore: avgRelevance,
              source: 'topic_match',
              suggestions: await this.generateSearchSuggestions(topicTags)
            };
          }
        }
      }

      // No matches found
      return {
        content: [],
        cacheHit: false,
        relevanceScore: 0,
        source: 'no_match',
        suggestions: await this.generateSearchSuggestions(topicTags)
      };

    } catch (error) {
      console.error('❌ Cache search failed:', error);
      return {
        content: [],
        cacheHit: false,
        relevanceScore: 0,
        source: 'no_match'
      };
    }
  }

  // Find exact matches
  private async findExactMatches(normalizedQuery: string, limit: number, includeExpired: boolean): Promise<any[]> {
    const filter: any = { normalizedQuery };
    
    if (!includeExpired) {
      filter.$or = [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ];
    }

    return await KnowledgeCache
      .find(filter)
      .sort({ 
        sourceReliabilityScore: -1, 
        contentQualityScore: -1, 
        accessCount: -1,
        freshnessScore: -1 
      })
      .limit(limit)
      .lean();
  }

  // Find semantic matches using MongoDB's text search
  private async findSemanticMatches(query: string, limit: number, includeExpired: boolean): Promise<any[]> {
    const filter: any = { 
      $text: { $search: query }
    };
    
    if (!includeExpired) {
      filter.$or = [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ];
    }

    const results = await KnowledgeCache
      .find(filter, { 
        score: { $meta: "textScore" } 
      })
      .sort({ 
        score: { $meta: "textScore" },
        sourceReliabilityScore: -1,
        contentQualityScore: -1
      })
      .limit(limit)
      .lean();

    // Add relevance score based on text search score
    return results.map(doc => ({
      ...doc,
      relevanceScore: Math.min((doc as any).score / 10, 1.0) // Normalize text score
    }));
  }

  // Find matches based on topic tags
  private async findTopicMatches(topicTags: string[], limit: number, includeExpired: boolean): Promise<any[]> {
    const filter: any = {
      topicTags: { $in: topicTags }
    };
    
    if (!includeExpired) {
      filter.$or = [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ];
    }

    const results = await KnowledgeCache.aggregate([
      { $match: filter },
      {
        $addFields: {
          matchingTagsCount: {
            $size: { $setIntersection: ["$topicTags", topicTags] }
          }
        }
      },
      {
        $addFields: {
          relevanceScore: {
            $multiply: [
              { $divide: ["$matchingTagsCount", topicTags.length] },
              0.7 // Base score for topic matching
            ]
          }
        }
      },
      { 
        $sort: { 
          relevanceScore: -1,
          sourceReliabilityScore: -1,
          contentQualityScore: -1,
          accessCount: -1
        }
      },
      { $limit: limit }
    ]);

    return results;
  }

  // Update content usage statistics
  private async updateContentUsage(cacheId: string): Promise<void> {
    try {
      await KnowledgeCache.findByIdAndUpdate(cacheId, {
        $inc: { accessCount: 1 },
        $set: { lastAccessedAt: new Date() }
      });
    } catch (error) {
      console.error('⚠️ Failed to update content usage:', error);
    }
  }

  // Update multiple content usage (batch operation)
  private async updateContentUsageMultiple(cacheIds: string[]): Promise<void> {
    try {
      await KnowledgeCache.updateMany(
        { _id: { $in: cacheIds.map(id => new mongoose.Types.ObjectId(id)) } },
        {
          $inc: { accessCount: 1 },
          $set: { lastAccessedAt: new Date() }
        }
      );
    } catch (error) {
      console.error('⚠️ Failed to update multiple content usage:', error);
    }
  }

  // Update or create query pattern for learning
  private async updateQueryPattern(searchQuery: string, cacheId: mongoose.Types.ObjectId): Promise<void> {
    try {
      const normalizedQuery = contentProcessor.normalizeQuery(searchQuery);
      
      await QueryPattern.findOneAndUpdate(
        { normalizedQuery },
        {
          $set: {
            userQuery: searchQuery,
            lastUsedAt: new Date()
          },
          $inc: { totalRequests: 1 },
          $addToSet: { 
            matchedCacheIds: cacheId,
            commonVariations: searchQuery
          }
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error('⚠️ Failed to update query pattern:', error);
    }
  }

  // Generate search suggestions based on similar content
  private async generateSearchSuggestions(topicTags: string[]): Promise<string[]> {
    try {
      if (topicTags.length === 0) return [];
      
      const suggestions = await KnowledgeCache.aggregate([
        { $match: { topicTags: { $in: topicTags } } },
        { $group: { _id: "$normalizedQuery", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $project: { query: "$_id", _id: 0 } }
      ]);
      
      return suggestions.map(s => s.query);
    } catch (error) {
      return [];
    }
  }

  // Get cache statistics for monitoring
  public async getCacheStatistics(): Promise<{
    totalEntries: number;
    totalSize: number;
    avgQualityScore: number;
    hitRate: number;
    topDomains: any[];
    topicDistribution: any[];
    expiringContent: number;
  }> {
    try {
      const stats = await KnowledgeCache.aggregate([
        {
          $group: {
            _id: null,
            totalEntries: { $sum: 1 },
            avgQualityScore: { $avg: "$contentQualityScore" },
            totalAccessCount: { $sum: "$accessCount" },
            totalWords: { $sum: "$wordCount" }
          }
        }
      ]);

      const topDomains = await KnowledgeCache.aggregate([
        { $group: { _id: "$domain", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);

      const topicDistribution = await KnowledgeCache.aggregate([
        { $unwind: "$topicTags" },
        { $group: { _id: "$topicTags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 }
      ]);

      const expiringContent = await KnowledgeCache.countDocuments({
        expiresAt: { $lt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
      });

      return {
        totalEntries: stats[0]?.totalEntries || 0,
        totalSize: stats[0]?.totalWords || 0,
        avgQualityScore: stats[0]?.avgQualityScore || 0,
        hitRate: 0, // Calculate from query patterns
        topDomains,
        topicDistribution,
        expiringContent
      };
    } catch (error) {
      console.error('❌ Failed to get cache statistics:', error);
      throw error;
    }
  }

  // Clean expired content
  public async cleanExpiredContent(): Promise<{ deletedCount: number }> {
    try {
      const result = await KnowledgeCache.deleteMany({
        expiresAt: { $lt: new Date() }
      });
      
      console.log(`🧹 Cleaned ${result.deletedCount} expired cache entries`);
      return { deletedCount: result.deletedCount };
    } catch (error) {
      console.error('❌ Failed to clean expired content:', error);
      throw error;
    }
  }

  // Record successful quiz generation for quality feedback
  public async recordQuizSuccess(cacheIds: string[]): Promise<void> {
    try {
      await KnowledgeCache.updateMany(
        { _id: { $in: cacheIds.map(id => new mongoose.Types.ObjectId(id)) } },
        { $inc: { successfulQuizGenerations: 1 } }
      );
    } catch (error) {
      console.error('⚠️ Failed to record quiz success:', error);
    }
  }
}

// Export singleton instance
export const cacheManager = new KnowledgeCacheManager();
