import { PrismaClient } from '@prisma/client';
import { ReviewData } from '../types';

const prisma = new PrismaClient();

export class DatabaseService {
    async findOrCreateUser(discordId: string, username: string) {
        return await prisma.user.upsert({
            where: { discordId },
            update: { username },
            create: { discordId, username }
        });
    }

    async createReview(userId: string, reviewData: ReviewData) {
        return await prisma.review.create({
            data: {
                title: reviewData.title,
                type: reviewData.type,
                rating: reviewData.rating,
                comment: reviewData.comment,
                userId
            }
        });
    }

    async getUserReviews(userId: string) {
        return await prisma.review.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
    }

    async connect() {
        await prisma.$connect();
        console.log('✅ Connecté à la base de données');
    }

    async disconnect() {
        await prisma.$disconnect();
    }
}

export const db = new DatabaseService();