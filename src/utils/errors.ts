export class BotError extends Error {
    constructor(
        message: string,
        public readonly code: string = 'UNKNOWN_ERROR',
        public readonly isOperational: boolean = true
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends BotError {
    constructor(message: string, field?: string) {
        super(
            field ? `${field}: ${message}` : message,
            'VALIDATION_ERROR'
        );
    }
}

export class AuthorizationError extends BotError {
    constructor(message: string = 'Vous n\'êtes pas autorisé à utiliser cette commande') {
        super(message, 'AUTHORIZATION_ERROR');
    }
}

export class DatabaseError extends BotError {
    constructor(message: string = 'Erreur de base de données') {
        super(message, 'DATABASE_ERROR');
    }
}

export class DiscordError extends BotError {
    constructor(message: string = 'Erreur Discord') {
        super(message, 'DISCORD_ERROR');
    }
}