import { Interaction } from 'discord.js';

import { BotError } from './errors';
import { logger } from './logger';
import { isProduction } from '../config/env';

interface ErrorContext {
    userId: string;
    guildId?: string;
    interactionId: string;
    commandName?: string;
}

export class ErrorHandler {
    static async handleInteractionError(
        error: unknown,
        interaction: Interaction
    ): Promise<void> {
        const context: ErrorContext = {
            userId: interaction.user.id,
            guildId: interaction.guildId || undefined,
            interactionId: interaction.id
        };

        if (interaction.isChatInputCommand()) {
            context.commandName = interaction.commandName;
        }

        if (error instanceof BotError) {
            logger.warn(`Bot error: ${error.message}`, {
                ...context,
                errorCode: error.code
            });
        } else {
            logger.error(
                'Unexpected error in interaction',
                error instanceof Error ? error : new Error(String(error)),
                context
            );
        }

        await this.sendErrorResponse(error, interaction);
    }

    private static async sendErrorResponse(
        error: unknown,
        interaction: Interaction
    ): Promise<void> {
        if (!interaction.isRepliable()) return;

        let message: string;
        let ephemeral = true;

        if (error instanceof BotError) {
            message = `❌ ${error.message}`;
        } else {
            message = '❌ Une erreur inattendue s\'est produite. Veuillez réessayer.';
        }

        const errorResponse = { content: message, ephemeral };

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorResponse);
            } else {
                await interaction.reply(errorResponse);
            }
        } catch (replyError) {
            logger.error(
                'Failed to send error response',
                replyError instanceof Error ? replyError : new Error(String(replyError)),
                { userId: interaction.user.id }
            );
        }
    }

    static handleProcessError(error: Error): void {
        logger.error('Unhandled process error', error);

        if (isProduction()) {
            setTimeout(() => {
                process.exit(1);
            }, 5000);
        }
    }
}