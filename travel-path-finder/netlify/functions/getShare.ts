import { Handler, HandlerEvent, HandlerResponse } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

/**
 * 共有データを取得するNetlify Function
 * GETリクエストで共有コードを受け取り、Blobsストアから該当データを返します。
 * パス例: /api/getShare/ABC123
 */
const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  // リクエスト情報のログ記録
  console.log(`REQUEST: ${event.httpMethod} ${event.path} from ${event.headers['client-ip'] || 'unknown'} [${event.headers['user-agent'] || 'unknown'}]`);

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

    // Netlify Blobsストアからデータを取得
    const store = getStore("trip-shares");
    
    // リトライ機構を設ける
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    
    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      try {
        console.log(`データ取得試行中 (${attempts}/${MAX_ATTEMPTS}): ${shareCode}`);
        const storedData = await store.get(shareCode);
        
        if (!storedData) {
          console.log(`共有コード「${shareCode}」に対応するデータがありません (試行: ${attempts}/${MAX_ATTEMPTS})`);
          
          // 最後の試行時だけエラーダイアグノスティックを実行
          if (attempts === MAX_ATTEMPTS) {
            try {
              const blobsList = await store.list();
              console.log(`利用可能なBlobs: ${blobsList.blobs.length}件`, 
                blobsList.blobs.map(b => ({ key: b.key })));
                
              // 類似コード検索
              const firstThreeChars = shareCode.substring(0, 3);
              const similarKeys = blobsList.blobs
                .map(b => b.key)
                .filter(key => key.includes(firstThreeChars));
                
              if (similarKeys.length > 0) {
                console.log(`類似コード検索結果 (${firstThreeChars}): ${similarKeys.join(', ')}`);
                
                // 最も類似したコードの内容を取得
                try {
                  const similarData = await store.get(similarKeys[0]);
                  if (similarData) {
                    console.log(`類似コード「${similarKeys[0]}」のデータが存在します (${similarData.length}バイト)`);
                    
                    // レスポンスにデバッグ情報として追加
                    return {
                      statusCode: 404,
                      body: JSON.stringify({ 
                        error: "Share data not found",
                        code: shareCode,
                        message: "指定された共有コードの旅行情報が見つかりませんでした。",
                        debug: {
                          requestedCode: shareCode,
                          similarCodes: similarKeys,
                          availableCodes: blobsList.blobs.map(b => b.key)
                        }
                      }),
                      headers: { 
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                      }
                    };
                  }
                } catch (err) {
                  console.warn(`類似コードのデータ取得に失敗:`, err);
                }
              }
            } catch (listError) {
              console.warn('Blobsリスト取得エラー:', listError);
            }
          }
          
          // 最後の試行でなければ再試行
          if (attempts < MAX_ATTEMPTS) {
            console.log(`データが見つからないため再試行します (${attempts}/${MAX_ATTEMPTS})`);
            await new Promise(resolve => setTimeout(resolve, 300 * attempts));
            continue;
          }
          
          // 最終試行後も見つからない場合は404を返す
          return {
            statusCode: 404,
            body: JSON.stringify({ 
              error: "Share data not found",
              code: shareCode,
              message: "指定された共有コードの旅行情報が見つかりませんでした。"
            }),
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          };
        }

        console.log(`共有コード「${shareCode}」の旅行データを正常に取得しました (${storedData.length} バイト)`);
        
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
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
          }
        };
      } catch (blobError) {
        console.error(`Blobsからのデータ取得中にエラーが発生 (${attempts}/${MAX_ATTEMPTS}):`, blobError);
        
        // 最終試行でなければ再試行
        if (attempts < MAX_ATTEMPTS) {
          console.log(`エラーが発生したため再試行します (${attempts}/${MAX_ATTEMPTS})...`);
          await new Promise(resolve => setTimeout(resolve, 500 * attempts));
        } else {
          throw blobError; // 最終試行でも失敗した場合は例外を投げる
        }
      }
    }
    
    // ここには到達しないはずだが、念のため例外を投げる
    throw new Error("すべての試行が失敗しました");
  } catch (error) {
    console.error("共有データ取得中にエラーが発生しました:", error);
    
    // エラーレスポンス
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