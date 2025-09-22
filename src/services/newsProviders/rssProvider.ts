import axios from 'axios';
import { NewsItem, NewsCategory } from '../../types/news';
import { logger } from '../../utils/logger';

interface RSSItem {
    title: string;
    description: string;
    link: string;
    pubDate: string;
    category?: string;
    'media:thumbnail'?: { $: { url: string } };
    enclosure?: { $: { url: string, type: string } };
}

interface RSSFeed {
    rss: {
        channel: {
            item: RSSItem[];
        };
    };
}

export class RSSProvider {
    private readonly userAgent = 'BroBot/1.0';

    private readonly feedUrls: Record<NewsCategory, string[]> = {
        'sports': [
            'https://rmcsport.bfmtv.com/rss/football/'
        ],
        'gaming': [
            'https://www.gamekult.com/feed.xml'
        ],
        'films': [
            'https://www.allocine.fr/rss/news-cine.xml'
        ],
        'series': [
            'https://www.allocine.fr/rss/news-series.xml'
        ],
        'wwe': [
            'https://www.catch-arena.com/rss.xml',
            'https://www.wwe.com/feeds/page/rss.xml'
        ],
        'lectures': [
            'https://www.livreshebdo.fr/rss.xml',
            'https://www.babelio.com/rss/critiques',
            'https://actualitte.com/rss'
        ]
    };

    async getNews(category: NewsCategory, limit: number = 5): Promise<NewsItem[]> {
        const feedUrls = this.feedUrls[category];
        if (!feedUrls || feedUrls.length === 0) {
            return [];
        }

        const allNews: NewsItem[] = [];

        for (const feedUrl of feedUrls) {
            try {
                const news = await this.fetchFromRSS(feedUrl, category, Math.ceil(limit / feedUrls.length));
                allNews.push(...news);
            } catch (error) {
                logger.warn(`Failed to fetch from RSS feed ${feedUrl}`, { error });
                continue;
            }
        }
        return allNews
            .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
            .slice(0, limit);
    }

    private async fetchFromRSS(feedUrl: string, category: NewsCategory, limit: number): Promise<NewsItem[]> {
        try {
            const response = await axios.get(feedUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/rss+xml, application/xml, text/xml'
                },
                timeout: 10000
            });

            const items = this.parseRSSXML(response.data);

            return items
                .filter(item => this.isValidRSSItem(item))
                .slice(0, limit)
                .map(item => this.convertToNewsItem(item, category, feedUrl));

        } catch (error) {
            logger.error(`Error fetching RSS from ${feedUrl}`, error as Error);
            return [];
        }
    }

    private parseRSSXML(xmlData: string): RSSItem[] {
        const items: RSSItem[] = [];

        try {
            const itemMatches = xmlData.match(/<item[^>]*>([\s\S]*?)<\/item>/gi);

            if (!itemMatches) return items;

            for (const itemXml of itemMatches) {
                const item: Partial<RSSItem> = {};

                const titleMatch = itemXml.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/i);
                if (titleMatch) {
                    item.title = this.cleanText(titleMatch[1] || titleMatch[2]);
                }

                const descMatch = itemXml.match(/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>|<description[^>]*>(.*?)<\/description>/is);
                if (descMatch) {
                    item.description = this.cleanText(descMatch[1] || descMatch[2]);
                }

                const linkMatch = itemXml.match(/<link[^>]*>(.*?)<\/link>/i);
                if (linkMatch) {
                    item.link = linkMatch[1].trim();
                }

                const dateMatch = itemXml.match(/<pubDate[^>]*>(.*?)<\/pubDate>/i);
                if (dateMatch) {
                    item.pubDate = dateMatch[1].trim();
                }

                const imageMatch = itemXml.match(/<enclosure[^>]*url="([^"]*)"[^>]*type="image/i) ||
                    itemXml.match(/<media:thumbnail[^>]*url="([^"]*)"/i) ||
                    itemXml.match(/<img[^>]*src="([^"]*)"/i);
                if (imageMatch) {
                    item.enclosure = { $: { url: imageMatch[1], type: 'image' } };
                }

                if (item.title && item.link && item.pubDate) {
                    items.push(item as RSSItem);
                }
            }
        } catch (error) {
            logger.warn('Error parsing RSS XML', { error });
        }

        return items;
    }

    private cleanText(text: string): string {
        return text
            .replace(/<[^>]*>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }

    private isValidRSSItem(item: RSSItem): boolean {
        if (!item.title || !item.link) return false;

        if (item.pubDate) {
            const publishedAt = new Date(item.pubDate);
            const ageHours = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
            if (ageHours > 72) return false;
        }

        if (item.description && item.description.length < 30) return false;

        return true;
    }

    private convertToNewsItem(item: RSSItem, category: NewsCategory, feedUrl: string): NewsItem {
        let source = 'RSS Feed';
        if (feedUrl.includes('lequipe.fr')) source = "L'Équipe";
        else if (feedUrl.includes('rmcsport')) source = 'RMC Sport';
        else if (feedUrl.includes('eurosport')) source = 'Eurosport';
        else if (feedUrl.includes('gamekult')) source = 'Gamekult';
        else if (feedUrl.includes('jeuxvideo.com')) source = 'JeuxVideo.com';
        else if (feedUrl.includes('allocine')) source = 'AlloCiné';
        else if (feedUrl.includes('premiere')) source = 'Première';
        else if (feedUrl.includes('catch-arena')) source = 'Catch Arena';
        else if (feedUrl.includes('actualitte')) source = 'ActuaLitté';

        let imageUrl: string | undefined;
        if (item.enclosure?.$.url) {
            imageUrl = item.enclosure.$.url;
        }

        return {
            id: `rss_french_${Buffer.from(item.link).toString('base64').substring(0, 20)}`,
            title: item.title,
            description: item.description || '',
            url: item.link,
            publishedAt: new Date(item.pubDate),
            source,
            category,
            imageUrl
        };
    }

    getName(): string {
        return 'RSS French';
    }
}