import { config as loadEnv } from 'dotenv';

loadEnv();

export interface AppConfig {
    readonly DISCORD_TOKEN: string;
    readonly CLIENT_ID: string;
    readonly DATABASE_URL: string;
    readonly AUTHORIZED_USERS: readonly string[];
    readonly PORT: number;
    readonly RENDER_URL?: string;
    readonly NODE_ENV: 'development' | 'production';
}

class ConfigValidator {
    private static getRequiredEnv(key: string): string {
        const value = process.env[key];
        if (!value || value.trim() === '') {
            throw new Error(`Missing required environment variable: ${key}`);
        }
        return value.trim();
    }

    private static getOptionalEnv(key: string): string | undefined {
        const value = process.env[key];
        return value?.trim() || undefined;
    }

    private static parseAuthorizedUsers(): readonly string[] {
        const usersEnv = this.getOptionalEnv('AUTHORIZED_USERS');
        if (!usersEnv) {
            console.warn('⚠️  No authorized users configured. Bot will be accessible to no one.');
            return [];
        }

        const users = usersEnv
            .split(',')
            .map(id => id.trim())
            .filter(id => id.length > 0);

        if (users.length === 0) {
            console.warn('⚠️  No valid authorized users found.');
        }

        const invalidUsers = users.filter(id => !/^\d+$/.test(id));
        if (invalidUsers.length > 0) {
            throw new Error(`Invalid Discord IDs in AUTHORIZED_USERS: ${invalidUsers.join(', ')}`);
        }

        return Object.freeze(users);
    }

    private static parsePort(): number {
        const portEnv = this.getOptionalEnv('PORT') || '3000';
        const port = parseInt(portEnv, 10);

        if (isNaN(port) || port < 1 || port > 65535) {
            throw new Error(`Invalid PORT value: ${portEnv}. Must be a number between 1 and 65535.`);
        }

        return port;
    }

    private static parseNodeEnv(): 'development' | 'production' {
        const env = this.getOptionalEnv('NODE_ENV') || 'development';

        if (!['development', 'production'].includes(env)) {
            console.warn(`⚠️  Invalid NODE_ENV: ${env}. Defaulting to 'development'.`);
            return 'development';
        }

        return env as 'development' | 'production';
    }

    private static validateRenderUrl(url?: string): string | undefined {
        if (!url) return undefined;

        try {
            new URL(url);
            return url;
        } catch {
            throw new Error(`Invalid RENDER_URL format: ${url}`);
        }
    }

    static createConfig(): AppConfig {
        try {
            const renderUrl = this.getOptionalEnv('RENDER_URL');

            const config: AppConfig = {
                DISCORD_TOKEN: this.getRequiredEnv('DISCORD_TOKEN'),
                CLIENT_ID: this.getRequiredEnv('CLIENT_ID'),
                DATABASE_URL: this.getRequiredEnv('DATABASE_URL'),
                AUTHORIZED_USERS: this.parseAuthorizedUsers(),
                PORT: this.parsePort(),
                RENDER_URL: this.validateRenderUrl(renderUrl),
                NODE_ENV: this.parseNodeEnv()
            };

            console.log('✅ Configuration loaded successfully:');
            console.log(`   - Environment: ${config.NODE_ENV}`);
            console.log(`   - Port: ${config.PORT}`);
            console.log(`   - Authorized users: ${config.AUTHORIZED_USERS.length}`);
            console.log(`   - Render URL: ${config.RENDER_URL ? 'configured' : 'not configured'}`);

            return config;
        } catch (error) {
            console.error('❌ Configuration validation failed:');
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    }
}

// Créer et exporter la configuration
export const config = ConfigValidator.createConfig();

// Export des helpers pour la backward compatibility
export const isProduction = (): boolean => config.NODE_ENV === 'production';
export const isDevelopment = (): boolean => config.NODE_ENV === 'development';