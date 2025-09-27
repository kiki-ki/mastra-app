import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const lightPollutionTool = createTool({
  id: 'light-pollution',
  description: 'Estimates light pollution level using Bortle scale for a given location.',
  inputSchema: z.object({
    latitude: z.number().describe('Latitude of the observation location'),
    longitude: z.number().describe('Longitude of the observation location'),
  }),
  outputSchema: z.object({
    bortle_scale_rating: z.number(),
    pollution_description: z.string(),
    observation_recommendations: z.string(),
  }),
  execute: async (input: any) => {
    const { latitude, longitude } = input;

    // 簡易的な光害レベル推定（実際のAPIでは詳細なデータを使用）
    const lightPollutionData = estimateLightPollution(latitude, longitude);

    return {
      bortle_scale_rating: lightPollutionData.bortle_scale,
      pollution_description: lightPollutionData.description,
      observation_recommendations: lightPollutionData.recommendations,
    };
  },
});

function estimateLightPollution(latitude: number, longitude: number) {
  // 主要都市圏の光害レベルを簡易推定
  const majorCities = [
    { name: '東京', lat: 35.6762, lng: 139.6503, bortle: 8 },
    { name: '大阪', lat: 34.6937, lng: 135.5023, bortle: 8 },
    { name: '名古屋', lat: 35.1815, lng: 136.9066, bortle: 7 },
    { name: '札幌', lat: 43.0642, lng: 141.3469, bortle: 6 },
    { name: '福岡', lat: 33.5904, lng: 130.4017, bortle: 6 },
    { name: '仙台', lat: 38.2682, lng: 140.8694, bortle: 5 },
  ];

  let minDistance = Infinity;
  let nearestCity = null;

  for (const city of majorCities) {
    const distance = calculateDistance(latitude, longitude, city.lat, city.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestCity = city;
    }
  }

  let bortleScale;
  if (minDistance < 20) {
    bortleScale = nearestCity!.bortle;
  } else if (minDistance < 50) {
    bortleScale = Math.max(1, nearestCity!.bortle - 2);
  } else if (minDistance < 100) {
    bortleScale = Math.max(1, nearestCity!.bortle - 4);
  } else {
    bortleScale = 2; // 山間部・離島等
  }

  const pollutionInfo = getBortleScaleInfo(bortleScale);

  return {
    bortle_scale: bortleScale,
    description: pollutionInfo.description,
    recommendations: pollutionInfo.recommendations,
  };
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // 地球の半径 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getBortleScaleInfo(scale: number) {
  const scaleInfo: Record<number, { description: string; recommendations: string }> = {
    1: {
      description: 'クラス1: 優秀な暗い空サイト。天の川が明るく、地平線まで見える。',
      recommendations: '最高の観測条件。すべての天体が観測可能。深宇宙天体の撮影に最適。'
    },
    2: {
      description: 'クラス2: 典型的な真っ暗な空サイト。天の川が非常に明るく見える。',
      recommendations: '優秀な観測条件。微光天体も十分観測可能。'
    },
    3: {
      description: 'クラス3: 農村部の空。天の川がはっきりと見え、雲との区別ができる。',
      recommendations: '良好な観測条件。大部分の天体が観測可能。'
    },
    4: {
      description: 'クラス4: 農村/郊外の移行帯。天の川は見えるが淡い。',
      recommendations: 'まずまずの観測条件。明るい天体は問題なく観測可能。'
    },
    5: {
      description: 'クラス5: 郊外の空。天の川は天頂付近でかろうじて見える。',
      recommendations: '限定的な観測条件。明るい惑星、星座、星団の観測に適している。'
    },
    6: {
      description: 'クラス6: 明るい郊外の空。天の川は見えない。',
      recommendations: '明るい天体のみ観測可能。月、惑星、明るい星座の観測に限定される。'
    },
    7: {
      description: 'クラス7: 郊外/都市の移行帯または満月のような明るさ。',
      recommendations: '月、惑星、明るい恒星のみ観測可能。双眼鏡や望遠鏡での観測を推奨。'
    },
    8: {
      description: 'クラス8: 都市部の空。空は明るく、星座を見つけるのが困難。',
      recommendations: '月、金星、木星、明るい恒星のみ観測可能。市街地での観測は困難。'
    },
    9: {
      description: 'クラス9: 都市中心部の空。極めて明るく、観測は非常に困難。',
      recommendations: '月と最も明るい惑星のみ観測可能。観測には最低限の光学機器が必要。'
    }
  };

  return scaleInfo[scale] || scaleInfo[5];
}
