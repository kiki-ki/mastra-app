import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const observationPlanSchema = z.object({
  location: z.string(),
  datetime: z.string(),
  coordinates: z.object({
    latitude: z.number(),
    longitude: z.number(),
    display_name: z.string(),
  }),
  astronomical_data: z.object({
    moon_phase: z.string(),
    moon_illumination: z.number(),
    sunrise_time: z.string(),
    sunset_time: z.string(),
    astronomical_twilight_begin: z.string(),
    astronomical_twilight_end: z.string(),
    civil_twilight_begin: z.string(),
    civil_twilight_end: z.string(),
  }),
  events: z.array(z.object({
    event_name: z.string(),
    datetime: z.string(),
    description: z.string(),
    type: z.string(),
    visibility_condition: z.string(),
  })),
  light_pollution: z.object({
    bortle_scale_rating: z.number(),
    pollution_description: z.string(),
    observation_recommendations: z.string(),
  }),
  observation_plan: z.string(),
});

// Step 1: 地名解決
const geocodeLocation = createStep({
  id: 'geocode-location',
  description: 'Convert location name to coordinates',
  inputSchema: z.object({
    location: z.string(),
    datetime: z.string(),
  }),
  outputSchema: z.object({
    location: z.string(),
    datetime: z.string(),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
      display_name: z.string(),
    }),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    // Geocoding Toolを呼び出す（実際の実装では適切なツール呼び出しを行う）
    const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(inputData.location)}&count=1`;
    const response = await fetch(geocodingUrl);
    const data = await response.json();

    if (!data.results || !data.results[0]) {
      throw new Error(`Location '${inputData.location}' not found`);
    }

    const { latitude, longitude, name } = data.results[0];

    return {
      location: inputData.location,
      datetime: inputData.datetime,
      coordinates: {
        latitude,
        longitude,
        display_name: name,
      },
    };
  },
});

// Step 2: 天文計算
const calculateAstronomicalData = createStep({
  id: 'calculate-astronomical-data',
  description: 'Calculate astronomical data for the location and date',
  inputSchema: z.object({
    location: z.string(),
    datetime: z.string(),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
      display_name: z.string(),
    }),
  }),
  outputSchema: z.object({
    location: z.string(),
    datetime: z.string(),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
      display_name: z.string(),
    }),
    astronomical_data: z.object({
      moon_phase: z.string(),
      moon_illumination: z.number(),
      sunrise_time: z.string(),
      sunset_time: z.string(),
      astronomical_twilight_begin: z.string(),
      astronomical_twilight_end: z.string(),
      civil_twilight_begin: z.string(),
      civil_twilight_end: z.string(),
    }),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { latitude, longitude } = inputData.coordinates;
    const date = new Date(inputData.datetime);
    const dateStr = date.toISOString().split('T')[0];

    // Sunrise-sunset.org APIを使用
    const sunUrl = `https://api.sunrise-sunset.org/json?lat=${latitude}&lng=${longitude}&date=${dateStr}&formatted=0`;
    const sunResponse = await fetch(sunUrl);
    const sunData = await sunResponse.json();

    if (sunData.status !== 'OK') {
      throw new Error('Failed to fetch sunrise/sunset data');
    }

    // 月の情報を計算（簡易版）
    const moonPhase = calculateMoonPhase(date);
    const moonIllumination = calculateMoonIllumination(date);

    return {
      ...inputData,
      astronomical_data: {
        moon_phase: moonPhase.phase,
        moon_illumination: moonIllumination,
        sunrise_time: sunData.results.sunrise,
        sunset_time: sunData.results.sunset,
        astronomical_twilight_begin: sunData.results.astronomical_twilight_begin,
        astronomical_twilight_end: sunData.results.astronomical_twilight_end,
        civil_twilight_begin: sunData.results.civil_twilight_begin,
        civil_twilight_end: sunData.results.civil_twilight_end,
      },
    };
  },
});

// Step 3: 天体イベント取得
const getAstronomicalEvents = createStep({
  id: 'get-astronomical-events',
  description: 'Get astronomical events for the specified period',
  inputSchema: z.object({
    location: z.string(),
    datetime: z.string(),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
      display_name: z.string(),
    }),
    astronomical_data: z.object({
      moon_phase: z.string(),
      moon_illumination: z.number(),
      sunrise_time: z.string(),
      sunset_time: z.string(),
      astronomical_twilight_begin: z.string(),
      astronomical_twilight_end: z.string(),
      civil_twilight_begin: z.string(),
      civil_twilight_end: z.string(),
    }),
  }),
  outputSchema: z.object({
    location: z.string(),
    datetime: z.string(),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
      display_name: z.string(),
    }),
    astronomical_data: z.object({
      moon_phase: z.string(),
      moon_illumination: z.number(),
      sunrise_time: z.string(),
      sunset_time: z.string(),
      astronomical_twilight_begin: z.string(),
      astronomical_twilight_end: z.string(),
      civil_twilight_begin: z.string(),
      civil_twilight_end: z.string(),
    }),
    events: z.array(z.object({
      event_name: z.string(),
      datetime: z.string(),
      description: z.string(),
      type: z.string(),
      visibility_condition: z.string(),
    })),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const startDate = new Date(inputData.datetime);
    const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 1週間後

    const events = getSeasonalEvents(startDate.getMonth() + 1);

    return {
      ...inputData,
      events,
    };
  },
});

// Step 4: 光害レベル評価
const evaluateLightPollution = createStep({
  id: 'evaluate-light-pollution',
  description: 'Evaluate light pollution level for the location',
  inputSchema: z.object({
    location: z.string(),
    datetime: z.string(),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
      display_name: z.string(),
    }),
    astronomical_data: z.object({
      moon_phase: z.string(),
      moon_illumination: z.number(),
      sunrise_time: z.string(),
      sunset_time: z.string(),
      astronomical_twilight_begin: z.string(),
      astronomical_twilight_end: z.string(),
      civil_twilight_begin: z.string(),
      civil_twilight_end: z.string(),
    }),
    events: z.array(z.object({
      event_name: z.string(),
      datetime: z.string(),
      description: z.string(),
      type: z.string(),
      visibility_condition: z.string(),
    })),
  }),
  outputSchema: z.object({
    location: z.string(),
    datetime: z.string(),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
      display_name: z.string(),
    }),
    astronomical_data: z.object({
      moon_phase: z.string(),
      moon_illumination: z.number(),
      sunrise_time: z.string(),
      sunset_time: z.string(),
      astronomical_twilight_begin: z.string(),
      astronomical_twilight_end: z.string(),
      civil_twilight_begin: z.string(),
      civil_twilight_end: z.string(),
    }),
    events: z.array(z.object({
      event_name: z.string(),
      datetime: z.string(),
      description: z.string(),
      type: z.string(),
      visibility_condition: z.string(),
    })),
    light_pollution: z.object({
      bortle_scale_rating: z.number(),
      pollution_description: z.string(),
      observation_recommendations: z.string(),
    }),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { latitude, longitude } = inputData.coordinates;
    const lightPollutionData = estimateLightPollution(latitude, longitude);

    return {
      ...inputData,
      light_pollution: {
        bortle_scale_rating: lightPollutionData.bortle_scale,
        pollution_description: lightPollutionData.description,
        observation_recommendations: lightPollutionData.recommendations,
      },
    };
  },
});

// Step 5: 観測プラン作成
const generateObservationPlan = createStep({
  id: 'generate-observation-plan',
  description: 'Generate comprehensive observation plan',
  inputSchema: z.object({
    location: z.string(),
    datetime: z.string(),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
      display_name: z.string(),
    }),
    astronomical_data: z.object({
      moon_phase: z.string(),
      moon_illumination: z.number(),
      sunrise_time: z.string(),
      sunset_time: z.string(),
      astronomical_twilight_begin: z.string(),
      astronomical_twilight_end: z.string(),
      civil_twilight_begin: z.string(),
      civil_twilight_end: z.string(),
    }),
    events: z.array(z.object({
      event_name: z.string(),
      datetime: z.string(),
      description: z.string(),
      type: z.string(),
      visibility_condition: z.string(),
    })),
    light_pollution: z.object({
      bortle_scale_rating: z.number(),
      pollution_description: z.string(),
      observation_recommendations: z.string(),
    }),
  }),
  outputSchema: observationPlanSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const plan = generateDetailedObservationPlan(inputData);

    return {
      ...inputData,
      observation_plan: plan,
    };
  },
});

// ワークフロー定義
const planObservationWorkflow = createWorkflow({
  id: 'plan-observation-workflow',
  inputSchema: z.object({
    location: z.string().describe('The location for astronomical observation'),
    datetime: z.string().describe('The date and time for observation'),
  }),
  outputSchema: observationPlanSchema,
})
  .then(geocodeLocation)
  .then(calculateAstronomicalData)
  .then(getAstronomicalEvents)
  .then(evaluateLightPollution)
  .then(generateObservationPlan);

planObservationWorkflow.commit();

// ヘルパー関数
function calculateMoonPhase(date: Date) {
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const lunarCycle = 29.530588853;

  const diffTime = date.getTime() - knownNewMoon.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  const phase = (diffDays % lunarCycle) / lunarCycle;

  if (phase < 0.0625 || phase >= 0.9375) return { phase: '新月' };
  if (phase < 0.1875) return { phase: '三日月' };
  if (phase < 0.3125) return { phase: '上弦の月' };
  if (phase < 0.4375) return { phase: '十三夜月' };
  if (phase < 0.5625) return { phase: '満月' };
  if (phase < 0.6875) return { phase: '寝待月' };
  if (phase < 0.8125) return { phase: '下弦の月' };
  return { phase: '二十六夜月' };
}

function calculateMoonIllumination(date: Date): number {
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const lunarCycle = 29.530588853;

  const diffTime = date.getTime() - knownNewMoon.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  const phase = (diffDays % lunarCycle) / lunarCycle;

  return Math.round((1 - Math.cos(2 * Math.PI * phase)) * 50);
}

function getSeasonalEvents(month: number) {
  const events = [];

  if (month >= 12 || month <= 2) {
    events.push({
      event_name: 'オリオン座大星雲（M42）',
      datetime: new Date().toISOString(),
      description: '冬の代表的な星雲。双眼鏡や小型望遠鏡で美しい姿を観測できます。',
      type: 'deep_sky_object',
      visibility_condition: '冬の夜空で高い位置に昇る。光害の少ない場所での観測が推奨。',
    });
  } else if (month >= 3 && month <= 5) {
    events.push({
      event_name: '北斗七星とうしかい座',
      datetime: new Date().toISOString(),
      description: '春の大曲線をたどって、うしかい座のアルクトゥルスを見つけましょう。',
      type: 'constellation',
      visibility_condition: '春の夜空で北東から天頂にかけて観測可能。',
    });
  } else if (month >= 6 && month <= 8) {
    events.push({
      event_name: '夏の大三角とさそり座',
      datetime: new Date().toISOString(),
      description: '夏の夜空の代表的な星座。天の川も同時に観測できます。',
      type: 'constellation',
      visibility_condition: '夏の夜空で南の空高く昇る。天の川観測には暗い空が必要。',
    });
  } else {
    events.push({
      event_name: 'アンドロメダ座銀河（M31）',
      datetime: new Date().toISOString(),
      description: '肉眼でも見える最も遠い天体。双眼鏡で楕円形の姿を確認できます。',
      type: 'deep_sky_object',
      visibility_condition: '秋の夜空で高い位置に昇る。暗い空での観測が必要。',
    });
  }

  return events;
}

function estimateLightPollution(latitude: number, longitude: number) {
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
    bortleScale = 2;
  }

  const pollutionInfo = getBortleScaleInfo(bortleScale);

  return {
    bortle_scale: bortleScale,
    description: pollutionInfo.description,
    recommendations: pollutionInfo.recommendations,
  };
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
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
    }
  };

  return scaleInfo[scale] || scaleInfo[5];
}

function generateDetailedObservationPlan(data: any): string {
  const { coordinates, astronomical_data, events, light_pollution } = data;

  const sunsetTime = new Date(astronomical_data.sunset_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const astronomicalTwilightEnd = new Date(astronomical_data.astronomical_twilight_end).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  return `📅 ${coordinates.display_name} での天体観測プランをご提案します！

🌙 月の条件
- 月相: ${astronomical_data.moon_phase}
- 月明かり: ${astronomical_data.moon_illumination}%
- 月明かりの影響: ${astronomical_data.moon_illumination > 50 ? '強い' : astronomical_data.moon_illumination > 20 ? '中程度' : '弱い'}

🌅 観測時間帯
- 日没: ${sunsetTime}
- 天文薄明終了: ${astronomicalTwilightEnd} ← 暗い空の開始
- 最適な観測時間帯: ${astronomicalTwilightEnd}以降

⭐ 今夜の見どころ
${events.map((event: any) => `• ${event.event_name}: ${event.description}`).join('\n')}

🏙️ 光害情報
- ボートルスケール: クラス${light_pollution.bortle_scale_rating}
- ${light_pollution.pollution_description}

📝 観測のポイント
${light_pollution.observation_recommendations}

💡 推奨事項
- 天文薄明終了後の観測がおすすめです
- 月明かりが${astronomical_data.moon_illumination > 50 ? '強いため、明るい天体に焦点を当ててください' : '弱いため、暗い天体も観測可能です'}
- 光害レベルを考慮した観測計画を立ててください`;
}

export { planObservationWorkflow };
