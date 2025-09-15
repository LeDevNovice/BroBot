import { PrismaClient } from '@prisma/client';

import { ReviewData } from '../types';
import { DatabaseError } from '../utils/errors';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

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
}

export const db = new DatabaseService();