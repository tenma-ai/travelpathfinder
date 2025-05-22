import { Handler, HandlerEvent } from "@netlify/functions";

/**
 * 共有データを取得するNetlify Function
 * GETリクエストで共有コードを受け取り、KVストアから該当データを返します。
 * パス例: /api/getShare/ABC123
 */
const handler: Handler = async (event: HandlerEvent) => {
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

    // KVストアからデータを取得
    const KV = process.env.NETLIFY_KV_NAMESPACE;
    if (!KV) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "KV store not configured" }),
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      };
    }

    // @ts-ignore - APIの型定義がない場合の対応
    const store = Netlify.env.get(KV);
    const storedData = await store.get(shareCode);
    
    if (!storedData) {
      console.log(`共有コード「${shareCode}」に対応するデータがありません`);
      return {
        statusCode: 404,
        body: JSON.stringify({ 
          error: "Share data not found",
          code: shareCode
        }),
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      };
    }

    console.log(`共有コード「${shareCode}」の旅行データを正常に取得しました`);
    
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