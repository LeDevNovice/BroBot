import { WORK_TYPES, WorkType } from '../types';
import { ValidationError, AuthorizationError } from './errors';
import { config } from '../config/env';

export function isAuthorized(discordId: string): boolean {
    return config.AUTHORIZED_USERS.includes(discordId);
}

export function validateAuthorization(discordId: string): void {
    if (!isAuthorized(discordId)) {
        throw new AuthorizationError();
    }
}

export function validateWorkType(type: string): WorkType | null {
    if (!type || typeof type !== 'string') {
        return null;
    }

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

export function validateRatingStrict(rating: string): number {
    const validRating = validateRating(rating);
    if (validRating === null) {
        throw new ValidationError(
            'Note invalide. Utilisez un nombre entre 0 et 5',
            'rating'
        );
    }
    return validRating;
}

export function validateTitle(title: string): string {
    if (!title || typeof title !== 'string') {
        throw new ValidationError('Le titre est requis', 'title');
    }

    const trimmed = title.trim();
    if (trimmed.length === 0) {
        throw new ValidationError('Le titre ne peut pas être vide', 'title');
    }

    if (trimmed.length > 100) {
        throw new ValidationError('Le titre ne peut pas dépasser 100 caractères', 'title');
    }

    return trimmed;
}

export function validateComment(comment: string): string {
    if (!comment || typeof comment !== 'string') {
        throw new ValidationError('Le commentaire est requis', 'comment');
    }

    const trimmed = comment.trim();
    if (trimmed.length === 0) {
        throw new ValidationError('Le commentaire ne peut pas être vide', 'comment');
    }

    if (trimmed.length > 1000) {
        throw new ValidationError('Le commentaire ne peut pas dépasser 1000 caractères', 'comment');
    }

    return trimmed;
}

export function formatWorkType(type: string): string {
    return WORK_TYPES[type as WorkType] || type;
}

export function formatRating(rating: number): string {
    return `${rating}/5 ${'⭐'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
}