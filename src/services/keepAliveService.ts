import axios from 'axios';
import { config, isDevelopment } from '../config/env';
import { logger } from '../utils/logger';

export class KeepAliveService {
    private intervalId?: NodeJS.Timeout;
    private readonly interval = 30000;

    start(): void {
        if (!config.RENDER_URL) {
            if (isDevelopment()) {
                logger.info('Keep-alive service disabled (no RENDER_URL configured)');
            }
            return;
        }

        logger.info('Starting keep-alive service', { url: config.RENDER_URL });

        setTimeout(() => {
            this.ping();
            this.intervalId = setInterval(() => this.ping(), this.interval);
        }, this.interval);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
            logger.info('Keep-alive service stopped');
        }
    }

    private ping(): void {
        if (!config.RENDER_URL) return;

        axios.get(config.RENDER_URL, {
            timeout: 10000,
            headers: {
                'User-Agent': 'BroBot-KeepAlive/1.0'
            }
        })
            .then(response => {
                logger.debug('Keep-alive successful', { status: response.status });
            })
            .catch(error => {
                logger.warn('Keep-alive failed', { error: error.message });
            });
    }
}