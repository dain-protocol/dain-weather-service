//File: example/example-node.ts

import { z } from "zod";
import axios from "axios";

import {
  defineDAINService,
  ToolConfig,
  ServiceConfig,
  ToolboxConfig,
} from "@dainprotocol/service-sdk";

import { ServiceContext } from "@dainprotocol/service-sdk/service";
import { ServicePinnable } from "@dainprotocol/service-sdk/service";

// Simple in-memory store for weather search history -- could use a database in the future to store the history
const weatherSearchHistory: Record<string, Array<{
  timestamp: number,
  latitude: number,
  longitude: number,
  temperature: number,
  windSpeed: number
}>> = {};

const getWeatherConfig: ToolConfig = {
  id: "get-weather",
  name: "Get Weather",
  description: "Fetches current weather for a city",
  input: z
    .object({
      latitude: z.number().describe("Latitude coordinate"),
      longitude: z.number().describe("Longitude coordinate"),
    })
    .describe("Input parameters for the weather request"),
  output: z
    .object({
      temperature: z.number().describe("Current temperature in Celsius"),
      windSpeed: z.number().describe("Current wind speed in km/h"),
    })
    .describe("Current weather information"),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ latitude, longitude }, agentInfo) => {
    console.log(
      `User / Agent ${agentInfo.id} requested weather at ${latitude},${longitude}`
    );

    const response = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m`
    );

    const { temperature_2m, wind_speed_10m } = response.data.current;

    // Store the search in history
    if (!weatherSearchHistory[agentInfo.id]) {
      weatherSearchHistory[agentInfo.id] = [];
    }
    weatherSearchHistory[agentInfo.id].push({
      timestamp: Date.now(),
      latitude,
      longitude, 
      temperature: temperature_2m,
      windSpeed: wind_speed_10m
    });

    return {
      text: `The current temperature is ${temperature_2m}°C with wind speed of ${wind_speed_10m} km/h`,
      data: {
        temperature: temperature_2m,
        windSpeed: wind_speed_10m,
      },
      ui: {},
    };
  },
};

const getWeatherForecastConfig: ToolConfig = {
  id: "get-weather-forecast",
  name: "Get Weather Forecast", 
  description: "Fetches hourly weather forecast",
  input: z
    .object({
      latitude: z.number().describe("Latitude coordinate"),
      longitude: z.number().describe("Longitude coordinate"),
    })
    .describe("Input parameters for the forecast request"),
  output: z
    .object({
      times: z.array(z.string()).describe("Forecast times"),
      temperatures: z
        .array(z.number())
        .describe("Temperature forecasts in Celsius"),
      windSpeeds: z.array(z.number()).describe("Wind speed forecasts in km/h"),
      humidity: z
        .array(z.number())
        .describe("Relative humidity forecasts in %"),
    })
    .describe("Hourly weather forecast"),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ latitude, longitude }, agentInfo) => {
    console.log(
      `User / Agent ${agentInfo.id} requested forecast at ${latitude},${longitude}`
    );

    const response = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m`
    );

    const { time, temperature_2m, wind_speed_10m, relative_humidity_2m } =
      response.data.hourly;

    return {
      text: `Weather forecast available for the next ${time.length} hours`,
      data: {
        times: time,
        temperatures: temperature_2m,
        windSpeeds: wind_speed_10m,
        humidity: relative_humidity_2m,
      },
      ui: {},
    };
  },
};

// Weather History Context is asdditional context provided to the assistant to help it understand more about the user's interactions with this specific service.
export const weatherHistoryContext: ServiceContext = {
  id: "weatherHistory",
  name: "Weather Search History",
  description: "User's previous weather searches",
  getContextData: async (agentInfo) => {
    const history = weatherSearchHistory[agentInfo.id] || [];
    
    if (history.length === 0) {
      return "No previous weather searches found for this user.";
    }

    return `User has made ${history.length} weather searches. Recent searches:\n${JSON.stringify(history.slice(-5), null, 2)}`;
  }
};



// Weather History Button will appear on the UI as a pinned button and will render a component that displays the weather search history similar to the cart button for the food service. 
export const weatherHistoryButton: ServicePinnable = {
  id: "weatherHistoryButton",
  name: "Weather History",
  description: "View your weather search history",
  type: "button",
  label: "History",
  icon: "history",
  getWidget: async (agentInfo) => {
    const history = weatherSearchHistory[agentInfo.id] || [];

    if (history.length === 0) {
      return {
        text: "No weather search history available.",
        data: {},
        ui: {
          type: "p",
          children: "You haven't made any weather searches yet.",
        },
      };
    }

    const tableData = {
      columns: [
        {
          key: "timestamp",
          header: "Time",
          type: "text",
          width: "25%"
        },
        {
          key: "location",
          header: "Location",
          type: "text",
          width: "25%"
        },
        {
          key: "temperature",
          header: "Temperature",
          type: "text",
          width: "25%"
        },
        {
          key: "windSpeed",
          header: "Wind Speed",
          type: "text",
          width: "25%"
        }
      ],
      rows: history.map(search => ({
        timestamp: new Date(search.timestamp).toLocaleString(),
        location: `${search.latitude.toFixed(2)}, ${search.longitude.toFixed(2)}`,
        temperature: `${search.temperature}°C`,
        windSpeed: `${search.windSpeed} km/h`
      }))
    };

    return {
      text: `Weather search history: ${history.length} searches`,
      data: history,
      ui: {
        type: "table",
        uiData: JSON.stringify(tableData)
      },
    };
  },
};

const dainService = defineDAINService({
  metadata: {
    title: "Weather DAIN Service",
    description:
      "A DAIN service for current weather and forecasts using Open-Meteo API",
    version: "1.0.0",
    author: "Your Name",
    logo: "https://cdn-icons-png.flaticon.com/512/252/252035.png",
    tags: ["weather", "forecast", "dain"],
  },
  identity: {
    apiKey: process.env.DAIN_API_KEY,
  },
  tools: [getWeatherConfig, getWeatherForecastConfig],
  contexts: [weatherHistoryContext],
  pinnables: [weatherHistoryButton]
});

dainService.startNode({ port: 2022 }).then(() => {
  console.log("Weather DAIN Service is running on port 2022");
});
