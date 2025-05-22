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
  
  // 簡易判定ロジック
  if (distance >= 700) {
    return 'air';
  }
  
  // 海を挟む場合の判定はより複雑な処理が必要
  // 実際には地理的特性を考慮する必要がある
  
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