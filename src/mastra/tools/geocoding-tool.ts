import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

interface GeocodingResponse {
  results: {
    latitude: number;
    longitude: number;
    name: string;
  }[];
}

export const geocodingTool = createTool({
  id: 'geocoding-tool',
  description: 'Convert a location name to latitude and longitude',
  inputSchema: z.object({
    location: z.string().describe('Location name'),
  }),
  outputSchema: z.object({
    latitude: z.number(),
    longitude: z.number(),
    location: z.string(),
  }),
  execute: async ({ context }) => {
    return await getGeocodingData(context.location);
  },
});

const getGeocodingData = async (location: string) => {
  const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
  const geocodingResponse = await fetch(geocodingUrl);
  const geocodingData = (await geocodingResponse.json()) as GeocodingResponse;

  if (!geocodingData.results?.[0]) {
    throw new Error(`Location '${location}' not found`);
  }

  const { latitude, longitude, name } = geocodingData.results[0];

  return {
    latitude,
    longitude,
    location: name,
  };
};
