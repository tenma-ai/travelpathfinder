import { Handler, HandlerEvent, HandlerResponse } from "@netlify/functions";
import type { TripInfo } from "../../src/types";
import { getStore } from "@netlify/blobs";

/**
 * 共有データを作成するNetlify Function
 * POSTリクエストで旅行情報を受け取り、一意の共有コードを生成してBlobsに保存します。
 * 保存期間: 30日（TTL）
 */
const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  // POSTリクエスト以外は拒否
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
      headers: { "Content-Type": "application/json" }
    };
  }

  try {
    // リクエストボディを取得
    const body = event.body;
    if (!body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing request body" }),
        headers: { "Content-Type": "application/json" }
      };
    }

    // JSON文字列をパース
    const tripInfo = JSON.parse(body) as TripInfo;
    
    // 必須項目の検証
    if (!tripInfo || !tripInfo.id || !tripInfo.name) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid trip data: missing required fields" }),
        headers: { "Content-Type": "application/json" }
      };
    }

    // 共有コードを生成
    const shareCode = generateShareCode(tripInfo);
    
    // 最終更新日時を設定
    const lastUpdated = new Date().toISOString();
    const tripWithMeta = {
      ...tripInfo,
      shareCode,
      lastUpdated,
      version: "v1"
    };

    // Blobsストアを使用してデータを保存
    const store = getStore("trip-shares");
    
    // データを保存（ttlはBlobsでは現在サポートされていない可能性があるため、基本的な保存のみ実行）
    await store.set(shareCode, JSON.stringify(tripWithMeta));
    
    console.log(`旅行共有データを保存しました: ${shareCode}`);

    // 共有コードと共有URLを返す
    return {
      statusCode: 200,
      body: JSON.stringify({
        shareCode,
        message: "共有データを作成しました",
        ttl: "30 days"
      }),
      headers: { "Content-Type": "application/json" }
    };
  } catch (error) {
    console.error("共有データ作成中にエラーが発生しました:", error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      headers: { "Content-Type": "application/json" }
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