import { logger } from "./utils/logger";
import { db } from "./services/database";
import { DiscordBot } from "./services/discordBot";
import { HttpServer } from "./services/httpServer";
import { KeepAliveService } from "./services/keepAliveService";
import { NewsService } from "./services/newsService";
import { DashboardService } from "./services/dashboardService";
import { ProcessManager } from "./services/processManager";

class BroBot {
  private discordBot: DiscordBot;
  private httpServer: HttpServer;
  private keepAliveService: KeepAliveService;
  private newsService: NewsService;
  private dashboardService: DashboardService;
  private processManager: ProcessManager;

  constructor() {
    this.discordBot = new DiscordBot();
    this.keepAliveService = new KeepAliveService();
    this.newsService = new NewsService(this.discordBot.getClient());
    this.dashboardService = new DashboardService(this.discordBot.getClient());
    this.httpServer = new HttpServer(this.discordBot, this.keepAliveService);
    this.processManager = new ProcessManager(
      this.discordBot,
      this.httpServer,
      this.keepAliveService,
      this.newsService,
      this.dashboardService,
    );
  }

  async start(): Promise<void> {
    try {
      logger.info("Starting BroBot...");

      logger.info("Connecting to database...");
      await db.connect();

      logger.info("Starting Discord bot...");
      await this.discordBot.start();

      logger.info("Starting HTTP server...");
      await this.httpServer.start();

      logger.info("Starting keep-alive service...");
      this.keepAliveService.start();

      logger.info("Starting news service...");
      this.newsService.start();

      logger.info("Starting dashboard service...");
      this.dashboardService.start();

      logger.info("BroBot started successfully!");
    } catch (error) {
      logger.error("Failed to start BroBot", error as Error);
      process.exit(1);
    }
  }
}

const bot = new BroBot();
bot.start();
