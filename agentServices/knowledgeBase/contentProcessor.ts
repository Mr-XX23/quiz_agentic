// services/contentProcessor.ts
import crypto from 'crypto-js';
import { KnowledgeCache } from '../database/schemas/knowledgeCache';

export interface ContentProcessingResult {
  contentHash: string;
  contentSummary: string;
  topicTags: string[];
  entityExtractions: string[];
  sourceReliabilityScore: number;
  contentQualityScore: number;
  freshnessScore: number;
  wordCount: number;
  readingTime: number;
  contentType: 'article' | 'research' | 'news' | 'documentation' | 'other';
  searchableText: string;
  expiresAt?: Date;
}

export class ContentProcessor {
  
  // Generate unique hash for content deduplication
  public generateContentHash(url: string, content: string): string {
    const combined = `${url}:${content.substring(0, 1000)}`;
    return crypto.SHA256(combined).toString();
  }

  // Normalize query for better matching
  public normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(word => word.length > 2)
      .sort()
      .join(' ');
  }

  // Extract domain from URL
  public extractDomain(url: string): string {
    try {
      const domain = new URL(url).hostname;
      return domain.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  // Calculate source reliability score
  public calculateSourceReliability(domain: string, url: string): number {
    const reliableDomains = {
      // Academic & Government
      '.edu': 0.95,
      '.gov': 0.95,
      '.org': 0.80,
      
      // Established publications
      'nature.com': 0.95,
      'sciencedaily.com': 0.90,
      'ncbi.nlm.nih.gov': 0.95,
      'ieee.org': 0.90,
      'springer.com': 0.90,
      'wiley.com': 0.85,
      
      // Tech & News
      'techcrunch.com': 0.75,
      'wired.com': 0.80,
      'arstechnica.com': 0.85,
      'reuters.com': 0.85,
      'bbc.com': 0.85,
      
      // Default scores
      '.com': 0.60,
      '.net': 0.55,
      '.io': 0.65
    };

    // Check specific domains first
    for (const [key, score] of Object.entries(reliableDomains)) {
      if (domain.includes(key)) {
        return score;
      }
    }

    // Check TLD patterns
    if (domain.endsWith('.edu') || domain.endsWith('.gov')) return 0.95;
    if (domain.endsWith('.org')) return 0.80;
    
    return 0.50;
  }

  // Analyze content quality
  public analyzeContentQuality(content: string, title: string): number {
    let score = 0.5; // Base score
    
    const wordCount = content.split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).length;
    const avgWordsPerSentence = wordCount / sentences;
    
    // Length quality indicators
    if (wordCount >= 300) score += 0.1;
    if (wordCount >= 800) score += 0.1;
    if (wordCount >= 1500) score += 0.1;
    
    // Structure quality indicators
    if (avgWordsPerSentence > 15 && avgWordsPerSentence < 25) score += 0.1;
    if (content.includes('\n\n')) score += 0.05; // Has paragraphs
    if (title.length > 10 && title.length < 80) score += 0.05;
    
    // Content depth indicators
    const hasNumbers = /\d/.test(content);
    const hasReferences = content.includes('http') || content.includes('doi:');
    const hasStructure = /^(#{1,6}\s|\*\s|-\s)/m.test(content);
    
    if (hasNumbers) score += 0.05;
    if (hasReferences) score += 0.1;
    if (hasStructure) score += 0.05;
    
    return Math.min(score, 1.0);
  }

  // Calculate freshness score
  public calculateFreshnessScore(createdAt: Date = new Date()): number {
    const now = new Date();
    const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // Exponential decay: fresh content = higher score
    if (ageInDays <= 1) return 1.0;
    if (ageInDays <= 7) return 0.9;
    if (ageInDays <= 30) return 0.8;
    if (ageInDays <= 90) return 0.6;
    if (ageInDays <= 180) return 0.4;
    if (ageInDays <= 365) return 0.2;
    
    return 0.1; // Very old content
  }

  // Extract topic tags (simplified - in production, use NLP)
  public extractTopicTags(content: string, title: string): string[] {
    const text = `${title} ${content}`.toLowerCase();
    const commonTopics = [
      'ai', 'artificial intelligence', 'machine learning', 'deep learning',
      'technology', 'science', 'research', 'medicine', 'health',
      'climate', 'environment', 'energy', 'renewable',
      'economics', 'business', 'finance', 'market',
      'education', 'learning', 'university', 'academic',
      'computer', 'software', 'programming', 'development',
      'crispr', 'gene editing', 'genetics', 'dna',
      'quantum', 'physics', 'chemistry', 'biology'
    ];
    
    return commonTopics.filter(topic => 
      text.includes(topic) || text.includes(topic.replace(/\s+/g, ''))
    ).slice(0, 10); // Limit to top 10 tags
  }

  // Simple entity extraction (in production, use proper NER)
  public extractEntities(content: string): string[] {
    const entities: string[] = [];
    
    // Extract potential entities (capitalized words/phrases)
    const capitalizedWords = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    
    // Filter out common words and keep meaningful entities
    const filtered = capitalizedWords
      .filter(word => word.length > 2 && !['The', 'This', 'That', 'With', 'From', 'When'].includes(word))
      .slice(0, 20); // Limit entities
    
    return [...new Set(filtered)]; // Remove duplicates
  }

  // Detect content type
  public detectContentType(content: string, url: string, title: string): 'article' | 'research' | 'news' | 'documentation' | 'other' {
    const text = `${title} ${content}`.toLowerCase();
    const urlLower = url.toLowerCase();
    
    // Research indicators
    if (text.includes('abstract') || text.includes('methodology') || text.includes('doi:') || 
        urlLower.includes('journal') || urlLower.includes('pubmed') || text.includes('references')) {
      return 'research';
    }
    
    // News indicators
    if (urlLower.includes('news') || text.includes('breaking') || text.includes('reported') ||
        text.includes('according to') || urlLower.includes('/news/')) {
      return 'news';
    }
    
    // Documentation indicators
    if (urlLower.includes('docs') || urlLower.includes('documentation') || 
        text.includes('getting started') || text.includes('api reference')) {
      return 'documentation';
    }
    
    // Default to article
    if (content.length > 500 && text.includes('article')) {
      return 'article';
    }
    
    return 'other';
  }

  // Calculate reading time
  public calculateReadingTime(content: string): number {
    const wordsPerMinute = 200;
    const wordCount = content.split(/\s+/).length;
    return Math.ceil(wordCount / wordsPerMinute);
  }

  // Generate searchable text
  public generateSearchableText(title: string, content: string, topicTags: string[]): string {
    return `${title} ${content} ${topicTags.join(' ')}`.toLowerCase();
  }

  // Calculate expiration date based on content type and freshness
  public calculateExpirationDate(contentType: string, domain: string): Date | undefined {
    const now = new Date();
    
    // News content expires quickly
    if (contentType === 'news') {
      return new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days
    }
    
    // Research content lasts longer
    if (contentType === 'research') {
      return new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 year
    }
    
    // Tech content has medium lifespan
    if (contentType === 'documentation' || domain.includes('tech')) {
      return new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000)); // 3 months
    }
    
    // General articles
    return new Date(now.getTime() + (180 * 24 * 60 * 60 * 1000)); // 6 months
  }

  // Main processing function
  public async processContent(
    url: string,
    title: string,
    content: string,
    searchQuery: string
  ): Promise<ContentProcessingResult> {
    
    const domain = this.extractDomain(url);
    const contentHash = this.generateContentHash(url, content);
    const wordCount = content.split(/\s+/).length;
    
    // Generate all analytics
    const sourceReliabilityScore = this.calculateSourceReliability(domain, url);
    const contentQualityScore = this.analyzeContentQuality(content, title);
    const freshnessScore = this.calculateFreshnessScore();
    const topicTags = this.extractTopicTags(content, title);
    const entityExtractions = this.extractEntities(content);
    const contentType = this.detectContentType(content, url, title);
    const readingTime = this.calculateReadingTime(content);
    const searchableText = this.generateSearchableText(title, content, topicTags);
    const expiresAt = this.calculateExpirationDate(contentType, domain);
    
    // Generate content summary (simplified - use LLM in production for better summaries)
    const contentSummary = this.generateContentSummary(content);
    
    return {
      contentHash,
      contentSummary,
      topicTags,
      entityExtractions,
      sourceReliabilityScore,
      contentQualityScore,
      freshnessScore,
      wordCount,
      readingTime,
      contentType,
      searchableText,
      expiresAt
    };
  }

  // Simple content summarization but need better approach in production ( llm )
  private generateContentSummary(content: string): string {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    // Take first few sentences and some from middle
    const summary = [
      ...sentences.slice(0, 2),
      ...sentences.slice(Math.floor(sentences.length / 2), Math.floor(sentences.length / 2) + 2)
    ].join('. ').substring(0, 500) + '...';
    
    return summary;
  }
}

// Export singleton instance
export const contentProcessor = new ContentProcessor();
