import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType
} from 'discord.js';

import { db } from '../services/database';
import { validateAuthorization } from '../utils/validation';
import { logger } from '../utils/logger';
import { NewsCategory, NEWS_CATEGORIES } from '../types/news';

export const newsConfigCommand = {
    data: new SlashCommandBuilder()
        .setName('news-config')
        .setDescription('Configurer les news pour un channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Activer les news pour ce channel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel où envoyer les news')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('categories')
                        .setDescription('Catégories de news (séparées par des virgules)')
                        .setRequired(true)
                        .setChoices(
                            { name: '⚽ Sports', value: 'sports' },
                            { name: '🎮 Gaming', value: 'gaming' },
                            { name: '🎬 Films', value: 'films' },
                            { name: '📺 Séries', value: 'series' },
                            { name: '🤼 WWE', value: 'wwe' },
                            { name: '📚 Lectures', value: 'lectures' }
                        )
                )
                .addBooleanOption(option =>
                    option
                        .setName('threads')
                        .setDescription('Créer des threads pour chaque news')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option
                        .setName('reactions')
                        .setDescription('Ajouter des réactions aux news')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('max-par-heure')
                        .setDescription('Nombre maximum de news par heure')
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Désactiver les news pour un channel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel à désactiver')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Voir la configuration des news')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Modifier la configuration d\'un channel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel à modifier')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Activer/désactiver les news')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option
                        .setName('threads')
                        .setDescription('Créer des threads pour chaque news')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option
                        .setName('reactions')
                        .setDescription('Ajouter des réactions aux news')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('max-par-heure')
                        .setDescription('Nombre maximum de news par heure')
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            validateAuthorization(interaction.user.id);
        } catch (error) {
            await interaction.reply({
                content: '❌ Vous n\'êtes pas autorisé à utiliser cette commande',
                ephemeral: true
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'add':
                await handleAddConfig(interaction);
                break;
            case 'remove':
                await handleRemoveConfig(interaction);
                break;
            case 'list':
                await handleListConfigs(interaction);
                break;
            case 'update':
                await handleUpdateConfig(interaction);
                break;
            default:
                await interaction.reply({
                    content: '❌ Sous-commande inconnue',
                    ephemeral: true
                });
        }
    }
};

async function handleAddConfig(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel', true);
    const categoriesStr = interaction.options.getString('categories', true);
    const createThreads = interaction.options.getBoolean('threads') ?? false;
    const addReactions = interaction.options.getBoolean('reactions') ?? true;
    const maxPerHour = interaction.options.getInteger('max-par-heure') ?? 3;

    // Valider les catégories
    const categories = categoriesStr.split(',').map(c => c.trim()) as NewsCategory[];
    const validCategories = categories.filter(cat => cat in NEWS_CATEGORIES);

    if (validCategories.length === 0) {
        await interaction.editReply({
            content: '❌ Aucune catégorie valide fournie'
        });
        return;
    }

    try {
        // Vérifier si une config existe déjà
        const existingConfig = await db.getNewsChannelConfig(channel.id);
        if (existingConfig) {
            await interaction.editReply({
                content: `❌ Une configuration existe déjà pour ${channel}. Utilisez \`/news-config update\` pour la modifier.`
            });
            return;
        }

        await db.createNewsChannelConfig({
            channelId: channel.id,
            categories: validCategories,
            createThreads,
            addReactions,
            maxPerHour,
            enabled: true
        });

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Configuration des news créée')
            .addFields(
                { name: 'Channel', value: `${channel}`, inline: true },
                { name: 'Catégories', value: validCategories.map(c => NEWS_CATEGORIES[c]).join(', '), inline: true },
                { name: 'Max/heure', value: maxPerHour.toString(), inline: true },
                { name: 'Threads', value: createThreads ? '✅' : '❌', inline: true },
                { name: 'Réactions', value: addReactions ? '✅' : '❌', inline: true }
            );

        await interaction.editReply({ embeds: [embed] });

        logger.info('News config created', {
            channelId: channel.id,
            categories: validCategories,
            userId: interaction.user.id
        });

    } catch (error) {
        logger.error('Error creating news config', error as Error);
        await interaction.editReply({
            content: '❌ Erreur lors de la création de la configuration'
        });
    }
}

async function handleRemoveConfig(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel', true);

    try {
        const config = await db.getNewsChannelConfig(channel.id);
        if (!config) {
            await interaction.editReply({
                content: `❌ Aucune configuration trouvée pour ${channel}`
            });
            return;
        }

        await db.deleteNewsChannelConfig(channel.id);

        await interaction.editReply({
            content: `✅ Configuration des news supprimée pour ${channel}`
        });

        logger.info('News config removed', {
            channelId: channel.id,
            userId: interaction.user.id
        });

    } catch (error) {
        logger.error('Error removing news config', error as Error);
        await interaction.editReply({
            content: '❌ Erreur lors de la suppression de la configuration'
        });
    }
}

async function handleListConfigs(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const configs = await db.getEnabledNewsConfigs();

        if (configs.length === 0) {
            await interaction.editReply({
                content: '📝 Aucune configuration de news active'
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('📰 Configurations des news')
            .setDescription(`${configs.length} channel(s) configuré(s)`);

        for (const config of configs) {
            const channel = await interaction.client.channels.fetch(config.channelId);
            const channelName = channel ? `#${(channel as any).name}` : config.channelId;

            embed.addFields({
                name: channelName,
                value: [
                    `**Catégories:** ${config.categories.map(c => NEWS_CATEGORIES[c]).join(', ')}`,
                    `**Max/heure:** ${config.maxPerHour}`,
                    `**Threads:** ${config.createThreads ? '✅' : '❌'}`,
                    `**Réactions:** ${config.addReactions ? '✅' : '❌'}`,
                    `**Statut:** ${config.enabled ? '🟢 Actif' : '🔴 Inactif'}`
                ].join('\n'),
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        logger.error('Error listing news configs', error as Error);
        await interaction.editReply({
            content: '❌ Erreur lors de la récupération des configurations'
        });
    }
}

async function handleUpdateConfig(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel', true);
    const enabled = interaction.options.getBoolean('enabled');
    const createThreads = interaction.options.getBoolean('threads');
    const addReactions = interaction.options.getBoolean('reactions');
    const maxPerHour = interaction.options.getInteger('max-par-heure');

    try {
        const config = await db.getNewsChannelConfig(channel.id);
        if (!config) {
            await interaction.editReply({
                content: `❌ Aucune configuration trouvée pour ${channel}`
            });
            return;
        }

        const updates: any = {};
        if (enabled !== null) updates.enabled = enabled;
        if (createThreads !== null) updates.createThreads = createThreads;
        if (addReactions !== null) updates.addReactions = addReactions;
        if (maxPerHour !== null) updates.maxPerHour = maxPerHour;

        if (Object.keys(updates).length === 0) {
            await interaction.editReply({
                content: '❌ Aucune modification spécifiée'
            });
            return;
        }

        await db.updateNewsChannelConfig(channel.id, updates);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Configuration mise à jour')
            .addFields(
                { name: 'Channel', value: `${channel}`, inline: true }
            );

        Object.entries(updates).forEach(([key, value]) => {
            let displayKey = key;
            let displayValue = String(value);

            switch (key) {
                case 'enabled':
                    displayKey = 'Statut';
                    displayValue = value ? '🟢 Actif' : '🔴 Inactif';
                    break;
                case 'createThreads':
                    displayKey = 'Threads';
                    displayValue = value ? '✅' : '❌';
                    break;
                case 'addReactions':
                    displayKey = 'Réactions';
                    displayValue = value ? '✅' : '❌';
                    break;
                case 'maxPerHour':
                    displayKey = 'Max/heure';
                    break;
            }

            embed.addFields({ name: displayKey, value: displayValue, inline: true });
        });

        await interaction.editReply({ embeds: [embed] });

        logger.info('News config updated', {
            channelId: channel.id,
            updates,
            userId: interaction.user.id
        });

    } catch (error) {
        logger.error('Error updating news config', error as Error);
        await interaction.editReply({
            content: '❌ Erreur lors de la mise à jour de la configuration'
        });
    }
}