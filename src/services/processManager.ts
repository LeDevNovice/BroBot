import { logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errorHandler';
import { db } from './database';
import { DiscordBot } from './discordBot';
import { HttpServer } from './httpServer';
import { KeepAliveService } from './keepAliveService';
import { NewsService } from './newsService';

export class ProcessManager {
    constructor(
        private discordBot: DiscordBot,
        private httpServer: HttpServer,
        private keepAliveService: KeepAliveService,
        private newsService?: NewsService
    ) {
        this.setupProcessHandlers();
    }

    private setupProcessHandlers(): void {
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception', error);
            ErrorHandler.handleProcessError(error);
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled rejection', new Error(String(reason)), { promise });
            ErrorHandler.handleProcessError(new Error(String(reason)));
        });

        process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    }

    private async gracefulShutdown(signal: string): Promise<void> {
        logger.info(`Shutting down bot (${signal})`);

        try {
            this.keepAliveService.stop();

            if (this.newsService) {
                this.newsService.stop();
            }

            await this.httpServer.stop();
            await this.discordBot.stop();
            await db.disconnect();

            logger.info('Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            logger.error('Error during shutdown', error as Error);
            process.exit(1);
        }
    }
}