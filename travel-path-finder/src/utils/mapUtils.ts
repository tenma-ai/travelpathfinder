import type { Location, Route } from '../types';

/**
 * 2点間の距離をハバーサイン公式で計算（km単位）
 */
export function calculateDistance(from: [number, number], to: [number, number]): number {
  const R = 6371; // 地球の半径（km）
  const [lon1, lat1] = from;
  const [lon2, lat2] = to;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 度数からラジアンに変換
 */
function toRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

/**
 * 2地点間の移動に最適な交通手段を決定
 */
export function determineTransportType(from: Location, to: Location): 'air' | 'land' | 'sea' {
  const distance = calculateDistance(from.coordinates, to.coordinates);

  const isAirport = (loc: Location) => /空港|Airport|International Airport/i.test(loc.name);

  // 長距離(>=700km) は空路を選択。実際に空港が無い場合はルート作成側で最寄り空港を挿入します。
  if (distance >= 700) {
    return 'air';
  }

  // TODO: 海を跨ぐ判定が必要な場合はここで 'sea' を返す

  return 'land';
}

/**
 * 推定移動時間を計算（時間単位）
 */
export function estimateTransportDuration(from: Location, to: Location, transportType: 'air' | 'land' | 'sea'): number {
  const distance = calculateDistance(from.coordinates, to.coordinates);
  
  if (transportType === 'air') {
    // 飛行機: 平均速度800km/hと空港での3時間
    return distance / 800 + 3;
  } else if (transportType === 'land') {
    // 陸路: 平均速度80km/h
    return distance / 80;
  } else {
    // 海路: 平均速度30km/h
    return distance / 30;
  }
}

/**
 * メンバーごとのカラーコード生成
 */
export function generateMemberColors(memberCount: number): string[] {
  const colors = [
    '#FF5733', '#33FF57', '#3357FF', '#F033FF', '#FF33F0',
    '#33FFF0', '#F0FF33', '#5733FF', '#FF5733', '#33FF57'
  ];
  
  // メンバー数が用意した色数より多い場合はランダム生成
  if (memberCount > colors.length) {
    for (let i = colors.length; i < memberCount; i++) {
      const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16);
      colors.push(randomColor);
    }
  }
  
  return colors.slice(0, memberCount);
}

// ---------------- Airport Utilities ----------------
export const airports: Location[] = [
  { name: 'Tokyo Haneda Airport', country: 'Japan', region: 'Tokyo', coordinates: [139.784, 35.549] },
  { name: 'Narita International Airport', country: 'Japan', region: 'Chiba', coordinates: [140.392, 35.773] },
  { name: 'Kansai International Airport', country: 'Japan', region: 'Osaka', coordinates: [135.244, 34.436] },
  { name: 'New Chitose Airport', country: 'Japan', region: 'Hokkaido', coordinates: [141.681, 42.775] },
  { name: 'Fukuoka Airport', country: 'Japan', region: 'Fukuoka', coordinates: [130.451, 33.585] },
  { name: 'Los Angeles International Airport', country: 'USA', region: 'California', coordinates: [-118.408, 33.942] },
  { name: 'John F. Kennedy International Airport', country: 'USA', region: 'New York', coordinates: [-73.778, 40.641] },
  { name: 'London Heathrow Airport', country: 'UK', region: 'London', coordinates: [-0.454, 51.470] }
];

export const isAirport = (loc: Location): boolean => /空港|Airport/i.test(loc.name);

// 距離閾値( km ) 以内に空港が無ければ null
export function findNearestAirport(location: Location, maxDistanceKm = 300): Location | null {
  let nearest: Location | null = null;
  let minDist = Infinity;
  for (const ap of airports) {
    const d = calculateDistance(location.coordinates, ap.coordinates);
    if (d < minDist) {
      minDist = d;
      nearest = ap;
    }
  }
  if (minDist <= maxDistanceKm) return nearest;
  return null;
}
// --------------------------------------------------- 