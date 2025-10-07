
import mongoose, { Schema, Document } from 'mongoose';

// Main knowledge cache interface
interface IKnowledgeCache extends Document {
  contentHash: string;
  searchQuery: string;
  normalizedQuery: string;
  url: string;
  domain: string;
  title: string;
  content: string;
  contentSummary: string;
  
  // Quality & reliability
  sourceReliabilityScore: number;
  contentQualityScore: number;
  freshnessScore: number;
  
  // Categorization & discovery
  topicTags: string[];
  entityExtractions: string[];
  language: string;
  
  // Usage analytics
  accessCount: number;
  lastAccessedAt: Date;
  successfulQuizGenerations: number;
  
  // Content metadata
  wordCount: number;
  readingTime: number;
  contentType: 'article' | 'research' | 'news' | 'documentation' | 'other';
  
  // Lifecycle management
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  
  // Search optimization
  searchableText: string;
}


// Knowledge cache schema with MongoDB optimizations
const KnowledgeCacheSchema = new Schema<IKnowledgeCache>({
  contentHash: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  searchQuery: { 
    type: String, 
    required: true,
    index: 'text'
  },
  normalizedQuery: { 
    type: String, 
    required: true,
    index: true
  },
  url: { 
    type: String, 
    required: true,
    index: true
  },
  domain: { 
    type: String, 
    required: true,
    index: true
  },
  title: { 
    type: String, 
    required: true,
    index: 'text'
  },
  content: { 
    type: String, 
    required: true 
  },
  contentSummary: { 
    type: String, 
    required: true,
    index: 'text'
  },
  
  // Quality scores
  sourceReliabilityScore: { 
    type: Number, 
    default: 0.5, 
    min: 0, 
    max: 1,
    index: -1
  },
  contentQualityScore: { 
    type: Number, 
    default: 0.5, 
    min: 0, 
    max: 1,
    index: -1
  },
  freshnessScore: { 
    type: Number, 
    default: 1.0, 
    min: 0, 
    max: 1,
    index: -1
  },
  
  // Discovery & categorization
  topicTags: [{
    type: String,
    index: true
  }],
  entityExtractions: [String],
  language: { 
    type: String, 
    default: 'en',
    index: true
  },
  
  // Analytics
  accessCount: { 
    type: Number, 
    default: 0,
    index: -1
  },
  lastAccessedAt: { 
    type: Date, 
    default: Date.now,
    index: -1
  },
  successfulQuizGenerations: { 
    type: Number, 
    default: 0,
    index: -1
  },
  
  // Metadata
  wordCount: { type: Number, default: 0 },
  readingTime: { type: Number, default: 0 },
  contentType: { 
    type: String, 
    enum: ['article', 'research', 'news', 'documentation', 'other'],
    default: 'other',
    index: true
  },
  
  // Lifecycle
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: -1
  },
  updatedAt: { 
    type: Date, 
    default: Date.now,
    index: -1
  },
  expiresAt: { 
    type: Date,
    index: { expireAfterSeconds: 0 }
  },
  
  // Search optimization
  searchableText: { 
    type: String,
    index: 'text'
  }
}, {
  timestamps: true, 
  collection: 'knowledge_cache'
});

// Compound indexes for common query patterns
KnowledgeCacheSchema.index({ 
  normalizedQuery: 1, 
  sourceReliabilityScore: -1, 
  freshnessScore: -1 
});

KnowledgeCacheSchema.index({ 
  topicTags: 1, 
  contentQualityScore: -1,
  accessCount: -1
});

KnowledgeCacheSchema.index({
  domain: 1,
  contentType: 1,
  createdAt: -1
});

// Full-text search index
KnowledgeCacheSchema.index({
  searchQuery: 'text',
  title: 'text',
  contentSummary: 'text',
  searchableText: 'text'
});

export const KnowledgeCache = mongoose.model<IKnowledgeCache>('KnowledgeCache', KnowledgeCacheSchema);