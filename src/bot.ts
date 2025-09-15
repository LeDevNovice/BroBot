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
import { config } from 'dotenv';
import express from 'express';
import axios from 'axios';

import { db } from './services/database';
import { commands } from './commands';
import { handleReviewSubmit } from './commands/reviewModal';

config();

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.DATABASE_URL) {
    console.error('❌ Variables d\'environnement manquantes!');
    console.error('Vérifiez: DISCORD_TOKEN, CLIENT_ID, DATABASE_URL');
    process.exit(1);
}

interface Command {
    data: any;
    execute: (interaction: ChatInputCommandInteraction) => Promise<any>;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: 'BroBot',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        discord: client.isReady() ? 'connected' : 'disconnected',
        database: 'connected',
        memory: process.memoryUsage(),
        uptime: process.uptime()
    });
});

app.get('/stats', (req, res) => {
    if (!client.isReady()) {
        return res.status(503).json({ error: 'Bot not ready' });
    }

    res.json({
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
    console.log(`🤖 ${readyClient.user.tag} est connecté!`);

    try {
        await db.connect();
        await deployCommands();

        console.log('✅ BroBot est prêt!');
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error);
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
        console.error('❌ Erreur interaction:', error);

        const errorMessage = { content: '❌ Une erreur est survenue.', ephemeral: true };

        if (interaction.isRepliable()) {
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            } catch (replyError) {
                console.error('❌ Erreur lors de la réponse:', replyError);
            }
        }
    }
});

async function deployCommands() {
    try {
        const commandsData = commands.map(command => command.data.toJSON());
        const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

        console.log('🔄 Déploiement des commandes slash...');

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID!),
            { body: commandsData }
        );

        console.log('✅ Commandes déployées avec succès!');
    } catch (error) {
        console.error('❌ Erreur déploiement commandes:', error);
    }
}

app.listen(PORT, () => {
    console.log(`🌐 Serveur HTTP démarré sur le port ${PORT}`);
});

const url = process.env.RENDER_URL || `https://brobot-b5j6.onrender.com/health`;
const interval = 30000;

function reloadWebsite() {
    axios.get(url, {
        timeout: 10000,
        headers: {
            'User-Agent': 'BroBot-KeepAlive/1.0'
        }
    })
        .then(response => {
            console.log(`✅ Keep-alive successful at ${new Date().toISOString()}: Status ${response.status}`);
        })
        .catch(error => {
            console.error(`❌ Keep-alive failed at ${new Date().toISOString()}:`, error.message);
        });
}

setTimeout(() => {
    console.log('🔄 Démarrage du keep-alive...');
    setInterval(reloadWebsite, interval);

    reloadWebsite();
}, 5000);

client.login(process.env.DISCORD_TOKEN);

process.on('SIGINT', async () => {
    console.log('\n🛑 Arrêt du bot...');
    try {
        await db.disconnect();
    } catch (error) {
        console.error('Erreur lors de la déconnexion DB:', error);
    }
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Arrêt du bot (SIGTERM)...');
    try {
        await db.disconnect();
    } catch (error) {
        console.error('Erreur lors de la déconnexion DB:', error);
    }
    client.destroy();
    process.exit(0);
});