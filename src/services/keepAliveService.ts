import axios from 'axios';
import { config, isDevelopment } from '../config/env';
import { logger } from '../utils/logger';

interface KeepAliveStats {
    totalPings: number;
    successfulPings: number;
    failedPings: number;
    lastSuccessAt?: Date;
    lastFailureAt?: Date;
    consecutiveFailures: number;
    isActive: boolean;
}

export class KeepAliveService {
    private intervalId?: NodeJS.Timeout;
    private readonly interval = 30000;
    private readonly maxRetries = 3;
    private stats: KeepAliveStats;

    constructor() {
        this.stats = {
            totalPings: 0,
            successfulPings: 0,
            failedPings: 0,
            consecutiveFailures: 0,
            isActive: false
        };
    }

    start(): void {
        if (!config.RENDER_URL) {
            if (isDevelopment()) {
                logger.info('Keep-alive service disabled (no RENDER_URL configured)');
            }
            return;
        }

        if (this.intervalId) {
            logger.warn('Keep-alive service already running');
            return;
        }

        this.stats.isActive = true;
        logger.info('Starting keep-alive service', {
            url: config.RENDER_URL,
            interval: this.interval
        });

        setTimeout(() => {
            this.safePing();

            this.intervalId = setInterval(() => {
                try {
                    this.safePing();
                } catch (error) {
                    logger.error('Critical error in keep-alive interval', error as Error);
                }
            }, this.interval);

        }, this.interval);

        setInterval(() => {
            this.logStats();
        }, 10 * 60 * 1000);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
            this.stats.isActive = false;
            logger.info('Keep-alive service stopped', this.getStats());
        }
    }

    private async safePing(): Promise<void> {
        if (!config.RENDER_URL) return;

        this.stats.totalPings++;

        try {
            await this.performPing();

            // Succès
            this.stats.successfulPings++;
            this.stats.consecutiveFailures = 0;
            this.stats.lastSuccessAt = new Date();

            logger.debug('Keep-alive successful', {
                status: 'success',
                consecutiveFailures: this.stats.consecutiveFailures,
                totalPings: this.stats.totalPings
            });

        } catch (error) {
            this.stats.failedPings++;
            this.stats.consecutiveFailures++;
            this.stats.lastFailureAt = new Date();

            const errorMessage = error instanceof Error ? error.message : String(error);

            logger.warn('Keep-alive failed', {
                error: errorMessage,
                consecutiveFailures: this.stats.consecutiveFailures,
                totalPings: this.stats.totalPings,
                willRetry: this.stats.consecutiveFailures < this.maxRetries
            });

            if (this.stats.consecutiveFailures >= this.maxRetries) {
                logger.error('Keep-alive: Multiple consecutive failures detected', undefined, {
                    consecutiveFailures: this.stats.consecutiveFailures,
                    lastSuccessAt: this.stats.lastSuccessAt
                });

                await this.diagnosticPing();
            }
        }
    }

    private async performPing(): Promise<void> {
        if (!config.RENDER_URL) throw new Error('RENDER_URL not configured');

        const response = await axios.get(config.RENDER_URL, {
            timeout: 10000,
            headers: {
                'User-Agent': 'BroBot-KeepAlive/1.0'
            },
            maxRedirects: 3,
            validateStatus: (status) => status >= 200 && status < 300
        });

        if (!response || !response.status) {
            throw new Error('Invalid response from keep-alive endpoint');
        }

        if (isDevelopment()) {
            logger.debug('Keep-alive ping details', {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                responseTime: response.headers['x-response-time']
            });
        }
    }

    private async diagnosticPing(): Promise<void> {
        try {
            logger.info('Running diagnostic ping...');

            const startTime = Date.now();
            const response = await axios.get(config.RENDER_URL!, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'BroBot-KeepAlive-Diagnostic/1.0'
                }
            });
            const responseTime = Date.now() - startTime;

            logger.info('Diagnostic ping completed', {
                status: response.status,
                responseTime: `${responseTime}ms`,
                contentLength: response.headers['content-length'],
                server: response.headers['server']
            });

        } catch (error) {
            logger.error('Diagnostic ping failed', error as Error, {
                url: config.RENDER_URL
            });
        }
    }

    private logStats(): void {
        const stats = this.getStats();
        const successRate = stats.totalPings > 0
            ? Math.round((stats.successfulPings / stats.totalPings) * 100)
            : 0;

        logger.info('Keep-alive statistics', {
            ...stats,
            successRate: `${successRate}%`,
            uptime: this.getUptime()
        });

        if (stats.totalPings >= 10 && successRate < 80) {
            logger.warn('Keep-alive success rate is below 80%', {
                successRate: `${successRate}%`,
                totalPings: stats.totalPings
            });
        }
    }

    /**
     * Calcule l'uptime du service
     */
    private getUptime(): string {
        if (!this.stats.isActive) return '0s';

        // Estimer l'uptime basé sur le premier ping
        const estimatedStartTime = Date.now() - (this.stats.totalPings * this.interval);
        const uptimeMs = Date.now() - estimatedStartTime;

        const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));

        return `${hours}h ${minutes}m`;
    }

    /**
     * Obtient les statistiques du service
     */
    getStats(): KeepAliveStats {
        return { ...this.stats };
    }

    /**
     * Vérifie si le service est en bonne santé
     */
    isHealthy(): boolean {
        if (!this.stats.isActive) return false;
        if (this.stats.totalPings === 0) return true; // Pas encore de pings

        const successRate = this.stats.successfulPings / this.stats.totalPings;
        return successRate >= 0.8 && this.stats.consecutiveFailures < this.maxRetries;
    }

    /**
     * Force un ping immédiat (pour les tests)
     */
    async forcePing(): Promise<boolean> {
        try {
            await this.safePing();
            return true;
        } catch (error) {
            logger.error('Force ping failed', error as Error);
            return false;
        }
    }
}