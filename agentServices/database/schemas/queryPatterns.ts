// database/schemas/queryPatterns.ts
import mongoose, { Schema, Document } from 'mongoose';

interface IQueryPattern extends Document {
  userQuery: string;
  normalizedQuery: string;
  queryIntent: string;
  topicCategories: string[];
  
  // Cache mapping
  matchedCacheIds: mongoose.Types.ObjectId[];
  
  // Performance analytics
  cacheHitRate: number;
  avgQuizQualityScore: number;
  totalRequests: number;
  successfulGenerations: number;
  
  // Learning data
  commonVariations: string[];
  synonyms: string[];
  relatedQueries: string[];
  
  createdAt: Date;
  lastUsedAt: Date;
}

const QueryPatternSchema = new Schema<IQueryPattern>({
  userQuery: { 
    type: String, 
    required: true,
    index: 'text'
  },
  normalizedQuery: { 
    type: String, 
    required: true,
    unique: true,
    index: true
  },
  queryIntent: { 
    type: String,
    enum: ['quiz_generation', 'factual_lookup', 'research', 'comparison', 'definition'],
    default: 'quiz_generation',
    index: true
  },
  topicCategories: [{
    type: String,
    index: true
  }],
  
  matchedCacheIds: [{
    type: Schema.Types.ObjectId,
    ref: 'KnowledgeCache'
  }],
  
  // Analytics
  cacheHitRate: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 1
  },
  avgQuizQualityScore: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 5
  },
  totalRequests: { 
    type: Number, 
    default: 0,
    index: -1
  },
  successfulGenerations: { 
    type: Number, 
    default: 0
  },
  
  // Learning data
  commonVariations: [String],
  synonyms: [String],
  relatedQueries: [String],
  
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: -1
  },
  lastUsedAt: { 
    type: Date, 
    default: Date.now,
    index: -1
  }
}, {
  timestamps: true,
  collection: 'query_patterns'
});

// Topic mapping for semantic relationships
interface ITopicMapping extends Document {
  topicName: string;
  synonyms: string[];
  relatedTopics: string[];
  parentTopics: string[];
  childTopics: string[];
  
  // Knowledge references
  knowledgeCacheIds: mongoose.Types.ObjectId[];
  
  // Performance metrics
  quizGenerationCount: number;
  avgSuccessRate: number;
  popularityScore: number;
  
  // Content freshness tracking
  lastContentUpdate: Date;
  needsRefresh: boolean;
}

const TopicMappingSchema = new Schema<ITopicMapping>({
  topicName: { 
    type: String, 
    required: true,
    unique: true,
    index: true
  },
  synonyms: [String],
  relatedTopics: [String],
  parentTopics: [String],
  childTopics: [String],
  
  knowledgeCacheIds: [{
    type: Schema.Types.ObjectId,
    ref: 'KnowledgeCache'
  }],
  
  quizGenerationCount: { 
    type: Number, 
    default: 0,
    index: -1
  },
  avgSuccessRate: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 1
  },
  popularityScore: { 
    type: Number, 
    default: 0,
    index: -1
  },
  
  lastContentUpdate: { 
    type: Date, 
    default: Date.now,
    index: -1
  },
  needsRefresh: { 
    type: Boolean, 
    default: false,
    index: true
  }
}, {
  timestamps: true,
  collection: 'topic_mappings'
});

export const TopicMapping = mongoose.model<ITopicMapping>('TopicMapping', TopicMappingSchema);
export const QueryPattern = mongoose.model<IQueryPattern>('QueryPattern', QueryPatternSchema);