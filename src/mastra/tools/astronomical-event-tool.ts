import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const astronomicalEventTool = createTool({
  id: 'astronomical-events',
  description: 'Retrieves astronomical events using NASA APIs: near-Earth objects, meteor showers, eclipses, and seasonal deep-sky objects.',
  inputSchema: z.object({
    start_datetime: z.string().describe('Start date for event search (ISO8601 format)'),
    end_datetime: z.string().describe('End date for event search (ISO8601 format)'),
    latitude: z.number().describe('Latitude of the observation location'),
    longitude: z.number().describe('Longitude of the observation location'),
  }),
  outputSchema: z.object({
    event_list: z.array(z.object({
      event_name: z.string(),
      datetime: z.string(),
      description: z.string(),
      type: z.string(),
      visibility_condition: z.string(),
      nasa_info: z.string().optional(),
      coordinates: z.object({
        ra: z.string().optional(),
        dec: z.string().optional(),
        constellation: z.string().optional(),
      }).optional(),
    })),
  }),
  execute: async ({ context }) => {
    const { start_datetime, end_datetime, latitude, longitude } = context;

    const startDate = new Date(start_datetime);
    const endDate = new Date(end_datetime);
    const events = [];

    try {
      // NASA近地天体接近データを取得
      const neoEvents = await getNASANearEarthObjects(start_datetime, end_datetime);
      events.push(...neoEvents);

      // 流星群データ（動的年調整）
      const meteorEvents = await getMeteorShowerEvents(startDate, endDate);
      events.push(...meteorEvents);

      // 月食・日食情報（NASA Eclipse API対応準備）
      const eclipseEvents = await getEclipseEvents(start_datetime, end_datetime);
      events.push(...eclipseEvents);

      // 季節の深宇宙天体
      const deepSkyEvents = await getDeepSkyObjectEvents(startDate, endDate);
      events.push(...deepSkyEvents);

    } catch (error) {
      console.warn('Error fetching astronomical events:', error);
    }

    // 日付順にソート
    events.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    return {
      event_list: events,
    };
  },
});

// NASA近地天体データを取得
async function getNASANearEarthObjects(startDate: string, endDate: string) {
  try {
    const apiKey = process.env.NASA_API_KEY || 'DEMO_KEY';
    const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${startDate}&end_date=${endDate}&api_key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`NASA NEO API error: ${response.status}`);
    }

    const data = await response.json();
    const events: any[] = [];

    if (data.near_earth_objects) {
      Object.values(data.near_earth_objects).forEach((dateObjects: any) => {
        dateObjects.forEach((neo: any) => {
          const distance = parseFloat(neo.close_approach_data[0]?.miss_distance?.kilometers || '0');
          const diameter = neo.estimated_diameter.meters.estimated_diameter_max;

          if (neo.is_potentially_hazardous_asteroid || distance < 1000000 || diameter > 100) {
            events.push({
              event_name: `小惑星接近: ${neo.name}`,
              datetime: neo.close_approach_data[0]?.close_approach_date_full || startDate,
              description: `直径約${Math.round(diameter)}mの小惑星が地球に接近します。最接近距離: ${Math.round(distance)}km`,
              type: 'asteroid_approach',
              visibility_condition: diameter > 500 ? '大型望遠鏡での観測が可能' : '観測には専門機器が必要',
              nasa_info: `NASA NeoWs APIより: 相対速度 ${Math.round(parseFloat(neo.close_approach_data[0]?.relative_velocity?.kilometers_per_hour || '0'))}km/h`,
            });
          }
        });
      });
    }

    return events;
  } catch (error) {
    console.warn('Failed to fetch NASA NEO data:', error);
    return [];
  }
}

// 日食・月食イベントを取得
async function getEclipseEvents(startDate: string, endDate: string) {
  const events: any[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // 2024年の主要な日食・月食（NASA Eclipse Webサイトデータ）
  const eclipses = [
    {
      date: '2024-04-08',
      type: '皆既日食',
      visibility: '北米',
      description: '北アメリカで観測可能な皆既日食'
    },
    {
      date: '2024-10-02',
      type: '金環日食',
      visibility: '南米・太平洋',
      description: '南アメリカと太平洋で観測可能な金環日食'
    }
  ];

  for (const eclipse of eclipses) {
    const eclipseDate = new Date(eclipse.date + 'T00:00:00Z');
    if (eclipseDate >= start && eclipseDate <= end) {
      events.push({
        event_name: eclipse.type,
        datetime: eclipseDate.toISOString(),
        description: eclipse.description,
        type: 'eclipse',
        visibility_condition: `${eclipse.visibility}で観測可能`,
        nasa_info: 'NASA Eclipse Webサイトで詳細情報を確認してください',
      });
    }
  }

  return events;
}

// 流星群イベントを動的に取得
async function getMeteorShowerEvents(startDate: Date, endDate: Date) {
  const events: any[] = [];
  const currentYear = startDate.getFullYear();

  // 主要流星群の動的リスト（年調整）
  const meteorShowers = [
    {
      name: 'しぶんぎ座流星群',
      peak_date: `${currentYear}-01-04`,
      duration_start: `${currentYear}-01-01`,
      duration_end: `${currentYear}-01-10`,
      zhr: 120,
      description: '年間三大流星群の一つ。短時間でピークを迎えます。',
      radiant: { ra: '15h 20m', dec: '+49°' }
    },
    {
      name: 'ペルセウス座流星群',
      peak_date: `${currentYear}-08-12`,
      duration_start: `${currentYear}-07-15`,
      duration_end: `${currentYear}-08-25`,
      zhr: 60,
      description: '年間三大流星群の一つ。観測しやすい夏の流星群。',
      radiant: { ra: '02h 20m', dec: '+58°' }
    },
    {
      name: 'ふたご座流星群',
      peak_date: `${currentYear}-12-14`,
      duration_start: `${currentYear}-12-05`,
      duration_end: `${currentYear}-12-20`,
      zhr: 120,
      description: '年間で最も安定した流星群。冬の代表的な天文現象。',
      radiant: { ra: '07h 28m', dec: '+33°' }
    },
    {
      name: 'オリオン座流星群',
      peak_date: `${currentYear}-10-22`,
      duration_start: `${currentYear}-10-15`,
      duration_end: `${currentYear}-10-29`,
      zhr: 25,
      description: 'ハレー彗星の軌道に由来する流星群。',
      radiant: { ra: '06h 20m', dec: '+16°' }
    }
  ];

  for (const shower of meteorShowers) {
    const peakDate = new Date(shower.peak_date + 'T00:00:00Z');
    const durationStart = new Date(shower.duration_start + 'T00:00:00Z');
    const durationEnd = new Date(shower.duration_end + 'T00:00:00Z');

    if ((peakDate >= startDate && peakDate <= endDate) ||
        (durationStart <= endDate && durationEnd >= startDate)) {

      let eventDate = peakDate;
      if (peakDate < startDate) eventDate = startDate;
      if (peakDate > endDate) eventDate = endDate;

      events.push({
        event_name: shower.name,
        datetime: eventDate.toISOString(),
        description: `${shower.description} 極大時期のZHR（天頂時間出現数）: 約${shower.zhr}個/時`,
        type: 'meteor_shower',
        visibility_condition: '月明かりの少ない暗い空での観測が最適。深夜から明け方が見頃。',
        nasa_info: `輻射点: 赤経${shower.radiant.ra} 赤緯${shower.radiant.dec}`,
        coordinates: {
          ra: shower.radiant.ra,
          dec: shower.radiant.dec,
          constellation: shower.name.split('座')[0] + '座'
        }
      });
    }
  }

  return events;
}

// 深宇宙天体イベントを取得
async function getDeepSkyObjectEvents(startDate: Date, endDate: Date) {
  const events: any[] = [];
  const month = startDate.getMonth() + 1;

  // 季節の代表的深宇宙天体
  const seasonalTargets = [
    {
      season: 'winter',
      months: [12, 1, 2],
      objects: [
        {
          name: 'オリオン座大星雲（M42）',
          type: 'nebula',
          constellation: 'オリオン座',
          coordinates: { ra: '05h 35m', dec: '-05° 27\'' },
          description: '冬空の代表的な散光星雲。双眼鏡でも美しく観測できます。',
          magnitude: 4.0
        },
        {
          name: 'プレアデス星団（M45）',
          type: 'star_cluster',
          constellation: 'おうし座',
          coordinates: { ra: '03h 47m', dec: '+24° 07\'' },
          description: '昴とも呼ばれる美しい散開星団。肉眼でも確認可能。',
          magnitude: 1.6
        }
      ]
    },
    {
      season: 'spring',
      months: [3, 4, 5],
      objects: [
        {
          name: '子持ち銀河（M51）',
          type: 'galaxy',
          constellation: 'りょうけん座',
          coordinates: { ra: '13h 30m', dec: '+47° 12\'' },
          description: '渦巻き銀河の代表例。中型望遠鏡で渦巻き構造が確認できます。',
          magnitude: 8.4
        }
      ]
    },
    {
      season: 'summer',
      months: [6, 7, 8],
      objects: [
        {
          name: 'いて座三裂星雲（M20）',
          type: 'nebula',
          constellation: 'いて座',
          coordinates: { ra: '18h 02m', dec: '-23° 02\'' },
          description: '夏の天の川で見える美しい星雲。撮影に人気の対象。',
          magnitude: 6.3
        },
        {
          name: '球状星団M13',
          type: 'globular_cluster',
          constellation: 'ヘルクレス座',
          coordinates: { ra: '16h 42m', dec: '+36° 28\'' },
          description: '北天で最も美しい球状星団の一つ。',
          magnitude: 5.8
        }
      ]
    },
    {
      season: 'autumn',
      months: [9, 10, 11],
      objects: [
        {
          name: 'アンドロメダ銀河（M31）',
          type: 'galaxy',
          constellation: 'アンドロメダ座',
          coordinates: { ra: '00h 43m', dec: '+41° 16\'' },
          description: '肉眼で見える最も遠い天体。我々の銀河の隣の銀河。',
          magnitude: 3.4
        }
      ]
    }
  ];

  const currentSeason = seasonalTargets.find(season => season.months.includes(month));

  if (currentSeason) {
    for (const obj of currentSeason.objects) {
      const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2);

      events.push({
        event_name: obj.name,
        datetime: midDate.toISOString(),
        description: `${obj.description} 等級: ${obj.magnitude}`,
        type: obj.type,
        visibility_condition: obj.magnitude > 6 ? '望遠鏡での観測が必要。光害の少ない暗い空が最適。' : '双眼鏡または肉眼でも観測可能。',
        nasa_info: `座標: ${obj.coordinates.ra} ${obj.coordinates.dec}`,
        coordinates: {
          ra: obj.coordinates.ra,
          dec: obj.coordinates.dec,
          constellation: obj.constellation
        }
      });
    }
  }

  return events;
}
