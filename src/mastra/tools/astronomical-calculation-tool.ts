import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const astronomicalCalculationTool = createTool({
  id: 'astronomical-calculation',
  description: 'Provides accurate astronomical calculations using NASA APIs for sun/moon/planet rise/set times and NASA\'s daily astronomy image.',
  inputSchema: z.object({
    latitude: z.number().describe('Latitude of the observation location'),
    longitude: z.number().describe('Longitude of the observation location'),
    datetime: z.string().describe('Date and time for calculation (ISO8601 format)'),
  }),
  outputSchema: z.object({
    sunrise_time: z.string(),
    sunset_time: z.string(),
    moonrise_time: z.string().optional(),
    moonset_time: z.string().optional(),
    nasa_apod_info: z.string().optional(),
    planetary_positions: z.array(z.object({
      planet: z.string(),
      rise_time: z.string().optional(),
      set_time: z.string().optional(),
    })).optional(),
  }),
  execute: async ({ context }) => {
    const { latitude, longitude, datetime } = context;
    const dateStr = new Date(datetime).toISOString().split('T')[0];

    try {
      // NASA APOD - 今日の天体写真
      const apodInfo = await fetchAPODInfo(dateStr);

      // NASA Horizons APIで太陽データを取得
      const sunData = await fetchCelestialBodyRiseSet('10', latitude, longitude, dateStr);

      // NASA Horizons APIで月データを取得
      const moonData = await fetchCelestialBodyRiseSet('301', latitude, longitude, dateStr);

      // NASA Horizons APIで主要惑星の出没時刻を取得
      const planetaryPositions = await fetchPlanetaryPositions(latitude, longitude, dateStr);

      return {
        sunrise_time: sunData.rise || '',
        sunset_time: sunData.set || '',
        moonrise_time: moonData.rise || undefined,
        moonset_time: moonData.set || undefined,
        nasa_apod_info: apodInfo,
        planetary_positions: planetaryPositions,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      throw new Error(`天体計算に失敗しました: ${errorMessage}`);
    }
  },
});

// NASA APOD情報を取得
async function fetchAPODInfo(dateStr: string): Promise<string> {
  try {
    const apiKey = process.env.NASA_API_KEY || 'DEMO_KEY';

    // APOD APIは1995年6月16日以降のデータのみ利用可能
    const requestDate = new Date(dateStr);
    const minDate = new Date('1995-06-16');
    const today = new Date();

    // 日付が範囲外の場合は今日の日付を使用
    let actualDateStr = dateStr;
    if (requestDate < minDate || requestDate > today) {
      actualDateStr = today.toISOString().split('T')[0];
    }

    const apodUrl = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}&date=${actualDateStr}`;
    const response = await fetch(apodUrl);

    if (!response.ok) {
      throw new Error(`NASA APOD API HTTP error: ${response.status}`);
    }

    const data = await response.json();

    if (data.title && data.explanation) {
      return `今日のNASA天体写真: ${data.title} - ${data.explanation.substring(0, 100)}...`;
    }

    return 'NASA天体写真情報が利用できません';
  } catch (error) {
    console.warn('NASA APOD API error:', error);
    return 'NASA天体写真情報の取得に失敗しました';
  }
}

// NASA Horizons APIで天体の出没時刻を取得（統一関数）
async function fetchCelestialBodyRiseSet(bodyId: string, latitude: number, longitude: number, dateStr: string) {
  try {
    const center = 'coord';
    const siteCoord = `${longitude},${latitude},0`;
    const stepSize = bodyId === '10' ? '2h' : '2h'; // 太陽は2時間間隔、他も2時間間隔

    const params = new URLSearchParams({
      format: 'json',
      COMMAND: `'${bodyId}'`,
      EPHEM_TYPE: 'OBSERVER',
      CENTER: `'${center}'`,
      SITE_COORD: `'${siteCoord}'`,
      START_TIME: `'${dateStr} 00:00'`,
      STOP_TIME: `'${dateStr} 23:59'`,
      STEP_SIZE: stepSize,
      QUANTITIES: '4', // 高度・方位角
      SKIP_DAYLT: 'NO',
      CAL_FORMAT: 'CAL',
      TIME_DIGITS: 'MINUTES',
      CSV_FORMAT: 'YES',
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES'
    });

    const horizonsUrl = `https://ssd.jpl.nasa.gov/api/horizons.api?${params.toString()}`;

    console.log(`Fetching body ${bodyId} data from NASA Horizons API`);

    const response = await fetch(horizonsUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mastra-NASA-Client'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Horizons API error for body ${bodyId}:`, errorText.substring(0, 200));
      throw new Error(`Horizons API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      console.error(`Horizons API returned error for body ${bodyId}:`, data.error);
      throw new Error(`Horizons API error: ${data.error}`);
    }

    const result = data.result || '';
    console.log(`Body ${bodyId} data result length:`, result.length);

    // CSV データから出没時刻を計算
    const { rise, set } = calculateRiseSetFromElevationData(result);

    console.log(`Body ${bodyId} calculated rise:`, rise, 'set:', set);

    return { rise, set };
  } catch (error) {
    console.error(`fetchCelestialBodyRiseSet error for body ${bodyId}:`, error);
    throw new Error(`天体 ${bodyId} のデータ取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
}

// 高度データから出没時刻を計算（統一関数）
function calculateRiseSetFromElevationData(csvData: string): { rise: string | null, set: string | null } {
  try {
    const lines = csvData.split('\n');
    let dataStarted = false;
    const elevationData: { time: string, elevation: number }[] = [];

    for (const line of lines) {
      if (line.includes('$$SOE')) {
        dataStarted = true;
        continue;
      }
      if (line.includes('$$EOE')) {
        break;
      }
      if (!dataStarted || line.trim() === '') {
        continue;
      }

      // CSV形式のデータをパース
      const columns = line.split(',');
      if (columns.length >= 5) {
        const timeStr = columns[0]?.trim();
        const elevationStr = columns[4]?.trim(); // 5番目のカラムが高度

        if (timeStr && elevationStr) {
          const elevation = parseFloat(elevationStr);
          if (!isNaN(elevation)) {
            elevationData.push({ time: timeStr, elevation });
          }
        }
      }
    }

    console.log('Elevation data parsed:', elevationData.length, 'points');

    // 地平線を横切る時刻を見つける（高度が0度を通過する点）
    let rise: string | null = null;
    let set: string | null = null;
    let foundFirstRise = false;

    for (let i = 1; i < elevationData.length; i++) {
      const prev = elevationData[i - 1];
      const curr = elevationData[i];

      // 負から正へ変化 = 昇り
      if (prev.elevation < 0 && curr.elevation >= 0) {
        if (!foundFirstRise) {
          rise = interpolateTime(prev, curr, 0);
          foundFirstRise = true;
          console.log('Rise found between:', prev.time, 'and', curr.time);
        }
      }

      // 正から負へ変化 = 沈み（昇りが見つかった後）
      if (prev.elevation >= 0 && curr.elevation < 0 && foundFirstRise && !set) {
        set = interpolateTime(prev, curr, 0);
        console.log('Set found between:', prev.time, 'and', curr.time);
        break; // 沈みを見つけたら終了
      }
    }

    return {
      rise: rise ? formatTimeToISO(rise) : null,
      set: set ? formatTimeToISO(set) : null
    };
  } catch (error) {
    console.warn('Failed to calculate rise/set times from elevation data:', error);
    return { rise: null, set: null };
  }
}

// 2点間で高度0度になる時刻を線形補間で計算
function interpolateTime(point1: { time: string, elevation: number }, point2: { time: string, elevation: number }, targetElevation: number): string {
  const t1 = new Date(point1.time).getTime();
  const t2 = new Date(point2.time).getTime();
  const e1 = point1.elevation;
  const e2 = point2.elevation;

  // 線形補間: t = t1 + (targetElevation - e1) * (t2 - t1) / (e2 - e1)
  const interpolatedTime = t1 + (targetElevation - e1) * (t2 - t1) / (e2 - e1);
  return new Date(interpolatedTime).toISOString().replace('T', ' ').substring(0, 16);
}

// 時刻文字列をISO形式に変換
function formatTimeToISO(timeStr: string): string {
  try {
    return new Date(timeStr).toISOString();
  } catch (error) {
    console.warn('Failed to format time to ISO:', timeStr, error);
    return timeStr;
  }
}

// 主要惑星の出没時刻を取得
async function fetchPlanetaryPositions(latitude: number, longitude: number, dateStr: string) {
  const planets = [
    { name: '金星', id: '299' },
    { name: '火星', id: '499' },
    { name: '木星', id: '599' },
    { name: '土星', id: '699' }
  ];

  const results = [];

  for (const planet of planets) {
    try {
      const planetData = await fetchCelestialBodyRiseSet(planet.id, latitude, longitude, dateStr);
      results.push({
        planet: planet.name,
        rise_time: planetData.rise || undefined,
        set_time: planetData.set || undefined,
      });
    } catch (error) {
      console.warn(`Failed to fetch data for ${planet.name}:`, error);
      // 失敗した惑星のデータは含めない
    }
  }

  return results;
}

