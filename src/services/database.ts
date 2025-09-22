import { PrismaClient } from '@prisma/client';

import { ReviewData } from '../types';
import { DatabaseError } from '../utils/errors';
import { logger } from '../utils/logger';
import { isDevelopment } from '../config/env';
import { NewsItem, NewsCategory, NewsChannelConfig } from '../types/news';

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ??
    new PrismaClient({
        log: isDevelopment() ? ['query', 'error', 'warn'] : ['error'],
    });

if (isDevelopment()) globalForPrisma.prisma = prisma;

export class DatabaseService {
    async findOrCreateUser(discordId: string, username: string) {
        try {
            return await prisma.user.upsert({
                where: { discordId },
                update: { username },
                create: { discordId, username }
            });
        } catch (error) {
            logger.error('Failed to find or create user', error as Error, {
                discordId,
                username
            });
            throw new DatabaseError('Erreur lors de la création/récupération de l\'utilisateur');
        }
    }

    async createReview(userId: string, reviewData: ReviewData) {
        try {
            return await prisma.review.create({
                data: {
                    title: reviewData.title,
                    type: reviewData.type,
                    rating: reviewData.rating,
                    comment: reviewData.comment,
                    userId
                }
            });
        } catch (error) {
            logger.error('Failed to create review', error as Error, {
                userId,
                reviewTitle: reviewData.title
            });
            throw new DatabaseError('Erreur lors de la création de la review');
        }
    }

    async getUserReviews(userId: string) {
        try {
            return await prisma.review.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 10
            });
        } catch (error) {
            logger.error('Failed to get user reviews', error as Error, { userId });
            throw new DatabaseError('Erreur lors de la récupération des reviews');
        }
    }

    async connect() {
        try {
            await prisma.$connect();
            logger.info('Database connected successfully');
        } catch (error) {
            logger.error('Failed to connect to database', error as Error);
            throw new DatabaseError('Impossible de se connecter à la base de données');
        }
    }

    async disconnect() {
        try {
            await prisma.$disconnect();
            logger.info('Database disconnected');
        } catch (error) {
            logger.error('Failed to disconnect from database', error as Error);
        }
    }

    async reconnect() {
        try {
            await this.disconnect();
            await this.connect();
            logger.info('Database reconnected successfully');
        } catch (error) {
            logger.error('Failed to reconnect to database', error as Error);
            throw new DatabaseError('Impossible de se reconnecter à la base de données');
        }
    }

    async saveNewsItem(newsItem: NewsItem & { channelId: string; messageId?: string; threadId?: string }) {
        try {
            return await prisma.newsItem.create({
                data: {
                    externalId: newsItem.id,
                    title: newsItem.title,
                    description: newsItem.description,
                    url: newsItem.url,
                    publishedAt: newsItem.publishedAt,
                    source: newsItem.source,
                    category: newsItem.category,
                    imageUrl: newsItem.imageUrl,
                    author: newsItem.author,
                    channelId: newsItem.channelId,
                    messageId: newsItem.messageId,
                    threadId: newsItem.threadId
                }
            });
        } catch (error) {
            logger.error('Failed to save news item', error as Error, {
                externalId: newsItem.id,
                channelId: newsItem.channelId
            });
            throw new DatabaseError('Erreur lors de la sauvegarde de la news');
        }
    }

    async getAlreadySentNewsIds(externalIds: string[], channelId: string): Promise<string[]> {
        try {
            const results = await prisma.newsItem.findMany({
                where: {
                    externalId: { in: externalIds },
                    channelId
                },
                select: { externalId: true }
            });
            return results.map(r => r.externalId);
        } catch (error) {
            logger.error('Failed to get already sent news', error as Error);
            return [];
        }
    }

    async getNewsCountInLastHour(channelId: string): Promise<number> {
        try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const count = await prisma.newsItem.count({
                where: {
                    channelId,
                    sentAt: { gte: oneHourAgo }
                }
            });
            return count;
        } catch (error) {
            logger.error('Failed to get news count', error as Error);
            return 0;
        }
    }

    async createNewsChannelConfig(config: Omit<NewsChannelConfig, 'id' | 'createdAt' | 'updatedAt'>) {
        try {
            return await prisma.newsChannelConfig.create({
                data: {
                    channelId: config.channelId,
                    categories: config.categories,
                    createThreads: config.createThreads,
                    addReactions: config.addReactions,
                    maxPerHour: config.maxPerHour,
                    enabled: config.enabled
                }
            });
        } catch (error) {
            logger.error('Failed to create news channel config', error as Error, {
                channelId: config.channelId
            });
            throw new DatabaseError('Erreur lors de la création de la configuration');
        }
    }

    async getEnabledNewsConfigs(): Promise<NewsChannelConfig[]> {
        try {
            const configs = await prisma.newsChannelConfig.findMany({
                where: { enabled: true }
            });

            return configs.map(config => ({
                id: config.id,
                channelId: config.channelId,
                categories: config.categories as NewsCategory[],
                createThreads: config.createThreads,
                addReactions: config.addReactions,
                maxPerHour: config.maxPerHour,
                enabled: config.enabled,
                createdAt: config.createdAt,
                updatedAt: config.updatedAt
            }));
        } catch (error) {
            logger.error('Failed to get enabled news configs', error as Error);
            return [];
        }
    }

    async getNewsChannelConfig(channelId: string): Promise<NewsChannelConfig | null> {
        try {
            const config = await prisma.newsChannelConfig.findUnique({
                where: { channelId }
            });

            if (!config) return null;

            return {
                id: config.id,
                channelId: config.channelId,
                categories: config.categories as NewsCategory[],
                createThreads: config.createThreads,
                addReactions: config.addReactions,
                maxPerHour: config.maxPerHour,
                enabled: config.enabled,
                createdAt: config.createdAt,
                updatedAt: config.updatedAt
            };
        } catch (error) {
            logger.error('Failed to get news channel config', error as Error, { channelId });
            return null;
        }
    }

    async updateNewsChannelConfig(
        channelId: string,
        updates: Partial<Omit<NewsChannelConfig, 'id' | 'channelId' | 'createdAt' | 'updatedAt'>>
    ) {
        try {
            return await prisma.newsChannelConfig.update({
                where: { channelId },
                data: updates
            });
        } catch (error) {
            logger.error('Failed to update news channel config', error as Error, { channelId });
            throw new DatabaseError('Erreur lors de la mise à jour de la configuration');
        }
    }

    async deleteNewsChannelConfig(channelId: string) {
        try {
            await prisma.newsChannelConfig.delete({
                where: { channelId }
            });
        } catch (error) {
            logger.error('Failed to delete news channel config', error as Error, { channelId });
            throw new DatabaseError('Erreur lors de la suppression de la configuration');
        }
    }

    async getRecentNewsForChannel(channelId: string, limit: number = 10) {
        try {
            return await prisma.newsItem.findMany({
                where: { channelId },
                orderBy: { sentAt: 'desc' },
                take: limit
            });
        } catch (error) {
            logger.error('Failed to get recent news', error as Error, { channelId });
            return [];
        }
    }

    async cleanOldNews(daysOld: number = 30) {
        try {
            const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
            const result = await prisma.newsItem.deleteMany({
                where: {
                    sentAt: { lt: cutoffDate }
                }
            });

            logger.info(`Cleaned ${result.count} old news items`);
            return result.count;
        } catch (error) {
            logger.error('Failed to clean old news', error as Error);
            return 0;
        }
    }
}

export const db = new DatabaseService();