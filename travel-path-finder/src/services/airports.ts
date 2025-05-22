import type { Location } from '../types';

/**
 * 座標に最も近い空港を検索
 * @param coordinates 検索したい地点の座標 [longitude, latitude]
 * @returns 最も近い空港の情報
 */
export async function findNearestAirport(coordinates: [number, number]): Promise<Location | null> {
  try {
    // MAPBOX_ACCESS_TOKENが存在しない場合はフォールバックを使用
    const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!mapboxToken) {
      console.log('Mapbox APIキーがないため、フォールバック空港データを使用します');
      return useFallbackAirports(coordinates);
    }

    // Mapbox Search Box APIを使用して空港を検索
    // カテゴリ検索エンドポイントを使用
    const apiUrl = new URL('https://api.mapbox.com/search/searchbox/v1/category');
    
    // クエリパラメータの設定
    apiUrl.searchParams.append('access_token', mapboxToken);
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
      return useFallbackAirports(coordinates);
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
    return useFallbackAirports(coordinates);
  }
}

/**
 * フォールバック空港データから最も近い空港を返す
 */
function useFallbackAirports(coordinates: [number, number]): Location {
  // 主要空港をハードコードしたバックアップリスト
  const fallbackAirports = {
    // 日本の主要空港
    'japan': [
      { name: '東京国際空港（羽田空港）', coordinates: [139.7798, 35.5494] },
      { name: '成田国際空港', coordinates: [140.3929, 35.7719] },
      { name: '関西国際空港', coordinates: [135.2381, 34.4320] },
      { name: '中部国際空港（セントレア）', coordinates: [136.8049, 34.8583] },
      { name: '福岡空港', coordinates: [130.4514, 33.5902] },
      { name: '新千歳空港', coordinates: [141.6924, 42.7752] },
      { name: '那覇空港', coordinates: [127.6469, 26.1958] },
      { name: '広島空港', coordinates: [132.9194, 34.4361] },
      { name: '仙台空港', coordinates: [140.9178, 38.1397] },
      { name: '鹿児島空港', coordinates: [130.7189, 31.8034] },
      { name: '熊本空港', coordinates: [130.8558, 32.8371] },
      { name: '松山空港', coordinates: [132.6999, 33.8272] }
    ],
    // 北米の主要空港（アメリカ、カナダ、メキシコ）
    'north_america': [
      // アメリカ
      { name: 'John F. Kennedy International Airport', coordinates: [-73.7781, 40.6413] }, // ニューヨーク
      { name: 'LaGuardia Airport', coordinates: [-73.8740, 40.7769] }, // ニューヨーク
      { name: 'Newark Liberty International Airport', coordinates: [-74.1745, 40.6895] }, // ニューヨーク圏
      { name: 'Los Angeles International Airport', coordinates: [-118.4085, 33.9416] },
      { name: "O'Hare International Airport", coordinates: [-87.9073, 41.9742] }, // シカゴ
      { name: 'San Francisco International Airport', coordinates: [-122.3789, 37.6213] },
      { name: 'Miami International Airport', coordinates: [-80.2870, 25.7932] },
      { name: 'Dallas/Fort Worth International Airport', coordinates: [-97.0403, 32.8998] },
      { name: 'Denver International Airport', coordinates: [-104.6737, 39.8561] },
      { name: 'Seattle-Tacoma International Airport', coordinates: [-122.3088, 47.4502] },
      { name: 'Hartsfield-Jackson Atlanta International Airport', coordinates: [-84.4278, 33.6407] },
      { name: 'Boston Logan International Airport', coordinates: [-71.0022, 42.3656] },
      { name: 'McCarran International Airport', coordinates: [-115.1522, 36.0840] }, // ラスベガス
      { name: 'Phoenix Sky Harbor International Airport', coordinates: [-112.0113, 33.4352] },
      { name: 'Houston George Bush Intercontinental Airport', coordinates: [-95.3414, 29.9902] },
      { name: 'Detroit Metropolitan Wayne County Airport', coordinates: [-83.3554, 42.2162] },
      { name: 'Philadelphia International Airport', coordinates: [-75.2407, 39.8744] },
      { name: 'Minneapolis-Saint Paul International Airport', coordinates: [-93.2217, 44.8848] },
      // カナダ
      { name: 'Toronto Pearson International Airport', coordinates: [-79.6306, 43.6777] },
      { name: 'Vancouver International Airport', coordinates: [-123.1836, 49.1967] },
      { name: 'Montréal-Pierre Elliott Trudeau International Airport', coordinates: [-73.7408, 45.4706] },
      { name: 'Calgary International Airport', coordinates: [-114.0134, 51.1215] },
      // メキシコ
      { name: 'Mexico City International Airport', coordinates: [-99.0721, 19.4361] },
      { name: 'Cancún International Airport', coordinates: [-86.8743, 21.0365] }
    ],
    // 南米の主要空港
    'south_america': [
      { name: 'São Paulo-Guarulhos International Airport', coordinates: [-46.4731, -23.4356] }, // ブラジル
      { name: 'Rio de Janeiro/Galeão International Airport', coordinates: [-43.2437, -22.8099] }, // ブラジル
      { name: 'El Dorado International Airport', coordinates: [-74.1469, 4.7016] }, // ボゴタ、コロンビア
      { name: 'Jorge Chávez International Airport', coordinates: [-77.1143, -12.0219] }, // リマ、ペルー
      { name: 'Ministro Pistarini International Airport', coordinates: [-58.5356, -34.8222] }, // ブエノスアイレス、アルゼンチン
      { name: 'Comodoro Arturo Merino Benítez International Airport', coordinates: [-70.7858, -33.3931] }, // サンティアゴ、チリ
      { name: 'Simón Bolívar International Airport', coordinates: [-66.9907, 10.6012] } // カラカス、ベネズエラ
    ],
    // ヨーロッパの主要空港
    'europe': [
      // イギリス
      { name: 'Heathrow Airport', coordinates: [-0.4543, 51.4700] }, // ロンドン
      { name: 'Gatwick Airport', coordinates: [-0.1821, 51.1481] }, // ロンドン
      { name: 'Manchester Airport', coordinates: [-2.2750, 53.3537] },
      // フランス
      { name: 'Charles de Gaulle Airport', coordinates: [2.5479, 49.0097] }, // パリ
      { name: 'Orly Airport', coordinates: [2.3593, 48.7262] }, // パリ
      { name: "Nice Cote d'Azur Airport", coordinates: [7.2166, 43.6584] },
      // ドイツ
      { name: 'Frankfurt Airport', coordinates: [8.5622, 50.0379] },
      { name: 'Munich Airport', coordinates: [11.7861, 48.3537] },
      { name: 'Berlin Brandenburg Airport', coordinates: [13.5033, 52.3667] },
      // イタリア
      { name: 'Leonardo da Vinci–Fiumicino Airport', coordinates: [12.2388, 41.8003] }, // ローマ
      { name: 'Milan Malpensa Airport', coordinates: [8.7124, 45.6301] },
      // スペイン
      { name: 'Madrid–Barajas Airport', coordinates: [-3.5669, 40.4983] },
      { name: 'Barcelona–El Prat Airport', coordinates: [2.0785, 41.2971] },
      // オランダ
      { name: 'Amsterdam Airport Schiphol', coordinates: [4.7634, 52.3105] },
      // スイス
      { name: 'Zürich Airport', coordinates: [8.5583, 47.4647] },
      // ロシア
      { name: 'Sheremetyevo International Airport', coordinates: [37.4146, 55.9736] }, // モスクワ
      { name: 'Domodedovo International Airport', coordinates: [37.9062, 55.4103] }, // モスクワ
      // その他
      { name: 'Vienna International Airport', coordinates: [16.5638, 48.1102] }, // オーストリア
      { name: 'Brussels Airport', coordinates: [4.4836, 50.9010] }, // ベルギー
      { name: 'Copenhagen Airport', coordinates: [12.6561, 55.6180] }, // デンマーク
      { name: 'Dublin Airport', coordinates: [-6.2499, 53.4264] }, // アイルランド
      { name: 'Oslo Airport, Gardermoen', coordinates: [11.0838, 60.1976] }, // ノルウェー
      { name: 'Stockholm Arlanda Airport', coordinates: [17.9237, 59.6498] }, // スウェーデン
      { name: 'Helsinki Airport', coordinates: [24.9632, 60.3172] }, // フィンランド
      { name: 'Athens International Airport', coordinates: [23.9484, 37.9356] }, // ギリシャ
      { name: 'Istanbul Airport', coordinates: [28.8104, 41.2608] } // トルコ
    ],
    // アジアの主要空港（日本以外）
    'asia': [
      // 中国
      { name: 'Beijing Capital International Airport', coordinates: [116.5977, 40.0799] },
      { name: 'Shanghai Pudong International Airport', coordinates: [121.8086, 31.1443] },
      { name: 'Guangzhou Baiyun International Airport', coordinates: [113.2964, 23.3959] },
      { name: "Shenzhen Bao'an International Airport", coordinates: [113.8145, 22.6395] },
      { name: 'Chengdu Shuangliu International Airport', coordinates: [103.9475, 30.5785] },
      // 香港、マカオ、台湾
      { name: 'Hong Kong International Airport', coordinates: [113.9184, 22.3080] },
      { name: 'Macau International Airport', coordinates: [113.5919, 22.1496] },
      { name: 'Taiwan Taoyuan International Airport', coordinates: [121.2332, 25.0777] },
      // 韓国
      { name: 'Incheon International Airport', coordinates: [126.4505, 37.4602] }, // ソウル
      { name: 'Gimpo International Airport', coordinates: [126.7956, 37.5586] }, // ソウル
      // インド
      { name: 'Indira Gandhi International Airport', coordinates: [77.1006, 28.5561] }, // デリー
      { name: 'Chhatrapati Shivaji Maharaj International Airport', coordinates: [72.8691, 19.0896] }, // ムンバイ
      // シンガポール
      { name: 'Singapore Changi Airport', coordinates: [103.9915, 1.3644] },
      // タイ
      { name: 'Suvarnabhumi Airport', coordinates: [100.7501, 13.6900] }, // バンコク
      { name: 'Don Mueang International Airport', coordinates: [100.6069, 13.9125] }, // バンコク
      // マレーシア
      { name: 'Kuala Lumpur International Airport', coordinates: [101.7094, 2.7456] },
      // インドネシア
      { name: 'Soekarno–Hatta International Airport', coordinates: [106.6558, 6.1286] }, // ジャカルタ
      { name: 'Ngurah Rai International Airport', coordinates: [115.1667, -8.7481] }, // バリ
      // フィリピン
      { name: 'Ninoy Aquino International Airport', coordinates: [121.0198, 14.5086] }, // マニラ
      // ベトナム
      { name: 'Tan Son Nhat International Airport', coordinates: [106.6522, 10.8188] }, // ホーチミン
      { name: 'Noi Bai International Airport', coordinates: [105.8061, 21.2212] } // ハノイ
    ],
    // 中東の主要空港
    'middle_east': [
      { name: 'Dubai International Airport', coordinates: [55.3657, 25.2532] }, // UAE
      { name: 'Abu Dhabi International Airport', coordinates: [54.6508, 24.4330] }, // UAE
      { name: 'Hamad International Airport', coordinates: [51.6138, 25.2608] }, // ドーハ、カタール
      { name: 'King Abdulaziz International Airport', coordinates: [39.1542, 21.6805] }, // ジェッダ、サウジアラビア
      { name: 'King Khalid International Airport', coordinates: [46.6982, 24.9633] }, // リヤド、サウジアラビア
      { name: 'Ben Gurion Airport', coordinates: [34.8854, 32.0055] }, // テルアビブ、イスラエル
      { name: 'Queen Alia International Airport', coordinates: [35.9932, 31.7226] } // アンマン、ヨルダン
    ],
    // アフリカの主要空港
    'africa': [
      { name: 'Cairo International Airport', coordinates: [31.4056, 30.1219] }, // エジプト
      { name: 'O. R. Tambo International Airport', coordinates: [28.2376, -26.1367] }, // ヨハネスブルグ、南アフリカ
      { name: 'Cape Town International Airport', coordinates: [18.5974, -33.9717] }, // 南アフリカ
      { name: 'Mohammed V International Airport', coordinates: [-7.5899, 33.3675] }, // カサブランカ、モロッコ
      { name: 'Addis Ababa Bole International Airport', coordinates: [38.7993, 8.9778] }, // エチオピア
      { name: 'Murtala Muhammed International Airport', coordinates: [3.3213, 6.5774] }, // ラゴス、ナイジェリア
      { name: 'Jomo Kenyatta International Airport', coordinates: [36.9224, -1.3192] } // ナイロビ、ケニア
    ],
    // オセアニアの主要空港
    'oceania': [
      // オーストラリア
      { name: 'Sydney Airport', coordinates: [151.1772, -33.9399] },
      { name: 'Melbourne Airport', coordinates: [144.8430, -37.6690] },
      { name: 'Brisbane Airport', coordinates: [153.1175, -27.3942] },
      { name: 'Perth Airport', coordinates: [115.9670, -31.9402] },
      { name: 'Adelaide Airport', coordinates: [138.5305, -34.9450] },
      // ニュージーランド
      { name: 'Auckland Airport', coordinates: [174.7852, -37.0082] },
      { name: 'Wellington International Airport', coordinates: [174.8080, -41.3272] },
      { name: 'Christchurch International Airport', coordinates: [172.5369, -43.4864] },
      // その他太平洋諸島
      { name: 'Nadi International Airport', coordinates: [177.4438, -17.7556] }, // フィジー
      { name: "Faa'a International Airport", coordinates: [-149.6065, -17.5553] } // タヒチ、フランス領ポリネシア
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