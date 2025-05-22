import { Handler, HandlerEvent, HandlerResponse } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

/**
 * 共有データを取得するNetlify Function
 * GETリクエストで共有コードを受け取り、Blobsストアから該当データを返します。
 * パス例: /api/getShare/ABC123
 */
const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  // GETリクエスト以外は拒否
  if (event.httpMethod !== "GET") {
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
    // パスから共有コードを取得
    const pathParts = event.path.split("/");
    const shareCode = pathParts[pathParts.length - 1];
    
    if (!shareCode || shareCode === "getShare") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing share code" }),
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      };
    }

    console.log(`共有コード「${shareCode}」の旅行データを取得します`);

    // Blobsストアからデータを取得
    const store = getStore("trip-shares");
    
    // list メソッドを使用して利用可能なキーを表示（デバッグ用）
    try {
      const blobsList = await store.list();
      console.log(`利用可能なBlobs: ${blobsList.blobs.length}件`, 
        blobsList.blobs.slice(0, 10).map(b => b.key));
    } catch (listError) {
      console.warn('Blobsリスト取得エラー:', listError);
    }
    
    const storedData = await store.get(shareCode);
    
    if (!storedData) {
      console.log(`共有コード「${shareCode}」に対応するデータがありません`);
      
      // コードが見つからない場合、部分一致のキーを探す（デバッグ用）
      try {
        const blobsList = await store.list();
        const similarKeys = blobsList.blobs
          .map(b => b.key)
          .filter(key => key.includes(shareCode.substring(0, 4)));
        
        console.log(`類似コード: ${similarKeys.join(', ')}`);
      } catch (e) {
        console.warn('類似キー検索エラー:', e);
      }
      
      return {
        statusCode: 404,
        body: JSON.stringify({ 
          error: "Share data not found",
          code: shareCode,
          message: "指定された共有コードの旅行情報が見つかりませんでした。別のブラウザやデバイスから共有された場合、新しい共有リンクを生成してください。"
        }),
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      };
    }

    console.log(`共有コード「${shareCode}」の旅行データを正常に取得しました`);
    
    // JSONパースして検証（ログのみ）
    try {
      const parsed = JSON.parse(storedData);
      console.log(`データの検証: id=${parsed.id}, name=${parsed.name}, 場所数=${parsed.desiredLocations?.length || 0}`);
    } catch (parseError) {
      console.warn('データパースエラー:', parseError);
    }
    
    // データをそのまま返す（JSONオブジェクトに変換せずに文字列のまま）
    return {
      statusCode: 200,
      body: storedData,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", 
        "Cache-Control": "no-store, max-age=0"
      }
    };
  } catch (error) {
    console.error("共有データ取得中にエラーが発生しました:", error);
    
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

export { handler }; 