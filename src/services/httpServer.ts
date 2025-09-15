import express, { Request, Response } from 'express';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { DiscordBot } from './discordBot';
import { KeepAliveService } from './keepAliveService';
import { commands } from '../commands';

export class HttpServer {
    private app: express.Application;
    private server: any;

    constructor(
        private discordBot: DiscordBot,
        private keepAliveService?: KeepAliveService
    ) {
        this.app = express();
        this.setupRoutes();
    }

    private setupRoutes(): void {
        this.app.get('/', (_req: Request, res: Response) => {
            return res.json({
                status: 'online',
                bot: 'BroBot',
                environment: config.NODE_ENV,
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });

        this.app.get('/health', (_req: Request, res: Response) => {
            const keepAliveHealthy = this.keepAliveService?.isHealthy() ?? true;

            return res.json({
                status: 'healthy',
                discord: this.discordBot.isReady() ? 'connected' : 'disconnected',
                database: 'connected',
                keepAlive: keepAliveHealthy ? 'healthy' : 'degraded',
                environment: config.NODE_ENV,
                memory: process.memoryUsage(),
                uptime: process.uptime()
            });
        });

        this.app.get('/stats', (_req: Request, res: Response) => {
            if (!this.discordBot.isReady()) {
                return res.status(503).json({ error: 'Bot not ready' });
            }

            const botStats = this.discordBot.getStats();
            const keepAliveStats = this.keepAliveService?.getStats();

            return res.json({
                ...botStats,
                commands: commands.length,
                authorizedUsers: config.AUTHORIZED_USERS.length,
                uptime: process.uptime(),
                keepAlive: keepAliveStats
            });
        });

        this.app.get('/ping', async (_req: Request, res: Response) => {
            if (!this.keepAliveService) {
                return res.json({
                    status: 'disabled',
                    message: 'Keep-alive service not configured'
                });
            }

            const success = await this.keepAliveService.forcePing();
            return res.json({
                status: success ? 'success' : 'failed',
                stats: this.keepAliveService.getStats(),
                healthy: this.keepAliveService.isHealthy()
            });
        });
    }

    start(): Promise<void> {
        return new Promise((resolve) => {
            this.server = this.app.listen(config.PORT, () => {
                logger.info('HTTP server started', { port: config.PORT });
                resolve();
            });
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.info('HTTP server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}