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
    apiUrl.searchParams.append('limit', '1'); // 最も近い1つだけを取得
    apiUrl.searchParams.append('proximity', `${coordinates[0]},${coordinates[1]}`); // 近接性検索
    apiUrl.searchParams.append('language', 'ja'); // 日本語結果優先
    apiUrl.searchParams.append('category', 'airport'); // 空港カテゴリで検索

    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`空港検索に失敗しました: ${response.statusText}`);
    }

    const data = await response.json();
    
    // 結果が見つからない場合
    if (!data.features || data.features.length === 0) {
      console.log('最寄りの空港が見つかりませんでした');
      return null;
    }

    // 最初の結果（最も近い空港）を取得
    const airport = data.features[0];
    
    // Location型に変換
    return {
      name: airport.properties.name,
      country: airport.properties.context?.country?.name,
      region: airport.properties.context?.region?.name,
      coordinates: [airport.geometry.coordinates[0], airport.geometry.coordinates[1]]
    };
  } catch (error) {
    console.error('空港検索エラー:', error);
    return null;
  }
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
  
  // 経由地を含めたルートを返す
  return [from, departureAirport, arrivalAirport, to];
} 