import { WORK_TYPES, WorkType } from '../types';

export function isAuthorized(discordId: string): boolean {
    const authorizedUsers = process.env.AUTHORIZED_USERS?.split(',') || [];
    return authorizedUsers.includes(discordId);
}

export function validateWorkType(type: string): WorkType | null {
    const normalizedType = type.toLowerCase().trim();

    const typeMap: Record<string, WorkType> = {
        'films': 'film',
        'movie': 'film',
        'series': 'serie',
        'tv': 'serie',
        'mangas': 'manga',
        'comic': 'comics',
        'bd': 'comics',
        'book': 'livre',
        'roman': 'roman',
        'romans': 'roman',
        'livres': 'livre',
        'animes': 'anime',
        'jeux': 'jeu',
        'game': 'jeu'
    };

    const finalType = typeMap[normalizedType] || normalizedType;
    return finalType in WORK_TYPES ? finalType as WorkType : null;
}

export function validateRating(rating: string): number | null {
    const num = parseInt(rating);
    return (num >= 0 && num <= 5) ? num : null;
}

export function formatWorkType(type: string): string {
    return WORK_TYPES[type as WorkType] || type;
}

export function formatRating(rating: number): string {
    return `${rating}/5 ${'⭐'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
}