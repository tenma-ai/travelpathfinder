import type { Location } from '../types';

// HERE API キー（後で実際のキーに置き換えてください）
const HERE_API_KEY = import.meta.env.VITE_HERE_API_KEY || 'aaa';

// Base URL for HERE Search API (Discover endpoint)
const HERE_BASE_URL = 'https://discover.search.hereapi.com/v1';

// UI 言語優先度（ブラウザ言語→英語→日本語）
const UI_LANG = navigator.language.startsWith('ja') ? 'ja' : 'en'; // Discover API は単一言語コードのみ受け取る
const LANGUAGE_PARAM = UI_LANG; // 'ja' もしくは 'en'

/**
 * HERE Discover API への共通リクエスト関数
 */
async function hereDiscover(query: string, limit = 6): Promise<any[]> {
  const url = new URL(`${HERE_BASE_URL}/discover`);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', limit.toString());
  url.searchParams.set('at', '0,0'); // グローバル検索。精度を上げたい場合は実際の位置座標を指定
  url.searchParams.set('lang', LANGUAGE_PARAM);
  url.searchParams.set('apiKey', HERE_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.error('HERE Discover API error:', response.status, await response.text());
    return [];
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * 文字列クエリから Location を取得（1件）
 */
export async function geocodeLocation(query: string): Promise<Location | null> {
  if (!query || query.trim().length < 2) return null;

  const items = await hereDiscover(query, 1);
  if (items.length === 0) return null;

  const item = items[0];
  return {
    name: item.title,
    country: item.address?.countryName,
    region: item.address?.state,
    coordinates: [item.position.lng, item.position.lat]
  };
}

/**
 * 入力候補を最大 6 件返す
 */
export async function getLocationSuggestions(query: string): Promise<string[]> {
  if (!query || query.trim().length < 2) return [];

  const items = await hereDiscover(query, 6);

  // 表示ラベル生成: "タイトル\n都市, 国" の 2 行表示にする
  return items.map(item => {
    const locality = item.address?.city || item.address?.district || '';
    const region = item.address?.state || '';
    const country = item.address?.countryName || '';
    const sub = [locality || region, country].filter(Boolean).join(', ');
    return sub ? `${item.title}\n${sub}` : item.title;
  });
} 