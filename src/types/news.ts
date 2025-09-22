export interface NewsSource {
    id: string;
    name: string;
    type: NewsCategory;
    url: string;
    apiKey?: string;
    enabled: boolean;
}

export interface NewsItem {
    id: string;
    title: string;
    description: string;
    url: string;
    publishedAt: Date;
    source: string;
    category: NewsCategory;
    imageUrl?: string;
    author?: string;
}

export interface NewsConfig {
    channelId: string;
    categories: NewsCategory[];
    createThreads: boolean;
    addReactions: boolean;
    maxNewsPerHour: number;
}

export interface NewsChannelConfig {
    id: string;
    channelId: string;
    categories: NewsCategory[];
    createThreads: boolean;
    addReactions: boolean;
    maxPerHour: number;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export type NewsCategory = 'sports' | 'gaming' | 'films' | 'series' | 'wwe' | 'lectures';

export const NEWS_CATEGORIES: Record<NewsCategory, string> = {
    'sports': '⚽ Sports',
    'gaming': '🎮 Gaming',
    'films': '🎬 Films',
    'series': '📺 Séries',
    'wwe': '🤼 WWE',
    'lectures': '📚 Lectures'
} as const;