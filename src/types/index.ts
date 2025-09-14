export interface ReviewData {
    title: string;
    type: string;
    rating: number;
    comment: string;
}

export const WORK_TYPES = {
    'film': '🎬 Film',
    'serie': '📺 Série',
    'manga': '🗾 Manga',
    'comics': '📚 Comics',
    'roman': '📖 Roman',
    'livre': '📕 Livre',
    'anime': '🍜 Anime',
    'jeu': '🎮 Jeu vidéo'
} as const;

export type WorkType = keyof typeof WORK_TYPES;