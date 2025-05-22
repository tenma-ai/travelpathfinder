import type { Location } from '../types';

/**
 * 座標に最も近い空港を検索
 * @param coordinates 検索したい地点の座標 [longitude, latitude]
 * @returns 最も近い空港の情報
 */
export async function findNearestAirport(coordinates: [number, number]): Promise<Location | null> {
  try {
    // Mapbox Search Box APIを使用して空港を検索
    // カテゴリ検索エンドポイントを使用
    const apiUrl = new URL('https://api.mapbox.com/search/searchbox/v1/category');
    
    // クエリパラメータの設定
    apiUrl.searchParams.append('access_token', import.meta.env.VITE_MAPBOX_ACCESS_TOKEN);
    apiUrl.searchParams.append('limit', '5'); // 最も近い5つの空港を取得して選択肢を増やす
    apiUrl.searchParams.append('proximity', `${coordinates[0]},${coordinates[1]}`); // 近接性検索
    apiUrl.searchParams.append('language', 'ja'); // 日本語結果優先
    apiUrl.searchParams.append('category', 'airport'); // 空港カテゴリで検索
    apiUrl.searchParams.append('types', 'poi'); // POIタイプのみを検索
    apiUrl.searchParams.append('poi_category', 'airport,aerodrome'); // 空港とエアロドロームを対象に

    console.log('空港検索URL:', apiUrl.toString());
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`空港検索に失敗しました: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('空港検索結果:', data);
    
    // 結果が見つからない場合
    if (!data.features || data.features.length === 0) {
      console.log('最寄りの空港が見つかりませんでした');
      return null;
    }

    // 国際空港や主要空港を優先（名前に「国際」や「International」を含む空港を優先）
    const airports = data.features;
    const mainAirport = airports.find((airport: any) => 
      airport.properties.name.includes('国際') || 
      airport.properties.name.toLowerCase().includes('international') ||
      airport.properties.name.includes('空港') ||
      airport.properties.name.toLowerCase().includes('airport')
    ) || airports[0];  // 見つからない場合は最初の結果を使用

    // Location型に変換
    return {
      name: mainAirport.properties.name,
      country: mainAirport.properties.context?.country?.name,
      region: mainAirport.properties.context?.region?.name,
      coordinates: [
        mainAirport.geometry.coordinates[0], 
        mainAirport.geometry.coordinates[1]
      ]
    };
  } catch (error) {
    console.error('空港検索エラー:', error);
    
    // 主要空港をハードコードしたバックアップリスト
    const fallbackAirports = {
      // 日本の主要空港
      'japan': [
        { name: '東京国際空港（羽田空港）', coordinates: [139.7798, 35.5494] },
        { name: '成田国際空港', coordinates: [140.3929, 35.7719] },
        { name: '関西国際空港', coordinates: [135.2381, 34.4320] },
        { name: '中部国際空港（セントレア）', coordinates: [136.8049, 34.8583] },
        { name: '福岡空港', coordinates: [130.4514, 33.5902] }
      ],
      // 世界の主要空港
      'international': [
        { name: 'Heathrow Airport', coordinates: [-0.4543, 51.4700] },
        { name: 'Charles de Gaulle Airport', coordinates: [2.5479, 49.0097] },
        { name: 'Los Angeles International Airport', coordinates: [-118.4085, 33.9416] },
        { name: 'Beijing Capital International Airport', coordinates: [116.5977, 40.0799] },
        { name: 'Dubai International Airport', coordinates: [55.3657, 25.2532] },
        { name: 'Sydney Airport', coordinates: [151.1772, 33.9399] }
      ]
    };
    
    // 最も近い空港を探す
    const findClosest = (airports: { name: string, coordinates: [number, number] }[]): Location => {
      let closest = airports[0];
      let minDistance = calculateDistance(coordinates, closest.coordinates);
      
      for (let i = 1; i < airports.length; i++) {
        const distance = calculateDistance(coordinates, airports[i].coordinates);
        if (distance < minDistance) {
          minDistance = distance;
          closest = airports[i];
        }
      }
      
      return {
        name: closest.name,
        coordinates: closest.coordinates
      };
    };
    
    // バックアップから最寄りの空港を返す
    const allAirports = [...fallbackAirports.japan, ...fallbackAirports.international] as Array<{ name: string, coordinates: [number, number] }>;
    return findClosest(allAirports);
  }
}

// 2点間の距離をハバーサイン公式で計算（km単位）
function calculateDistance(from: [number, number], to: [number, number]): number {
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

// 度数からラジアンに変換
function toRad(degrees: number): number {
  return degrees * Math.PI / 180;
}

/**
 * 地点間の空路ルートを作成（最寄りの空港経由）
 * @param from 出発地
 * @param to 目的地
 * @returns 空港経由のルートの配列 [出発地→出発空港, 出発空港→到着空港, 到着空港→目的地]
 */
export async function createAirRouteWithAirports(from: Location, to: Location): Promise<Location[]> {
  // 出発地と目的地の最寄り空港を検索
  const departureAirport = await findNearestAirport(from.coordinates);
  const arrivalAirport = await findNearestAirport(to.coordinates);
  
  if (!departureAirport || !arrivalAirport) {
    // 空港が見つからない場合は直行ルートを返す
    console.warn('空港が見つからないため、直行ルートを使用します');
    return [from, to];
  }
  
  // 空港名に「空港」が含まれていない場合は追加
  if (!departureAirport.name.includes('空港') && !departureAirport.name.toLowerCase().includes('airport')) {
    departureAirport.name = `${departureAirport.name}空港`;
  }
  
  if (!arrivalAirport.name.includes('空港') && !arrivalAirport.name.toLowerCase().includes('airport')) {
    arrivalAirport.name = `${arrivalAirport.name}空港`;
  }
  
  console.log('空路ルート:', {
    from: from.name,
    departureAirport: departureAirport.name,
    arrivalAirport: arrivalAirport.name,
    to: to.name
  });
  
  // 経由地を含めたルートを返す
  return [from, departureAirport, arrivalAirport, to];
} 