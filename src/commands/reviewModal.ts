import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ModalActionRowComponentBuilder,
    ModalSubmitInteraction,
    EmbedBuilder
} from 'discord.js';

import { db } from '../services/database';
import { logger } from '../utils/logger';
import {
    validateAuthorization,
    validateRatingStrict,
    validateTitle,
    validateComment,
    formatWorkType,
    formatRating
} from '../utils/validation';
import { WorkType } from '../types';

export function createReviewModal(workType: WorkType): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(`review_modal_${workType}`)
        .setTitle(`✨ Ajouter une review - ${formatWorkType(workType)}`);

    const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Titre de l\'œuvre')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: The Matrix, One Piece...')
        .setRequired(true)
        .setMaxLength(100);

    const ratingInput = new TextInputBuilder()
        .setCustomId('rating')
        .setLabel('Note (0-5)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Entre 0 et 5')
        .setRequired(true)
        .setMaxLength(1);

    const commentInput = new TextInputBuilder()
        .setCustomId('comment')
        .setLabel('Commentaire')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Votre avis sur cette œuvre...')
        .setRequired(true)
        .setMaxLength(1000);

    modal.addComponents(
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(titleInput),
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(ratingInput),
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(commentInput)
    );

    return modal;
}

export async function handleReviewSubmit(interaction: ModalSubmitInteraction) {
    validateAuthorization(interaction.user.id);

    // Extraire le type du customId du modal
    const workType = interaction.customId.replace('review_modal_', '') as WorkType;

    const titleInput = interaction.fields.getTextInputValue('title');
    const ratingInput = interaction.fields.getTextInputValue('rating');
    const commentInput = interaction.fields.getTextInputValue('comment');

    const title = validateTitle(titleInput);
    const rating = validateRatingStrict(ratingInput);
    const comment = validateComment(commentInput);

    const user = await db.findOrCreateUser(interaction.user.id, interaction.user.username);
    const review = await db.createReview(user.id, { title, type: workType, rating, comment });

    const embed = new EmbedBuilder()
        .setColor('#00FF7F')
        .setTitle('✅ Review ajoutée !')
        .addFields(
            { name: '🎯 Œuvre', value: title, inline: true },
            { name: '📂 Type', value: formatWorkType(workType), inline: true },
            { name: '⭐ Note', value: formatRating(rating), inline: true },
            { name: '💭 Commentaire', value: comment.length > 200 ? comment.substring(0, 200) + '...' : comment, inline: false }
        )
        .setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    logger.info('Review created successfully', {
        userId: interaction.user.id,
        username: interaction.user.username,
        reviewId: review.id,
        reviewTitle: title,
        reviewType: workType,
        reviewRating: rating
    });
}