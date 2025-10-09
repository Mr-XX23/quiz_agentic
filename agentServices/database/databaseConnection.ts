// libraries
import mongoose from 'mongoose';
import { config } from 'dotenv';

config();

export class DatabaseManager {

    // Private constructor to prevent direct instantiation
    private static instance: DatabaseManager;

    // isConnected flag to track connection status
    private isConnected: boolean = false;

    private constructor() { }

    // getInstance method to get the singleton instance
    public static getInstance(): DatabaseManager {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }

    // Setup connection to MongoDB
    public async connect(): Promise<void> {

        // Prevent multiple connections
        if (this.isConnected) {
            console.log('📊 Database already connected');
            return;
        }

        try {

            const mongoUri = process.env.MONGODB_URI;

            // Ensure the URI is provided
            if (!mongoUri) {
                throw new Error('Environment variable MONGODB_URI is not set');
            }

            await mongoose.connect(mongoUri, {
                // connection options for optimal performance
                // Maintains a pool of 10 connections
                maxPoolSize: 10,

                // Keep trying to send operations for 5 seconds
                serverSelectionTimeoutMS: 5000,

                // Performance optimizations
                // Disable mongoose buffering
                bufferCommands: false,

                // Replica set settings (for production)
                retryWrites: true,
                w: 'majority',
            });

            this.isConnected = true;
            console.log('✅ MongoDB connected successfully');

            // Setup database optimization
            await this.setupIndexes();
            await this.setupTTLCleanup();

        } catch (error) {
            console.error('❌ MongoDB connection failed:', error);
            process.exit(1);
        }
    }

    // Setup indexes for performance optimization
    public async disconnect(): Promise<void> {

        if (!this.isConnected) return;

        await mongoose.disconnect();

        this.isConnected = false;

        console.log('🔌 MongoDB disconnected');
    }

    // Setup indexes for performance optimization
    private async setupIndexes(): Promise<void> {
        try {
            // Ensure all indexes are created
            console.log('🔍 Setting up database indexes...');

            // This will create any missing indexes defined in schemas
            await mongoose.connection.db?.collection('knowledge_cache').createIndexes([
                { key: { contentHash: 1 }, unique: true },
                { key: { normalizedQuery: 1, sourceReliabilityScore: -1 } },
                { key: { topicTags: 1, accessCount: -1 } },
                { key: { expiresAt: 1 }, expireAfterSeconds: 0 }
            ]);

            console.log('✅ Database indexes ready');
        } catch (error) {
            console.error('⚠️ Index setup warning:', error);
        }
    }

    // Setup TTL cleanup for expired content
    private async setupTTLCleanup(): Promise<void> {
        // Setup automatic cleanup for expired content
        console.log('🧹 TTL cleanup configured');
    }

    // Check if the database is ready
    public isReady(): boolean {
        return this.isConnected && mongoose.connection.readyState === 1;
    }
}

// Export singleton instance
export const db = DatabaseManager.getInstance();