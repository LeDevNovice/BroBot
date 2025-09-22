import { Client, TextChannel, EmbedBuilder, ThreadChannel } from 'discord.js';
import { NewsItem, NewsCategory, NewsChannelConfig, NEWS_CATEGORIES } from '../types/news';
import { logger } from '../utils/logger';
import { db } from './database';
import { RSSProvider } from './newsProviders/rssProvider';

export class NewsService {
    private provider: RSSProvider;
    private client: Client;
    private intervalId?: NodeJS.Timeout;
    private readonly checkInterval = 5 * 60 * 1000;
    private dryRun: boolean;

    constructor(client: Client, dryRun: boolean = false) {
        this.client = client;
        this.dryRun = dryRun || process.env.NEWS_DRY_RUN === 'true';
        this.provider = new RSSProvider();
    }

    start(): void {
        if (this.intervalId) {
            logger.warn('News service already running');
            return;
        }

        logger.info('Starting news service');

        setTimeout(() => {
            this.checkAndSendNews();
        }, 5 * 60 * 1000);

        this.intervalId = setInterval(() => {
            this.checkAndSendNews();
        }, this.checkInterval);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
            logger.info('News service stopped');
        }
    }

    private async checkAndSendNews(): Promise<void> {
        try {
            const configs = await db.getEnabledNewsConfigs();

            for (const config of configs) {
                await this.processConfigNews(config);
            }
        } catch (error) {
            logger.error('Error checking news', error as Error);
        }
    }

    private async processConfigNews(config: NewsChannelConfig): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(config.channelId) as TextChannel;
            if (!channel) {
                logger.warn(`Channel ${config.channelId} not found`);
                return;
            }

            const sentInLastHour = await db.getNewsCountInLastHour(config.channelId);
            if (sentInLastHour >= config.maxPerHour) {
                logger.debug(`Rate limit reached for channel ${config.channelId}`);
                return;
            }

            for (const category of config.categories) {
                const availableSlots = config.maxPerHour - sentInLastHour;
                if (availableSlots <= 0) break;

                await this.processCategoryNews(category, config, channel, 1);
            }
        } catch (error) {
            logger.error(`Error processing news for config ${config.id}`, error as Error);
        }
    }

    private async processCategoryNews(
        category: NewsCategory,
        config: NewsChannelConfig,
        channel: TextChannel,
        maxNews: number
    ): Promise<void> {
        try {
            logger.debug(`Fetching news for category ${category}`);
            const news = await this.provider.getNews(category, maxNews * 2);
            const newNews = await this.filterAlreadySentNews(news, config.channelId);

            if (newNews.length === 0) {
                logger.debug(`No new news found for ${category}`);
                return;
            }

            const newsToSend = newNews.slice(0, maxNews);

            for (const newsItem of newsToSend) {
                await this.sendNewsToChannel(newsItem, config, channel);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            if (newsToSend.length > 0) {
                logger.info(`Sent ${newsToSend.length} news items for ${category} to ${config.channelId}`);
            }

        } catch (error) {
            logger.error(`Error processing ${category} news`, error as Error);
        }
    }

    private async filterAlreadySentNews(news: NewsItem[], channelId: string): Promise<NewsItem[]> {
        const externalIds = news.map(n => n.id);
        const alreadySent = await db.getAlreadySentNewsIds(externalIds, channelId);
        const alreadySentSet = new Set(alreadySent);

        return news.filter(n => !alreadySentSet.has(n.id));
    }

    private async sendNewsToChannel(
        newsItem: NewsItem,
        config: NewsChannelConfig,
        channel: TextChannel
    ): Promise<void> {
        try {
            const embed = this.createNewsEmbed(newsItem);

            if (this.dryRun) {
                logger.info('🧪 [DRY RUN] Would send news', {
                    channelId: config.channelId,
                    channelName: channel.name,
                    newsTitle: newsItem.title,
                    newsSource: newsItem.source,
                    category: newsItem.category,
                    wouldCreateThread: config.createThreads,
                    wouldAddReactions: config.addReactions
                });

                await db.saveNewsItem({
                    ...newsItem,
                    channelId: config.channelId,
                    messageId: 'dry-run-message-id',
                    threadId: config.createThreads ? 'dry-run-thread-id' : undefined
                });

                return;
            }

            const message = await channel.send({
                embeds: [embed],
                content: `${NEWS_CATEGORIES[newsItem.category]} **Nouveauté**`
            });

            let threadId: string | undefined;

            if (config.createThreads) {
                try {
                    const thread = await message.startThread({
                        name: `💬 ${newsItem.title.substring(0, 80)}`,
                        autoArchiveDuration: 1440
                    });
                    threadId = thread.id;
                } catch (threadError) {
                    logger.warn('Failed to create thread', threadError as Error);
                }
            }

            if (config.addReactions) {
                try {
                    await message.react('👍');
                    await message.react('👎');
                } catch (reactionError) {
                    logger.warn('Failed to add reactions', reactionError as Error);
                }
            }

            await db.saveNewsItem({
                ...newsItem,
                channelId: config.channelId,
                messageId: message.id,
                threadId
            });

        } catch (error) {
            logger.error('Error sending news to channel', error as Error, {
                newsId: newsItem.id,
                channelId: config.channelId
            });
        }
    }

    private createNewsEmbed(newsItem: NewsItem): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle(newsItem.title)
            .setURL(newsItem.url)
            .setColor(this.getCategoryColor(newsItem.category))
            .setTimestamp(newsItem.publishedAt);

        if (newsItem.description) {
            const description = newsItem.description.length > 300
                ? newsItem.description.substring(0, 300) + '...'
                : newsItem.description;
            embed.setDescription(description);
        }

        if (newsItem.imageUrl) {
            embed.setImage(newsItem.imageUrl);
        }

        if (newsItem.author) {
            embed.setAuthor({ name: newsItem.author });
        }

        embed.setFooter({ text: `📰 ${newsItem.source}` });

        return embed;
    }

    private getCategoryColor(category: NewsCategory): number {
        const colors = {
            'sports': 0x00FF00,
            'gaming': 0x9966CC,
            'films': 0xFF6B6B,
            'series': 0x4ECDC4,
            'wwe': 0xFFD93D,
            'lectures': 0x6C5CE7
        };
        return colors[category] || 0x0099FF;
    }

    async addChannelConfig(
        channelId: string,
        categories: NewsCategory[],
        options: Partial<Omit<NewsChannelConfig, 'id' | 'channelId' | 'categories'>> = {}
    ): Promise<void> {
        await db.createNewsChannelConfig({
            channelId,
            categories,
            createThreads: options.createThreads ?? false,
            addReactions: options.addReactions ?? true,
            maxPerHour: options.maxPerHour ?? 3,
            enabled: options.enabled ?? true
        });

        logger.info('News channel config created', { channelId, categories });
    }

    async removeChannelConfig(channelId: string): Promise<void> {
        await db.deleteNewsChannelConfig(channelId);
        logger.info('News channel config removed', { channelId });
    }

    async updateChannelConfig(
        channelId: string,
        updates: Partial<Omit<NewsChannelConfig, 'id' | 'channelId'>>
    ): Promise<void> {
        await db.updateNewsChannelConfig(channelId, updates);
        logger.info('News channel config updated', { channelId, updates });
    }
}