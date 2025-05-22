import type { TripInfo, Itinerary } from '../types';

/**
 * OpenAI APIを使用して最適ルートを生成
 * @param tripInfo 旅行情報
 * @returns 最適化された旅程
 */
export async function generateOptimalRouteWithAI(tripInfo: TripInfo): Promise<Itinerary> {
  try {
    // Netlify Functions経由でAPIを呼び出す
    const response = await fetch('/.netlify/functions/generate-optimal-route', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tripInfo),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data as Itinerary;
  } catch (error) {
    console.error('Failed to generate route with AI:', error);
    throw error;
  }
}

/**
 * グループ旅行用のプロンプトを構築
 */
export function buildGroupPrompt(tripInfo: TripInfo): string {
  const { members, departureLocation, startDate, endDate, returnToDeparture, desiredLocations } = tripInfo;
  
  // メンバー名のリスト
  const memberNames = members.map(m => m.name).join(', ');
  
  // 希望地データの整形
  const desiredLocationsJson = desiredLocations.map(loc => {
    return {
      requesters: members.filter(m => loc.requesters.includes(m.id)).map(m => m.name),
      country: loc.location.country,
      name: loc.location.name,
      stayDuration: loc.stayDuration,
      priority: loc.priority
    };
  });

  // プロンプトの構築
  return `
あなたは複数人の希望を考慮した海外旅行の最適ルートを提案するAIアシスタントです。以下の条件に基づいて最適な旅行プランを作成してください:

全体情報:
- メンバーリスト: ${memberNames}
- 出発地: ${departureLocation.name}
- 出発日: ${startDate.toISOString().split('T')[0]}
- 帰国日: ${endDate ? endDate.toISOString().split('T')[0] : 'auto'}
- 出発地に戻る: ${returnToDeparture ? 'はい' : 'いいえ'}

各メンバーの希望地リスト:
${JSON.stringify(desiredLocationsJson, null, 2)}

以下の制約条件を考慮してください:
1. 全メンバーの希望をできるだけ平等に実現する
2. 指定された旅行期間内に収める
3. 移動効率を最大化する
4. 各希望地の最低滞在日数を尊重する

以下の形式でレスポンスしてください:
1. 採用された希望地リストと希望者
2. 日付ごとの詳細な旅程
3. 各移動区間の推奨移動手段と概算所要時間
4. 各メンバーの希望達成率
5. 特別な注意事項（時差、季節性、地理的特性など）

レスポンスはJSON形式で返してください。
  `;
}

/**
 * 一人旅用のプロンプトを構築
 */
export function buildSoloPrompt(tripInfo: TripInfo): string {
  const { departureLocation, startDate, endDate, returnToDeparture, desiredLocations } = tripInfo;
  
  // 希望地データの整形
  const desiredLocationsJson = desiredLocations.map(loc => {
    return {
      country: loc.location.country,
      name: loc.location.name,
      stayDuration: loc.stayDuration,
      priority: loc.priority
    };
  });

  // プロンプトの構築
  return `
あなたは海外旅行の最適ルートを提案するAIアシスタントです。以下の条件に基づいて最適な旅行プランを作成してください:

旅行情報:
- 出発地: ${departureLocation.name}
- 出発日: ${startDate.toISOString().split('T')[0]}
- 帰国日: ${endDate ? endDate.toISOString().split('T')[0] : 'auto'}
- 出発地に戻る: ${returnToDeparture ? 'はい' : 'いいえ'}

希望地リスト:
${JSON.stringify(desiredLocationsJson, null, 2)}

以下の制約条件を考慮してください:
1. 指定された旅行期間内に収める
2. 移動効率を最大化する
3. 各希望地の最低滞在日数を尊重する
4. 優先度の高い希望地を優先する

以下の形式でレスポンスしてください:
1. 採用された希望地リスト
2. 日付ごとの詳細な旅程
3. 各移動区間の推奨移動手段と概算所要時間
4. 特別な注意事項（時差、季節性、地理的特性など）

レスポンスはJSON形式で返してください。
  `;
} 