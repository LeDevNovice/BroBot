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

import { config } from '../config/env';
import { logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errorHandler';
import { commands } from '../commands';
import { handleReviewSubmit } from '../commands/reviewModal';

interface Command {
    data: any;
    execute: (interaction: ChatInputCommandInteraction) => Promise<any>;
}

interface BotStats {
    guilds: number;
    users: number;
    ping: number;
}

export class DiscordBot {
    private client: Client;
    private clientCommands: Collection<string, Command>;
    private isInitialized = false;

    constructor() {
        this.client = new Client({
            intents: [GatewayIntentBits.Guilds]
        });

        this.clientCommands = new Collection<string, Command>();
        this.setupCommands();
        this.setupEvents();
    }

    private setupCommands(): void {
        commands.forEach(command => {
            this.clientCommands.set(command.data.name, command);
        });
    }

    private setupEvents(): void {
        this.client.once(Events.ClientReady, async (readyClient) => {
            logger.info('Bot connected successfully', {
                botTag: readyClient.user.tag,
                guildCount: readyClient.guilds.cache.size,
                environment: config.NODE_ENV
            });

            try {
                await this.deployCommands();
                this.isInitialized = true;
                logger.info('Discord bot initialization completed');
            } catch (error) {
                logger.error('Bot initialization failed', error as Error);
                throw error;
            }
        });

        this.client.on(Events.InteractionCreate, async (interaction: Interaction) => {
            try {
                await this.handleInteraction(interaction);
            } catch (error) {
                await ErrorHandler.handleInteractionError(error, interaction);
            }
        });
    }

    private async handleInteraction(interaction: Interaction): Promise<void> {
        if (interaction.isChatInputCommand()) {
            const command = this.clientCommands.get(interaction.commandName);
            if (command) {
                await command.execute(interaction);
            }
        } else if (interaction.isModalSubmit() && interaction.customId.startsWith('review_modal_')) {
            await handleReviewSubmit(interaction);
        }
    }

    private async deployCommands(): Promise<void> {
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

    async start(): Promise<void> {
        try {
            await this.client.login(config.DISCORD_TOKEN);

            // Attendre que le bot soit prêt
            if (!this.isInitialized) {
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Bot initialization timeout'));
                    }, 30000);

                    const checkInitialized = () => {
                        if (this.isInitialized) {
                            clearTimeout(timeout);
                            resolve();
                        } else {
                            setTimeout(checkInitialized, 100);
                        }
                    };
                    checkInitialized();
                });
            }
        } catch (error) {
            logger.error('Failed to start Discord bot', error as Error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        try {
            this.client.destroy();
            logger.info('Discord bot stopped');
        } catch (error) {
            logger.error('Error stopping Discord bot', error as Error);
        }
    }

    isReady(): boolean {
        return this.client.isReady();
    }

    getStats(): BotStats {
        if (!this.client.isReady()) {
            throw new Error('Bot is not ready');
        }

        return {
            guilds: this.client.guilds.cache.size,
            users: this.client.users.cache.size,
            ping: this.client.ws.ping
        };
    }
}