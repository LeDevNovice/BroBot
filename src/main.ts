import { logger } from './utils/logger';
import { db } from './services/database';
import { DiscordBot } from './services/discordBot';
import { HttpServer } from './services/httpServer';
import { KeepAliveService } from './services/keepAliveService';
import { ProcessManager } from './services/processManager';

class BroBot {
    private discordBot: DiscordBot;
    private httpServer: HttpServer;
    private keepAliveService: KeepAliveService;
    private processManager: ProcessManager;

    constructor() {
        this.discordBot = new DiscordBot();
        this.httpServer = new HttpServer(this.discordBot);
        this.keepAliveService = new KeepAliveService();
        this.processManager = new ProcessManager(
            this.discordBot,
            this.httpServer,
            this.keepAliveService
        );
    }

    async start(): Promise<void> {
        try {
            logger.info('Starting BroBot...');

            logger.info('Connecting to database...');
            await db.connect();

            logger.info('Starting Discord bot...');
            await this.discordBot.start();

            logger.info('Starting HTTP server...');
            await this.httpServer.start();

            logger.info('Starting keep-alive service...');
            this.keepAliveService.start();

            logger.info('🚀 BroBot started successfully!');
        } catch (error) {
            logger.error('Failed to start BroBot', error as Error);
            process.exit(1);
        }
    }
}

const bot = new BroBot();
bot.start();