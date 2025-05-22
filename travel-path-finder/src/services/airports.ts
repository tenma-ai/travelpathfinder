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
      // 北米の主要空港
      'north_america': [
        { name: 'John F. Kennedy International Airport', coordinates: [-73.7781, 40.6413] }, // ニューヨークJFK
        { name: 'LaGuardia Airport', coordinates: [-73.8740, 40.7769] }, // ニューヨークLGA
        { name: 'Newark Liberty International Airport', coordinates: [-74.1745, 40.6895] }, // ニュージャージー（ニューヨーク圏）
        { name: 'Los Angeles International Airport', coordinates: [-118.4085, 33.9416] },
        { name: "O'Hare International Airport", coordinates: [-87.9073, 41.9742] }, // シカゴ
        { name: 'San Francisco International Airport', coordinates: [-122.3789, 37.6213] },
        { name: 'Miami International Airport', coordinates: [-80.2870, 25.7932] },
        { name: 'Toronto Pearson International Airport', coordinates: [-79.6306, 43.6777] }
      ],
      // ヨーロッパの主要空港
      'europe': [
        { name: 'Heathrow Airport', coordinates: [-0.4543, 51.4700] }, // ロンドン
        { name: 'Charles de Gaulle Airport', coordinates: [2.5479, 49.0097] }, // パリ
        { name: 'Frankfurt Airport', coordinates: [8.5622, 50.0379] }, // フランクフルト
        { name: 'Amsterdam Airport Schiphol', coordinates: [4.7634, 52.3105] }, // アムステルダム
        { name: 'Madrid–Barajas Airport', coordinates: [-3.5669, 40.4983] } // マドリード
      ],
      // アジアの主要空港（日本以外）
      'asia': [
        { name: 'Beijing Capital International Airport', coordinates: [116.5977, 40.0799] },
        { name: 'Hong Kong International Airport', coordinates: [113.9184, 22.3080] },
        { name: 'Singapore Changi Airport', coordinates: [103.9915, 1.3644] },
        { name: 'Incheon International Airport', coordinates: [126.4505, 37.4602] }, // ソウル
        { name: 'Dubai International Airport', coordinates: [55.3657, 25.2532] }
      ],
      // オセアニアの主要空港
      'oceania': [
        { name: 'Sydney Airport', coordinates: [151.1772, 33.9399] },
        { name: 'Melbourne Airport', coordinates: [144.8430, -37.6690] }
      ]
    };
    
    // 最も近い空港を探す
    const findClosest = (airports: { name: string, coordinates: [number, number] }[]): Location => {
      let closest = airports[0];
      let minDistance = calculateDistance(coordinates, closest.coordinates);
      
      console.log(`空港検索情報: 地点[${coordinates}]から最寄りの空港を検索`);
      console.log(`- 候補1: ${closest.name} (距離: ${minDistance.toFixed(2)}km)`);
      
      for (let i = 1; i < airports.length; i++) {
        const distance = calculateDistance(coordinates, airports[i].coordinates);
        console.log(`- 候補${i+1}: ${airports[i].name} (距離: ${distance.toFixed(2)}km)`);
        
        if (distance < minDistance) {
          minDistance = distance;
          closest = airports[i];
        }
      }
      
      console.log(`→ 選択された空港: ${closest.name} (距離: ${minDistance.toFixed(2)}km)`);
      
      return {
        name: closest.name,
        coordinates: closest.coordinates
      };
    };
    
    // バックアップから最寄りの空港を返す
    const allAirports = [
      ...fallbackAirports.japan, 
      ...fallbackAirports.north_america,
      ...fallbackAirports.europe,
      ...fallbackAirports.asia,
      ...fallbackAirports.oceania
    ] as Array<{ name: string, coordinates: [number, number] }>;
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