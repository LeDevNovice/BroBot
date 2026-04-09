import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { logger } from "../utils/logger";
import { config } from "../config/env";
import {
  WeatherService,
  WeatherData,
  WeatherComparison,
} from "./weatherService";

interface SchedulerState {
  nextTriggerAt: Date | null;
  lastSentAt: Date | null;
  totalSent: number;
  consecutiveFailures: number;
}

export class DashboardService {
  private client: Client;
  private weatherService: WeatherService;
  private intervalId?: NodeJS.Timeout;
  private isStarted = false;

  private state: SchedulerState = {
    nextTriggerAt: null,
    lastSentAt: null,
    totalSent: 0,
    consecutiveFailures: 0,
  };

  private readonly SEND_HOUR = 8;
  private readonly SEND_MINUTE = 0;
  private readonly TIMEZONE = "Europe/Paris";

  private readonly CHECK_INTERVAL_MS = 60 * 1000;

  constructor(client: Client) {
    this.client = client;
    this.weatherService = new WeatherService();
  }

  start(): void {
    if (this.isStarted) {
      logger.warn(
        "DashboardService: already started, ignoring duplicate start",
      );
      return;
    }

    this.isStarted = true;
    this.state.nextTriggerAt = this.computeNextTrigger();

    logger.info("DashboardService: started", {
      sendTime: `${this.SEND_HOUR}:${String(this.SEND_MINUTE).padStart(2, "0")} (${this.TIMEZONE})`,
      nextTriggerAt: this.state.nextTriggerAt.toISOString(),
    });

    this.intervalId = setInterval(() => {
      this.tick();
    }, this.CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      this.isStarted = false;
      logger.info("DashboardService: stopped");
    }
  }

  getState(): SchedulerState {
    return { ...this.state };
  }

  private tick(): void {
    if (!this.state.nextTriggerAt) return;

    const now = new Date();

    if (now >= this.state.nextTriggerAt) {
      logger.info("DashboardService: trigger time reached, sending dashboard");

      this.state.nextTriggerAt = this.computeNextTrigger(now);

      this.sendDashboard().catch((error) => {
        logger.error(
          "DashboardService: unhandled error in sendDashboard",
          error as Error,
        );
      });
    }
  }

  private computeNextTrigger(from: Date = new Date()): Date {
    const formatter = new Intl.DateTimeFormat("fr-FR", {
      timeZone: this.TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(from);
    const get = (type: string) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? "0");

    const year = get("year");
    const month = get("month") - 1;
    const day = get("day");
    const currentHour = get("hour");
    const currentMinute = get("minute");

    const targetToday = this.parisTimeToUTC(
      year,
      month,
      day,
      this.SEND_HOUR,
      this.SEND_MINUTE,
    );

    const alreadyPassedToday =
      currentHour > this.SEND_HOUR ||
      (currentHour === this.SEND_HOUR && currentMinute >= this.SEND_MINUTE);

    if (alreadyPassedToday) {
      const tomorrow = new Date(targetToday);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      return tomorrow;
    }

    return targetToday;
  }

  private parisTimeToUTC(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
  ): Date {
    const naive = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));

    const parisStr = naive.toLocaleString("fr-FR", { timeZone: this.TIMEZONE });
    const utcStr = naive.toUTCString();

    const parisDate = new Date(parisStr);
    const utcDate = new Date(utcStr);
    const offsetMs = parisDate.getTime() - utcDate.getTime();

    return new Date(naive.getTime() - offsetMs);
  }

  async sendDashboard(): Promise<void> {
    const channelId = config.DASHBOARD_CHANNEL_ID;

    if (!channelId) {
      logger.warn(
        "DashboardService: DASHBOARD_CHANNEL_ID not configured, skipping",
      );
      return;
    }

    try {
      const channel = (await this.client.channels.fetch(
        channelId,
      )) as TextChannel;

      if (!channel || !channel.isTextBased()) {
        logger.error(
          `DashboardService: channel ${channelId} not found or not a text channel`,
        );
        this.state.consecutiveFailures++;
        return;
      }

      const weather = await this.weatherService.getComparison();

      const embed = this.buildDashboardEmbed(weather);

      await channel.send({ embeds: [embed] });

      this.state.lastSentAt = new Date();
      this.state.totalSent++;
      this.state.consecutiveFailures = 0;

      logger.info("DashboardService: dashboard sent successfully", {
        channelId,
        hasWeather: weather !== null,
        totalSent: this.state.totalSent,
      });
    } catch (error) {
      this.state.consecutiveFailures++;
      logger.error(
        "DashboardService: failed to send dashboard",
        error as Error,
        {
          channelId,
          consecutiveFailures: this.state.consecutiveFailures,
        },
      );
    }
  }

  private buildDashboardEmbed(weather: WeatherComparison | null): EmbedBuilder {
    const now = new Date();
    const dateLabel = now.toLocaleDateString("fr-FR", {
      timeZone: this.TIMEZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const formattedDate =
      dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

    const embed = new EmbedBuilder()
      .setTitle(`🌅 Bonjour les frères — ${formattedDate}`)
      .setColor(0xf4a261)
      .setTimestamp();

    if (weather) {
      this.addWeatherFields(embed, weather);
    } else {
      embed.setDescription(
        "*Météo indisponible ce matin, l'API fait la grasse matinée... 😴*\n\n" +
          "Bonne journée quand même les gars ! ☕",
      );
    }

    embed.setFooter({ text: "BroBot • Dashboard quotidien" });

    return embed;
  }

  private addWeatherFields(
    embed: EmbedBuilder,
    weather: WeatherComparison,
  ): void {
    const { tourcoing, rochefort, comparisonPhrase } = weather;

    embed.setDescription(comparisonPhrase);

    embed.addFields({
      name: `📍 Tourcoing — ${tourcoing.temperature}°C`,
      value: this.formatWeatherBlock(tourcoing),
      inline: true,
    });

    embed.addFields({
      name: "↔️",
      value: `**${Math.abs(weather.temperatureDiff)}°C**\nd'écart`,
      inline: true,
    });

    embed.addFields({
      name: `📍 Rochefort — ${rochefort.temperature}°C`,
      value: this.formatWeatherBlock(rochefort),
      inline: true,
    });
  }

  private formatWeatherBlock(data: WeatherData): string {
    const lines = [
      `${this.getConditionEmoji(data)} ${data.description}`,
      `🌡️ Ressenti **${data.feelsLike}°C**`,
      `💧 Humidité **${data.humidity}%**`,
      `💨 Vent **${data.windSpeed} km/h**`,
    ];
    return lines.join("\n");
  }

  private getConditionEmoji(data: WeatherData): string {
    if (data.isSnowing) return "❄️";
    if (data.isRaining) return "🌧️";
    if (data.isClear) return "☀️";
    if (data.isCloudy) return "☁️";
    return "🌤️";
  }
}
