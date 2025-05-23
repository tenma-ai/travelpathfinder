import { Handler, HandlerEvent, HandlerResponse } from "@netlify/functions";
import type { TripInfo } from "../../src/types";
import { getStore } from "@netlify/blobs";

/**
 * 共有データを作成するNetlify Function
 * POSTリクエストで旅行情報を受け取り、一意の共有コードを生成してBlobsに保存します。
 * 保存期間: 30日（TTL）
 */
const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  // リクエスト情報のログ記録
  console.log(`REQUEST: ${event.httpMethod} ${event.path} from ${event.headers['client-ip'] || 'unknown'} [${event.headers['user-agent'] || 'unknown'}]`);
  
  // POSTリクエスト以外は拒否
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    };
  }

  try {
    // リクエストボディを取得
    const body = event.body;
    if (!body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing request body" }),
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      };
    }

    // JSON文字列をパース
    const tripInfo = JSON.parse(body) as TripInfo;
    
    // 必須項目の検証
    if (!tripInfo || !tripInfo.id || !tripInfo.name) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid trip data: missing required fields" }),
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      };
    }

    // 共有コードを生成
    const shareCode = generateShareCode(tripInfo);
    console.log(`旅行「${tripInfo.name}」の共有コード生成: ${shareCode}`);
    
    // 最終更新日時を設定
    const lastUpdated = new Date().toISOString();
    
    // 日付データを文字列に変換して確実にJSONシリアライズされるようにする
    const processedTripInfo = {
      ...tripInfo,
      startDate: tripInfo.startDate ? tripInfo.startDate.toISOString() : null,
      endDate: tripInfo.endDate ? tripInfo.endDate.toISOString() : null,
      shareCode,
      lastUpdated,
      version: "v1"
    };
    
    // 念のため、generatedItineraryが存在する場合に中の日付も全てシリアライズ
    if (processedTripInfo.generatedItinerary) {
      // 日付情報を文字列に変換（タイプエラーを避けるため直接クローン作成）
      const serializedLocations = processedTripInfo.generatedItinerary.locations.map(loc => {
        return {
          ...loc,
          arrivalDate: loc.arrivalDate instanceof Date 
            ? loc.arrivalDate.toISOString() 
            : typeof loc.arrivalDate === 'string'
              ? loc.arrivalDate
              : new Date(loc.arrivalDate).toISOString(),
          departureDate: loc.departureDate instanceof Date 
            ? loc.departureDate.toISOString() 
            : typeof loc.departureDate === 'string'
              ? loc.departureDate
              : new Date(loc.departureDate).toISOString()
        };
      });
      
      // 型を気にせず直接JSONシリアライズするためのオブジェクト
      const serializedItinerary = {
        ...processedTripInfo.generatedItinerary,
        locations: serializedLocations
      };
      
      // 型安全性はJSONシリアライズで失われるため代入
      processedTripInfo.generatedItinerary = serializedItinerary as any;
    }

    // Blobsストアを使用してデータを保存
    const store = getStore("trip-shares");
    
    // JSON文字列化して保存
    const jsonData = JSON.stringify(processedTripInfo);
    console.log(`共有コード「${shareCode}」で旅行データを保存します。データサイズ: ${jsonData.length}バイト`);
    
    // リトライ機構を設ける
    let success = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    
    while (!success && attempts < MAX_ATTEMPTS) {
      attempts++;
      try {
        // Blobsに保存
        await store.set(shareCode, jsonData);
        
        // 保存後に検証
        const verification = await store.get(shareCode);
        if (!verification) {
          console.error(`試行 ${attempts}/${MAX_ATTEMPTS}: データ保存の検証に失敗しました: ${shareCode}`);
          // 次の試行へ
        } else {
          console.log(`試行 ${attempts}/${MAX_ATTEMPTS}: 保存データの検証完了: ${shareCode} (サイズ: ${verification.length}バイト)`);
          success = true;
        }
      } catch (saveError) {
        console.error(`試行 ${attempts}/${MAX_ATTEMPTS}: データ保存中にエラーが発生: ${saveError}`);
        
        if (attempts < MAX_ATTEMPTS) {
          // リトライ前に待機
          console.log(`${200 * attempts}ms後に再試行します...`);
          await new Promise(resolve => setTimeout(resolve, 200 * attempts));
        }
      }
    }
    
    // すべての試行が失敗した場合
    if (!success) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: "Failed to save share data after multiple attempts",
          shareCode // それでも共有コードは返す
        }),
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      };
    }
    
    console.log(`旅行共有データを保存しました: ${shareCode}`);

    // 共有コードと共有URLを返す
    return {
      statusCode: 200,
      body: JSON.stringify({
        shareCode,
        message: "共有データを作成しました",
        dataSize: jsonData.length
      }),
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    };
  } catch (error) {
    console.error("共有データ作成中にエラーが発生しました:", error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    };
  }
};

/**
 * 短い共有コードを生成する
 * @param tripInfo 旅行情報
 * @returns 短い識別コード（8文字）
 */
function generateShareCode(tripInfo: TripInfo): string {
  // 簡易ハッシュ関数（文字列に基づいた短いコードを生成）
  const baseCodeInfo = tripInfo.id + tripInfo.name + new Date().toISOString();
  
  // ハッシュ計算
  let hash = 0;
  for (let i = 0; i < baseCodeInfo.length; i++) {
    const char = baseCodeInfo.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit整数に変換
  }
  
  // タイムスタンプを追加して一意性を高める
  const timestamp = Date.now().toString(36);
  
  // ランダムな文字を追加
  const randomPart = Math.random().toString(36).substr(2, 4);
  
  // 8文字のコードを生成（ハッシュ+タイムスタンプ+ランダム）
  // 全て大文字に変換
  return (Math.abs(hash).toString(36).substr(0, 3) + 
          timestamp.substr(-3) + 
          randomPart.substr(0, 2)).toUpperCase();
}

export { handler }; 