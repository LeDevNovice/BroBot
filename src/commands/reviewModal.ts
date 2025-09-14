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
import { validateWorkType, validateRating, formatWorkType, formatRating, isAuthorized } from '../utils/validation';

export function createReviewModal(): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId('review_modal')
        .setTitle('✨ Ajouter une review');

    const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Titre de l\'œuvre')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: The Matrix, One Piece...')
        .setRequired(true)
        .setMaxLength(100);

    const typeInput = new TextInputBuilder()
        .setCustomId('type')
        .setLabel('Type d\'œuvre')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('film, serie, manga, comics, roman, livre, anime, jeu')
        .setRequired(true)
        .setMaxLength(20);

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
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(typeInput),
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(ratingInput),
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(commentInput)
    );

    return modal;
}

export async function handleReviewSubmit(interaction: ModalSubmitInteraction) {
    if (!isAuthorized(interaction.user.id)) {
        return interaction.reply({
            content: '❌ Vous n\'êtes pas autorisé à utiliser ce bot.',
            ephemeral: true
        });
    }

    const title = interaction.fields.getTextInputValue('title');
    const typeString = interaction.fields.getTextInputValue('type');
    const ratingString = interaction.fields.getTextInputValue('rating');
    const comment = interaction.fields.getTextInputValue('comment');

    const type = validateWorkType(typeString);
    const rating = validateRating(ratingString);

    if (!type) {
        return interaction.reply({
            content: '❌ Type d\'œuvre invalide. Types acceptés: film, serie, manga, comics, roman, livre, anime, jeu',
            ephemeral: true
        });
    }

    if (rating === null) {
        return interaction.reply({
            content: '❌ Note invalide. Utilisez un nombre entre 0 et 5.',
            ephemeral: true
        });
    }

    try {
        const user = await db.findOrCreateUser(interaction.user.id, interaction.user.username);

        const review = await db.createReview(user.id, {
            title,
            type,
            rating,
            comment
        });

        const embed = new EmbedBuilder()
            .setColor('#00FF7F')
            .setTitle('✅ Review ajoutée !')
            .addFields(
                { name: '🎯 Œuvre', value: title, inline: true },
                { name: '📂 Type', value: formatWorkType(type), inline: true },
                { name: '⭐ Note', value: formatRating(rating), inline: true },
                { name: '💭 Commentaire', value: comment.length > 200 ? comment.substring(0, 200) + '...' : comment, inline: false }
            )
            .setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Erreur création review:', error);
        await interaction.reply({
            content: '❌ Erreur lors de la création de la review.',
            ephemeral: true
        });
    }
}