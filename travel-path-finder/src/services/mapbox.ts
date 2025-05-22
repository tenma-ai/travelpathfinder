import type { Location } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Mapbox APIキー
// 実際のプロジェクトでは環境変数から取得する
const MAPBOX_API_KEY = import.meta.env.VITE_MAPBOX_API_KEY || '';

// 定数
const JP_BBOX = '122.938,20.214,153.987,45.552'; // 日本全域
const TOKYO_LON_LAT = '139.767,35.681';          // 東京中心点（検索バイアス用）

// UI言語を取得（日本語環境なら'ja'、それ以外は'en'を優先）
const UI_LANG = navigator.language.startsWith('ja') ? 'ja' : 'en';
const LANGUAGE_PREFERENCE = `${UI_LANG},en,ja`;  // UI言語→英語→日本語の優先順位

// セッション管理（検索セッション中は同じトークンを使用）
const SESSION_TOKEN = uuidv4();

/**
 * 日本語文字が含まれているかチェック
 */
function hasJapaneseChars(text: string): boolean {
  return /[\u3000-\u30FF\u4E00-\u9FFF]/.test(text);
}

/**
 * クエリから検索タイプを推定
 * @param query 検索クエリ
 * @returns 推定される検索種別（'poi' または 'address'）
 */
function guessSearchKind(query: string): 'poi' | 'address' {
  // POIらしいキーワードを検出
  const poiPatterns = [
    /空港|Airport|エアポート/i,
    /駅|Station|ステーション/i,
    /港|Port|ハーバー/i,
    /病院|Hospital|ホスピタル/i,
    /大学|University/i,
    /ホテル|Hotel/i,
    /美術館|博物館|Museum/i,
    /公園|Park/i,
    /神社|寺|Temple|Shrine/i,
    /城|Castle/i,
    /タワー|Tower/i,
    /レストラン|Restaurant/i,
    /カフェ|Cafe/i,
    /ショップ|Shop|Store/i
  ];

  return poiPatterns.some(pattern => pattern.test(query)) ? 'poi' : 'address';
}

/**
 * 検索結果を整形する - シンプルで一貫性のある表示に
 */
function formatSearchResult(feature: any, type: 'poi' | 'address'): string {
  let name = '';
  let subText = '';
  let categoryIcon = '';
  
  if (type === 'poi') {
    // POI検索結果の整形（Search Box API）
    name = feature.name || '';
    
    // カテゴリアイコンを取得
    if (feature.poi_category) {
      categoryIcon = getCategoryIcon(feature.poi_category);
    } else if (feature.metadata?.category?.id) {
      categoryIcon = getCategoryIcon(feature.metadata.category.id);
    }
    
    // 市区町村と都道府県のみ抽出（詳細住所は表示しない）
    if (feature.context) {
      const locality = feature.context.place?.name || '';
      const region = feature.context.region?.name || '';
      const country = feature.context.country?.name || '';
      
      // 国内の場合は市区町村、都道府県のみ
      // 海外の場合は都市名、国名
      if (country && country !== '日本' && country !== 'Japan') {
        subText = [locality, country].filter(Boolean).join(', ');
      } else {
        subText = [locality, region].filter(Boolean).join(', ');
      }
    } else if (feature.place_formatted) {
      // place_formattedが利用可能ならそれを使用
      subText = feature.place_formatted;
    }
  } else {
    // 住所検索結果の整形（Geocoding API）
    if (feature.properties) {
      // Geocoding v6 APIの場合
      name = feature.properties.name || '';
      const context = feature.properties.context || {};
      const place = context.place?.name || '';
      const region = context.region?.name || '';
      const country = context.country?.name || '';
      
      // 国内/海外で表示形式を変える
      if (country && country !== '日本' && country !== 'Japan') {
        subText = [place, country].filter(Boolean).join(', ');
      } else {
        subText = [place, region].filter(Boolean).join(', ');
      }
    } else {
      // Geocoding v5 APIの場合（フォールバック）
      name = feature.text || '';
      const placeContext = feature.context?.find((ctx: any) => ctx.id?.startsWith('place'));
      const regionContext = feature.context?.find((ctx: any) => ctx.id?.startsWith('region'));
      const countryContext = feature.context?.find((ctx: any) => ctx.id?.startsWith('country'));
      
      const place = placeContext?.text || '';
      const region = regionContext?.text || '';
      const country = countryContext?.text || '';
      
      if (country && country !== '日本' && country !== 'Japan') {
        subText = [place, country].filter(Boolean).join(', ');
      } else {
        subText = [place, region].filter(Boolean).join(', ');
      }
    }
  }
  
  // カテゴリアイコン + 名前 と サブテキストを2行で返す
  return subText ? `${categoryIcon} ${name}\n${subText}` : `${categoryIcon} ${name}`;
}

/**
 * POIカテゴリからアイコンを取得
 */
function getCategoryIcon(category: string): string {
  const categoryIcons: Record<string, string> = {
    'airport': '✈️',
    'railway': '🚉',
    'train_station': '🚉',
    'bus_station': '🚌',
    'harbor': '⚓',
    'ferry_terminal': '⛴️',
    'hotel': '🏨',
    'lodging': '🏨',
    'restaurant': '🍽️',
    'cafe': '☕',
    'food': '🍴',
    'museum': '🏛️',
    'art_gallery': '🖼️',
    'landmark': '🗿',
    'monument': '🗿',
    'park': '🌳',
    'garden': '🌷',
    'zoo': '🦁',
    'aquarium': '🐠',
    'shopping_mall': '🛍️',
    'shop': '🛒',
    'store': '🏪',
    'hospital': '🏥',
    'pharmacy': '💊',
    'university': '🎓',
    'school': '🏫',
    'sports': '⚽',
    'entertainment': '🎭',
    'cinema': '🎬',
    'theater': '🎭',
    'temple': '⛩️',
    'shrine': '🛕',
    'castle': '🏰',
    'tower': '🗼',
    'mountain': '⛰️',
    'beach': '🏖️',
    'post_office': '📮',
    'police': '🚓',
    'bank': '🏦'
  };
  
  // カテゴリが存在すればアイコンを返す、なければ空文字
  return categoryIcons[category] || '';
}

/**
 * 地名から位置情報を取得
 * @param query 検索クエリ（地名/施設名）
 * @returns 位置情報
 */
export async function geocodeLocation(query: string): Promise<Location | null> {
  try {
    console.log(`位置情報検索: "${query}"`);
    
    if (!query || query.trim().length < 2) {
      return null;
    }
    
    // POI検索を試み、失敗したら住所検索にフォールバック
    try {
      const poiLocation = await searchPOILocation(query);
      if (poiLocation) {
        return poiLocation;
      }
    } catch (error) {
      console.log('POI検索失敗、住所検索にフォールバック:', error);
    }
    
    return await searchAddressLocation(query);
  } catch (error) {
    console.error('位置情報検索に失敗しました:', error);
    return null;
  }
}

/**
 * POI検索（施設・観光地）- Search Box API使用
 */
async function searchPOILocation(query: string): Promise<Location | null> {
  try {
    const isJapanese = hasJapaneseChars(query);
    
    // Search Box Suggest API - POI検索用URL構築
    const suggestUrl = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');
    suggestUrl.searchParams.set('q', query);
    suggestUrl.searchParams.set('types', 'poi,place');
    suggestUrl.searchParams.set('language', LANGUAGE_PREFERENCE);
    suggestUrl.searchParams.set('limit', '1');
    suggestUrl.searchParams.set('session_token', SESSION_TOKEN);
    suggestUrl.searchParams.set('access_token', MAPBOX_API_KEY);
    
    // 日本語入力の場合のみ日本に絞り込む
    if (isJapanese) {
      suggestUrl.searchParams.set('country', 'JP');
      suggestUrl.searchParams.set('proximity', TOKYO_LON_LAT);
    }
    
    const suggestResponse = await fetch(suggestUrl.toString());
    
    if (!suggestResponse.ok) {
      throw new Error(`Search Box API error: ${suggestResponse.status}`);
    }
    
    const suggestData = await suggestResponse.json();
    console.log('POI検索結果(suggest):', suggestData);
    
    if (suggestData.suggestions && suggestData.suggestions.length > 0) {
      const suggestion = suggestData.suggestions[0];
      
      // Retrieve APIで詳細情報を取得
      const retrieveUrl = new URL(`https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}`);
      retrieveUrl.searchParams.set('session_token', SESSION_TOKEN);
      retrieveUrl.searchParams.set('language', LANGUAGE_PREFERENCE);
      retrieveUrl.searchParams.set('access_token', MAPBOX_API_KEY);
      
      const retrieveResponse = await fetch(retrieveUrl.toString());
      
      if (!retrieveResponse.ok) {
        throw new Error(`Retrieve API error: ${retrieveResponse.status}`);
      }
      
      const retrieveData = await retrieveResponse.json();
      console.log('POI詳細情報(retrieve):', retrieveData);
      
      if (retrieveData.features && retrieveData.features.length > 0) {
        const feature = retrieveData.features[0];
        const [longitude, latitude] = feature.geometry.coordinates;
        
        // 名前と地域情報を抽出
        let name = feature.properties.name;
        let country = feature.properties.context?.country?.name;
        let region = feature.properties.context?.region?.name;
        
        return {
          name,
          country,
          region,
          coordinates: [longitude, latitude]
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('POI検索に失敗しました:', error);
    return null;
  }
}

/**
 * 住所検索 - Geocoding API v6使用
 */
async function searchAddressLocation(query: string): Promise<Location | null> {
  try {
    const isJapanese = hasJapaneseChars(query);
    
    // Geocoding API v6 - 住所検索用URL構築
    const geocodeUrl = new URL('https://api.mapbox.com/search/geocode/v6/forward');
    geocodeUrl.searchParams.set('q', query);
    geocodeUrl.searchParams.set('types', 'address,street,place,region');
    geocodeUrl.searchParams.set('language', LANGUAGE_PREFERENCE);
    geocodeUrl.searchParams.set('limit', '1');
    geocodeUrl.searchParams.set('fuzzyMatch', 'true');
    geocodeUrl.searchParams.set('access_token', MAPBOX_API_KEY);
    
    // 日本語入力の場合のみ日本に絞り込む
    if (isJapanese) {
      geocodeUrl.searchParams.set('country', 'JP');
      geocodeUrl.searchParams.set('proximity', TOKYO_LON_LAT);
    }
    
    const response = await fetch(geocodeUrl.toString());
    
    if (!response.ok) {
      // APIv6がエラーの場合はv5にフォールバック
      return await searchAddressLocationV5(query);
    }
    
    const data = await response.json();
    console.log('住所検索結果(v6):', data);
    
    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      const [longitude, latitude] = feature.geometry.coordinates;
      
      // 名前と地域情報を抽出
      let name = feature.properties.name;
      let context = feature.properties.context || {};
      let country = context.country?.name;
      let region = context.region?.name;
      
      return {
        name,
        country,
        region,
        coordinates: [longitude, latitude]
      };
    }
    
    // v6で見つからなかった場合はv5にフォールバック
    return await searchAddressLocationV5(query);
  } catch (error) {
    console.error('Geocoding APIv6 検索に失敗しました:', error);
    // エラー時はv5にフォールバック
    return await searchAddressLocationV5(query);
  }
}

/**
 * 従来のGeocoding API v5を使用した検索（フォールバック用）
 */
async function searchAddressLocationV5(query: string): Promise<Location | null> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const isJapanese = hasJapaneseChars(query);
    
    // Geocoding API v5 URL構築
    const url = new URL('https://api.mapbox.com/geocoding/v5/mapbox.places/'+encodedQuery+'.json');
    url.searchParams.set('access_token', MAPBOX_API_KEY);
    url.searchParams.set('limit', '1');
    url.searchParams.set('language', LANGUAGE_PREFERENCE);
    url.searchParams.set('types', 'place,region,locality,district,address,neighborhood,postcode,country');
    url.searchParams.set('fuzzy_match', 'true');
    
    // 日本語入力の場合のみ日本に絞り込む
    if (isJapanese) {
      url.searchParams.set('country', 'jp');
      url.searchParams.set('proximity', TOKYO_LON_LAT);
    }
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`Geocoding API v5 error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('住所検索結果(v5-フォールバック):', data);
    
    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      const [longitude, latitude] = feature.center;
      
      // 国や地域の情報を抽出
      const countryContext = feature.context?.find((ctx: any) => ctx.id.startsWith('country'));
      const regionContext = feature.context?.find((ctx: any) => ctx.id.startsWith('region'));
      
      // 適切な名前表示を選択
      let name = feature.text;
      let country = countryContext?.text;
      let region = regionContext?.text;
      
      return {
        name,
        country,
        region,
        coordinates: [longitude, latitude]
      };
    }
    
    return null;
  } catch (error) {
    console.error('Geocoding APIv5 検索に失敗しました:', error);
    return null;
  }
}

/**
 * 位置名の自動補完候補を取得
 * @param query 検索クエリ（部分的な地名/施設名）
 * @returns 補完候補のリスト
 */
export async function getLocationSuggestions(query: string): Promise<string[]> {
  try {
    // 2文字以上のクエリでない場合は空の配列を返す
    if (!query || query.trim().length < 2) {
      return [];
    }
    
    console.log(`補完候補検索: "${query}"`);
    
    // POI検索を最初に試み、結果が少ない場合は住所検索も行う
    const poiSuggestions = await getPOISuggestions(query);
    
    if (poiSuggestions.length >= 3) {
      return poiSuggestions;
    }
    
    // POI検索で十分な結果が得られなかった場合は住所検索も併用
    const addressSuggestions = await getAddressSuggestions(query);
    
    // POI結果と住所結果を合わせて、重複を排除
    const combinedSuggestions = [...poiSuggestions, ...addressSuggestions];
    const uniqueSuggestions = Array.from(new Set(combinedSuggestions));
    
    // 最大6件まで返す
    return uniqueSuggestions.slice(0, 6);
  } catch (error) {
    console.error('補完候補の取得に失敗しました:', error);
    return [];
  }
}

/**
 * POI(施設・観光地)の候補を取得 - Search Box API
 */
async function getPOISuggestions(query: string): Promise<string[]> {
  try {
    const isJapanese = hasJapaneseChars(query);
    
    // Search Box Suggest API - URL構築
    const suggestUrl = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');
    suggestUrl.searchParams.set('q', query);
    suggestUrl.searchParams.set('types', 'poi,place');
    suggestUrl.searchParams.set('language', LANGUAGE_PREFERENCE);
    suggestUrl.searchParams.set('limit', '6');
    suggestUrl.searchParams.set('session_token', SESSION_TOKEN);
    suggestUrl.searchParams.set('access_token', MAPBOX_API_KEY);
    
    // 日本語入力の場合のみ日本に絞り込む
    if (isJapanese) {
      suggestUrl.searchParams.set('country', 'JP');
      suggestUrl.searchParams.set('proximity', TOKYO_LON_LAT);
    }
    
    const response = await fetch(suggestUrl.toString());
    
    if (!response.ok) {
      throw new Error(`Search Box API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('POI候補検索結果:', data);
    
    if (data.suggestions && data.suggestions.length > 0) {
      // 候補結果を整形
      return data.suggestions.map((suggestion: any) => 
        formatSearchResult(suggestion, 'poi'));
    }
    
    return [];
  } catch (error) {
    console.error('POI候補検索に失敗しました:', error);
    return [];
  }
}

/**
 * 住所の候補を取得 - Geocoding API v6
 */
async function getAddressSuggestions(query: string): Promise<string[]> {
  try {
    const isJapanese = hasJapaneseChars(query);
    
    // Geocoding API v6 - URL構築
    const geocodeUrl = new URL('https://api.mapbox.com/search/geocode/v6/forward');
    geocodeUrl.searchParams.set('q', query);
    geocodeUrl.searchParams.set('types', 'address,street,place,region');
    geocodeUrl.searchParams.set('language', LANGUAGE_PREFERENCE);
    geocodeUrl.searchParams.set('limit', '6');
    geocodeUrl.searchParams.set('fuzzyMatch', 'true');
    geocodeUrl.searchParams.set('autocomplete', 'true');
    geocodeUrl.searchParams.set('access_token', MAPBOX_API_KEY);
    
    // 日本語入力の場合のみ日本に絞り込む
    if (isJapanese) {
      geocodeUrl.searchParams.set('country', 'JP');
      geocodeUrl.searchParams.set('proximity', TOKYO_LON_LAT);
    }
    
    const response = await fetch(geocodeUrl.toString());
    
    if (!response.ok) {
      // APIv6がエラーの場合はv5にフォールバック
      return await getAddressSuggestionsV5(query);
    }
    
    const data = await response.json();
    console.log('住所候補検索結果(v6):', data);
    
    if (data.features && data.features.length > 0) {
      // 候補結果を整形
      return data.features.map((feature: any) => 
        formatSearchResult(feature, 'address'));
    }
    
    // v6で見つからなかった場合はv5にフォールバック
    return await getAddressSuggestionsV5(query);
  } catch (error) {
    console.error('住所候補検索に失敗しました(v6):', error);
    // エラー時はv5にフォールバック
    return await getAddressSuggestionsV5(query);
  }
}

/**
 * 従来のGeocoding API v5を使った住所候補検索（フォールバック用）
 */
async function getAddressSuggestionsV5(query: string): Promise<string[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const isJapanese = hasJapaneseChars(query);
    
    // Geocoding API v5 - URL構築
    const url = new URL('https://api.mapbox.com/geocoding/v5/mapbox.places/'+encodedQuery+'.json');
    url.searchParams.set('access_token', MAPBOX_API_KEY);
    url.searchParams.set('types', 'place,region,locality,district,address,neighborhood,country');
    url.searchParams.set('limit', '6');
    url.searchParams.set('language', LANGUAGE_PREFERENCE);
    url.searchParams.set('autocomplete', 'true');
    url.searchParams.set('fuzzy_match', 'true');
    
    // 日本語入力の場合のみ日本に絞り込む
    if (isJapanese) {
      url.searchParams.set('country', 'jp');
      url.searchParams.set('proximity', TOKYO_LON_LAT);
    }
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`Geocoding API v5 error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('住所候補検索結果(v5-フォールバック):', data);
    
    if (data.features && data.features.length > 0) {
      // 候補結果を整形
      return data.features.map((feature: any) => 
        formatSearchResult(feature, 'address'));
    }
    
    return [];
  } catch (error) {
    console.error('住所候補検索に失敗しました(v5):', error);
    return [];
  }
} 