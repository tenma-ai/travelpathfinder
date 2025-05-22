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
 * 陸路と空路のみを扱う
 * @param from 出発地または距離(km)
 * @param to 目的地（distanceを直接指定する場合は不要）
 */
export function determineTransportType(from: Location | number, to?: Location): 'air' | 'land' {
  // 距離が直接渡された場合
  if (typeof from === 'number') {
    const distance = from;
    
    // 700km以上の距離は強制的に空路に
    if (distance >= 700) {
      console.log(`  Determined as AIR due to long distance (${distance}km)`);
      return 'air';
    }
    
    // それ以外は陸路
    console.log(`  Determined as LAND transportation for distance ${distance}km`);
    return 'land';
  }
  
  // 従来の実装（2つのLocation間の判定）
  if (!to) {
    throw new Error('目的地が指定されていません');
  }
  
  const distance = calculateDistance(from.coordinates, to.coordinates);
  
  // 空港名を含む場所間の移動は空路とする
  const isFromAirport = from.name.includes('空港') || from.name.toLowerCase().includes('airport');
  const isToAirport = to.name.includes('空港') || to.name.toLowerCase().includes('airport');
  
  if (isFromAirport && isToAirport) {
    return 'air';
  }
  
  // デバッグ情報
  console.log(`Transport between: ${from.name}(${from.country}) -> ${to.name}(${to.country}), distance: ${distance}km`);
  
  // 海を跨ぐ場合は空路に（国や地域が異なり、かつ一定距離以上離れている場合）
  const isDifferentCountry = from.country !== to.country && from.country && to.country;
  const isDifferentRegion = from.region !== to.region && from.region && to.region;
  
  // 特定の国間の組み合わせで海を跨ぐと判断（例：日本と他の国など島国と大陸間）
  const islandCountries = ['日本', 'Japan', 'イギリス', 'UK', 'United Kingdom', 'アイルランド', 'Ireland', 
                          'フィリピン', 'Philippines', 'インドネシア', 'Indonesia', 'オーストラリア', 'Australia', 
                          'ニュージーランド', 'New Zealand', '台湾', 'Taiwan'];
  
  // 常に空路になるべき国のペア（例：中国と台湾）
  const alwaysAirCountryPairs = [
    ['中国', '台湾'],
    ['China', 'Taiwan'],
    ['中国', 'Taiwan'],
    ['China', '台湾']
  ];
  
  const isIslandCountry = (country?: string) => {
    if (!country) return false;
    return islandCountries.some(island => country.includes(island));
  };
  
  const isAlwaysAirCountryPair = () => {
    if (!from.country || !to.country) return false;
    
    // 両方向でチェック
    return alwaysAirCountryPairs.some(pair => 
      (from.country?.includes(pair[0]) && to.country?.includes(pair[1])) || 
      (from.country?.includes(pair[1]) && to.country?.includes(pair[0]))
    );
  };
  
  const hasSea = (isDifferentCountry && distance > 100) || 
                 (isDifferentRegion && distance > 300) || 
                 (isIslandCountry(from.country) && isDifferentCountry) || 
                 (isIslandCountry(to.country) && isDifferentCountry) ||
                 isAlwaysAirCountryPair();
  
  if (hasSea) {
    console.log(`  Determined as AIR due to sea crossing`);
    return 'air';
  }
  
  // 700km以上の距離は強制的に空路に
  if (distance >= 700) {
    console.log(`  Determined as AIR due to long distance (${distance}km)`);
    return 'air';
  }
  
  // 台湾・香港・マカオへの移動は常に空路に
  const specialRegions = ['台湾', 'Taiwan', '香港', 'Hong Kong', 'マカオ', 'Macao', 'Macau'];
  if ((from.country && specialRegions.some(region => from.country?.includes(region))) ||
      (to.country && specialRegions.some(region => to.country?.includes(region))) ||
      (from.name && specialRegions.some(region => from.name?.includes(region))) ||
      (to.name && specialRegions.some(region => to.name?.includes(region)))) {
    console.log(`  Determined as AIR due to special region (Taiwan/Hong Kong/Macao)`);
    return 'air';
  }
  
  // それ以外は陸路
  console.log(`  Determined as LAND transportation`);
  return 'land';
}

/**
 * 推定移動時間を計算（時間単位）
 * @param from 出発地または距離(km)
 * @param to 目的地または移動手段
 * @param transportType 移動手段（distanceを直接指定する場合は第2引数に指定）
 */
export function estimateTransportDuration(
  from: Location | number, 
  to: Location | 'air' | 'land', 
  transportType?: 'air' | 'land'
): number {
  // Case 1: 距離が直接指定された場合
  if (typeof from === 'number') {
    const distance = from;
    const mode = typeof to === 'string' ? to : 'land';
    
    if (mode === 'air') {
      // 飛行機: 平均速度800km/hと空港での待ち時間2時間
      // 短距離フライトに対する最小時間も設定
      return Math.max(distance / 800 + 2, 3);
    } else if (distance <= 50) {
      // 近距離陸路: 平均速度40km/h（都市内や近郊）
      return Math.max(distance / 40, 1);
    } else {
      // 長距離陸路: 平均速度60km/h（高速道路など）
      return Math.max(distance / 60, 1);
    }
  }
  
  // Case 2: 従来の実装（2つのLocation間の判定）
  if (typeof to === 'object' && transportType) {
    const distance = calculateDistance(from.coordinates, to.coordinates);
    
    if (transportType === 'air') {
      // 飛行機: 平均速度800km/hと空港での待ち時間2時間
      return Math.max(distance / 800 + 2, 3);
    } else if (distance <= 50) {
      // 近距離陸路: 平均速度40km/h
      return Math.max(distance / 40, 1);
    } else {
      // 長距離陸路: 平均速度60km/h
      return Math.max(distance / 60, 1);
    }
  }
  
  throw new Error('有効なパラメータが指定されていません');
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