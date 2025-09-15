import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder
} from 'discord.js';

import { db } from '../services/database';
import { createReviewModal } from './reviewModal';
import { validateAuthorization, formatWorkType, formatRating } from '../utils/validation';
import { logger } from '../utils/logger';

export const reviewCommand = {
    data: new SlashCommandBuilder()
        .setName('review')
        .setDescription('Ajouter une review d\'œuvre'),

    async execute(interaction: ChatInputCommandInteraction) {
        validateAuthorization(interaction.user.id);

        const modal = createReviewModal();
        await interaction.showModal(modal);

        logger.info('Review modal shown', {
            userId: interaction.user.id,
            username: interaction.user.username
        });
    }
};

export const myReviewsCommand = {
    data: new SlashCommandBuilder()
        .setName('mes-reviews')
        .setDescription('Voir toutes vos reviews'),

    async execute(interaction: ChatInputCommandInteraction) {
        validateAuthorization(interaction.user.id);

        await interaction.deferReply();

        const user = await db.findOrCreateUser(interaction.user.id, interaction.user.username);
        const reviews = await db.getUserReviews(user.id);

        if (reviews.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('📚 Vos reviews')
                .setDescription('Vous n\'avez pas encore de reviews.\nUtilisez `/review` pour ajouter votre première review !')
                .setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() });

            await interaction.editReply({ embeds: [embed] });

            logger.info('Empty reviews list shown', {
                userId: interaction.user.id,
                username: interaction.user.username
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle(`📚 Vos reviews (${reviews.length})`)
            .setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        reviews.forEach((review, index) => {
            const date = review.createdAt.toLocaleDateString('fr-FR');
            embed.addFields({
                name: `${index + 1}. ${review.title}`,
                value: `${formatWorkType(review.type)} • ${formatRating(review.rating)}\n📅 ${date}\n💭 ${review.comment.length > 100 ? review.comment.substring(0, 100) + '...' : review.comment}`,
                inline: false
            });
        });

        await interaction.editReply({ embeds: [embed] });

        logger.info('Reviews list shown', {
            userId: interaction.user.id,
            username: interaction.user.username,
            reviewCount: reviews.length
        });
    }
};

export const commands = [reviewCommand, myReviewsCommand];