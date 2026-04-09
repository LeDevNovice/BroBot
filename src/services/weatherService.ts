import axios from "axios";
import { logger } from "../utils/logger";
import { config } from "../config/env";

export interface WeatherData {
  city: string;
  country: string;
  temperature: number;
  feelsLike: number;
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  isRaining: boolean;
  isSnowing: boolean;
  isCloudy: boolean;
  isClear: boolean;
}

export interface WeatherComparison {
  tourcoing: WeatherData;
  rochefort: WeatherData;
  comparisonPhrase: string;
  temperatureDiff: number;
}

const OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5/weather";

const CITY_CONFIGS = {
  tourcoing: { q: "Tourcoing,FR", label: "Tourcoing" },
  rochefort: { q: "Rochefort,FR", label: "Rochefort" },
} as const;

interface OpenWeatherResponse {
  name: string;
  sys: { country: string };
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
  };
  weather: Array<{
    id: number;
    description: string;
    icon: string;
  }>;
  wind: { speed: number };
}

export class WeatherService {
  async getComparison(): Promise<WeatherComparison | null> {
    try {
      const [tourcoing, rochefort] = await Promise.all([
        this.fetchWeather("tourcoing"),
        this.fetchWeather("rochefort"),
      ]);

      if (!tourcoing || !rochefort) {
        logger.warn("WeatherService: one or both cities failed to fetch");
        return null;
      }

      const temperatureDiff = rochefort.temperature - tourcoing.temperature;
      const comparisonPhrase = this.buildComparisonPhrase(
        tourcoing,
        rochefort,
        temperatureDiff,
      );

      return { tourcoing, rochefort, comparisonPhrase, temperatureDiff };
    } catch (error) {
      logger.error("WeatherService: failed to get comparison", error as Error);
      return null;
    }
  }

  private async fetchWeather(
    city: keyof typeof CITY_CONFIGS,
  ): Promise<WeatherData | null> {
    const { q, label } = CITY_CONFIGS[city];

    try {
      const response = await axios.get<OpenWeatherResponse>(
        OPENWEATHER_BASE_URL,
        {
          params: {
            q,
            appid: config.OPENWEATHER_API_KEY,
            units: "metric",
            lang: "fr",
          },
          timeout: 8000,
        },
      );

      return this.mapToWeatherData(label, response.data);
    } catch (error) {
      logger.error(
        `WeatherService: failed to fetch weather for ${label}`,
        error as Error,
      );
      return null;
    }
  }

  private mapToWeatherData(
    city: string,
    raw: OpenWeatherResponse,
  ): WeatherData {
    const weather = raw.weather[0];
    const weatherId = weather.id;

    return {
      city,
      country: raw.sys.country,
      temperature: Math.round(raw.main.temp),
      feelsLike: Math.round(raw.main.feels_like),
      description: this.capitalizeFirst(weather.description),
      icon: weather.icon,
      humidity: raw.main.humidity,
      windSpeed: Math.round(raw.wind.speed * 3.6), // m/s → km/h
      isRaining: weatherId >= 200 && weatherId < 600,
      isSnowing: weatherId >= 600 && weatherId < 700,
      isCloudy: (weatherId >= 700 && weatherId < 800) || weatherId > 800,
      isClear: weatherId === 800,
    };
  }

  private buildComparisonPhrase(
    tourcoing: WeatherData,
    rochefort: WeatherData,
    diff: number,
  ): string {
    const absDiff = Math.abs(diff);

    if (tourcoing.isSnowing && !rochefort.isSnowing) {
      return `❄️ Tu te bats contre la neige à Tourcoing... ton frère se dore la pilule à ${rochefort.temperature}°C à Rochefort. Injuste.`;
    }

    if (rochefort.isSnowing && !tourcoing.isSnowing) {
      return `❄️ Ton frère est dans la neige à Rochefort ! Toi tu es tranquille à ${tourcoing.temperature}°C à Tourcoing.`;
    }

    if (tourcoing.isRaining && rochefort.isClear) {
      return `🌧️ Il pleut sur Tourcoing... pendant que ton frère profite d'un ciel dégagé à ${rochefort.temperature}°C à Rochefort. Chanceux.`;
    }

    if (rochefort.isRaining && tourcoing.isClear) {
      return `🌧️ Il pleut sur Rochefort ! Ton frère trinque sous la pluie pendant que tu profites du beau temps à Tourcoing.`;
    }

    if (tourcoing.isRaining && rochefort.isRaining) {
      return `🌧️ Il pleut partout — ${tourcoing.temperature}°C à Tourcoing, ${rochefort.temperature}°C à Rochefort. Vous souffrez ensemble, au moins.`;
    }

    if (absDiff >= 10) {
      if (diff > 0) {
        return `🌡️ C'est une autre planète : ${rochefort.temperature}°C à Rochefort contre ${tourcoing.temperature}°C à Tourcoing. Ton frère vit dans un autre pays que toi.`;
      } else {
        return `🌡️ C'est une autre planète : ${tourcoing.temperature}°C à Tourcoing contre ${rochefort.temperature}°C à Rochefort. Ton frère se les caille pendant que tu profites.`;
      }
    }

    if (absDiff >= 5) {
      if (diff > 0) {
        return `☀️ Pendant que tu fais avec tes ${tourcoing.temperature}°C à Tourcoing, ton frère profite de ${rochefort.temperature}°C à Rochefort. ${diff}°C de plus, ça se ressent.`;
      } else {
        return `🧣 Ton frère grelotte à ${rochefort.temperature}°C à Rochefort pendant que tu as ${tourcoing.temperature}°C à Tourcoing. ${absDiff}°C d'écart, il peut pas se plaindre en silence.`;
      }
    }

    if (absDiff >= 2) {
      if (diff > 0) {
        return `🌤️ Rochefort est ${diff}°C plus chaud ce matin — ${rochefort.temperature}°C là-bas, ${tourcoing.temperature}°C à Tourcoing. Toujours l'Atlantique qui gagne.`;
      } else {
        return `🌥️ Tourcoing est ${absDiff}°C plus chaud que Rochefort ce matin — ${tourcoing.temperature}°C vs ${rochefort.temperature}°C. Le Nord a ses avantages, parfois.`;
      }
    }

    if (tourcoing.isClear && rochefort.isClear) {
      return `☀️ Même beau temps pour vous deux : ${tourcoing.temperature}°C à Tourcoing, ${rochefort.temperature}°C à Rochefort. Une belle journée partagée malgré les 800 km.`;
    }

    if (tourcoing.isCloudy && rochefort.isCloudy) {
      return `☁️ Temps couvert pour vous deux : ${tourcoing.temperature}°C à Tourcoing, ${rochefort.temperature}°C à Rochefort. Vous êtes synchronisés, même dans le gris.`;
    }

    return `🌡️ Presque la même température ce matin — ${tourcoing.temperature}°C à Tourcoing, ${rochefort.temperature}°C à Rochefort. La distance ne se voit pas sur le thermomètre.`;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  static getIconUrl(iconCode: string): string {
    return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  }
}
