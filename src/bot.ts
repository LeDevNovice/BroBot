import {
    Client,
    GatewayIntentBits,
    Collection,
    Events,
    REST,
    Routes,
    ChatInputCommandInteraction,
    Interaction
} from 'discord.js';
import express, { Request, Response } from 'express';
import axios from 'axios';

import { config, isDevelopment } from './config/env';
import { db } from './services/database';
import { commands } from './commands';
import { handleReviewSubmit } from './commands/reviewModal';
import { ErrorHandler } from './utils/errorHandler';
import { logger } from './utils/logger';

interface Command {
    data: any;
    execute: (interaction: ChatInputCommandInteraction) => Promise<any>;
}

const app = express();

app.get('/', (_req: Request, res: Response) => {
    res.json({
        status: 'online',
        bot: 'BroBot',
        environment: config.NODE_ENV,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        discord: client.isReady() ? 'connected' : 'disconnected',
        database: 'connected',
        environment: config.NODE_ENV,
        memory: process.memoryUsage(),
        uptime: process.uptime()
    });
});

app.get('/stats', (_req: Request, res: Response) => {
    if (!client.isReady()) {
        return res.status(503).json({ error: 'Bot not ready' });
    }

    return res.json({
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        commands: commands.length,
        ping: client.ws.ping,
        uptime: process.uptime()
    });
});

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const clientCommands = new Collection<string, Command>();
commands.forEach(command => {
    clientCommands.set(command.data.name, command);
});

client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`Bot connected successfully`, {
        botTag: readyClient.user.tag,
        guildCount: readyClient.guilds.cache.size,
        environment: config.NODE_ENV
    });

    try {
        await db.connect();
        await deployCommands();
        logger.info('BroBot initialization completed');
    } catch (error) {
        logger.error('Bot initialization failed', error as Error);
        process.exit(1);
    }
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = clientCommands.get(interaction.commandName);
            if (command) {
                await command.execute(interaction);
            }
        } else if (interaction.isModalSubmit() && interaction.customId === 'review_modal') {
            await handleReviewSubmit(interaction);
        }
    } catch (error) {
        await ErrorHandler.handleInteractionError(error, interaction);
    }
});

async function deployCommands() {
    try {
        const commandsData = commands.map(command => command.data.toJSON());
        const rest = new REST().setToken(config.DISCORD_TOKEN);

        logger.info('Deploying slash commands...');

        await rest.put(
            Routes.applicationCommands(config.CLIENT_ID),
            { body: commandsData }
        );

        logger.info('Slash commands deployed successfully');
    } catch (error) {
        logger.error('Failed to deploy commands', error as Error);
        throw error;
    }
}

app.listen(config.PORT, () => {
    logger.info(`HTTP server started`, { port: config.PORT });
});

if (config.RENDER_URL) {
    const interval = 30000;

    function reloadWebsite() {
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

    setTimeout(() => {
        logger.info('Starting keep-alive service', { url: config.RENDER_URL });
        setInterval(reloadWebsite, interval);
        reloadWebsite();
    }, 5000);
} else if (isDevelopment()) {
    logger.info('Keep-alive service disabled (no RENDER_URL configured)');
}

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    ErrorHandler.handleProcessError(error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', new Error(String(reason)), { promise });
    ErrorHandler.handleProcessError(new Error(String(reason)));
});

process.on('SIGINT', async () => {
    logger.info('Shutting down bot (SIGINT)');
    try {
        await db.disconnect();
        client.destroy();
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown', error as Error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    logger.info('Shutting down bot (SIGTERM)');
    try {
        await db.disconnect();
        client.destroy();
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown', error as Error);
        process.exit(1);
    }
});

client.login(config.DISCORD_TOKEN);