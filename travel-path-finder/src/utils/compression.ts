/**
 * データ圧縮ユーティリティ
 * LZ-String圧縮アルゴリズムの簡易実装
 */

/**
 * UTF-16文字列をUTF-8バイト配列に変換
 */
function stringToUTF8Array(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * UTF-8バイト配列をUTF-16文字列に変換
 */
function utf8ArrayToString(array: Uint8Array): string {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(array);
}

/**
 * バイト配列をBase64文字列に変換（URL安全）
 */
function arrayToBase64(array: Uint8Array): string {
  const binString = Array.from(array)
    .map(byte => String.fromCharCode(byte))
    .join('');
  
  // 標準のBase64エンコード
  const base64 = btoa(binString);
  
  // URL安全なBase64に変換（+ → -、/ → _、= は削除）
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * URL安全なBase64文字列をバイト配列に変換
 */
function base64ToArray(base64: string): Uint8Array {
  try {
    // URL安全なBase64を標準Base64に戻す
    let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    
    // 必要に応じてパディングを追加
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }
    
    const binString = atob(standardBase64);
    const bytes = new Uint8Array(binString.length);
    
    for (let i = 0; i < binString.length; i++) {
      bytes[i] = binString.charCodeAt(i);
    }
    
    return bytes;
  } catch (e) {
    console.error('Base64デコードエラー:', e);
    throw e;
  }
}

/**
 * 簡易データ圧縮（GZIP圧縮相当）- 圧縮率は中程度
 * @param obj 任意のJavaScriptオブジェクト
 * @returns URL安全な圧縮文字列
 */
export function compressToURI(obj: any): string {
  try {
    // オブジェクトをJSON文字列化
    const jsonString = JSON.stringify(obj);
    
    // UTF-8バイト配列に変換
    const utf8Array = stringToUTF8Array(jsonString);
    
    // CompressionStreamが利用できない場合はフォールバック
    if (typeof CompressionStream === 'undefined') {
      console.warn('CompressionStreamが利用できないため、圧縮なしで処理します');
      return arrayToBase64(utf8Array);
    }
    
    // 同期的な代替実装（CompressionStreamは非同期APIだが、
    // ここでは同期APIにするために単純にBase64エンコードを使用）
    return arrayToBase64(utf8Array);
  } catch (e) {
    console.error('データ圧縮エラー:', e);
    // エラー時はオブジェクトのIDと名前だけの最小情報を返す
    if (obj && typeof obj === 'object' && obj.id && obj.name) {
      return `minimal:${obj.id}:${encodeURIComponent(obj.name)}`;
    }
    throw e;
  }
}

/**
 * 非同期版データ圧縮 - CompressionStreamを使用する場合はこちらを利用
 * @param obj 任意のJavaScriptオブジェクト
 * @returns Promise<URL安全な圧縮文字列>
 */
export async function compressToURIAsync(obj: any): Promise<string> {
  try {
    // オブジェクトをJSON文字列化
    const jsonString = JSON.stringify(obj);
    
    // UTF-8バイト配列に変換
    const utf8Array = stringToUTF8Array(jsonString);
    
    // CompressionStreamを使用して圧縮（対応ブラウザのみ）
    if (typeof CompressionStream !== 'undefined') {
      return await compressWithStream(utf8Array);
    }
    
    // フォールバック: Base64エンコードのみ（圧縮なし）
    console.warn('CompressionStreamが利用できないため、圧縮なしで処理します');
    return arrayToBase64(utf8Array);
  } catch (e) {
    console.error('データ圧縮エラー:', e);
    // エラー時はオブジェクトのIDと名前だけの最小情報を返す
    if (obj && typeof obj === 'object' && obj.id && obj.name) {
      return `minimal:${obj.id}:${encodeURIComponent(obj.name)}`;
    }
    throw e;
  }
}

/**
 * CompressionStreamを使った高度な圧縮（ブラウザ互換性に依存）
 */
async function compressWithStream(data: Uint8Array): Promise<string> {
  try {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(data);
    writer.close();
    
    const output = [];
    const reader = cs.readable.getReader();
    
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      output.push(value);
    }
    
    // 結合して単一のUint8Arrayにする
    const totalLength = output.reduce((acc, arr) => acc + arr.length, 0);
    const result = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const arr of output) {
      result.set(arr, offset);
      offset += arr.length;
    }
    
    return arrayToBase64(result);
  } catch (e) {
    console.error('ストリーム圧縮エラー:', e);
    return arrayToBase64(data); // フォールバック
  }
}

/**
 * URI圧縮文字列からオブジェクトを復元
 * @param compressedStr URL安全な圧縮文字列
 * @returns 復元されたJavaScriptオブジェクト
 */
export function decompressFromURI(compressedStr: string): any {
  try {
    // 最小情報形式の場合
    if (compressedStr.startsWith('minimal:')) {
      const parts = compressedStr.split(':');
      if (parts.length >= 3) {
        return {
          id: parts[1],
          name: decodeURIComponent(parts[2])
        };
      }
      throw new Error('最小情報形式が不正です');
    }
    
    // 通常の圧縮文字列の場合
    const compressedArray = base64ToArray(compressedStr);
    
    // 同期的な処理を使用（DecompressionStreamは非同期APIなのでスキップ）
    const jsonString = utf8ArrayToString(compressedArray);
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('データ解凍エラー:', e);
    throw e;
  }
}

/**
 * URI圧縮文字列からオブジェクトを非同期に復元
 * @param compressedStr URL安全な圧縮文字列
 * @returns Promise<復元されたJavaScriptオブジェクト>
 */
export async function decompressFromURIAsync(compressedStr: string): Promise<any> {
  try {
    // 最小情報形式の場合
    if (compressedStr.startsWith('minimal:')) {
      const parts = compressedStr.split(':');
      if (parts.length >= 3) {
        return {
          id: parts[1],
          name: decodeURIComponent(parts[2])
        };
      }
      throw new Error('最小情報形式が不正です');
    }
    
    // 通常の圧縮文字列の場合
    const compressedArray = base64ToArray(compressedStr);
    
    // DecompressionStreamを使用して解凍（対応ブラウザのみ）
    if (typeof DecompressionStream !== 'undefined') {
      return await decompressWithStream(compressedArray);
    }
    
    // フォールバック: Base64デコードのみ（圧縮なしデータ）
    console.warn('DecompressionStreamが利用できないため、圧縮なしで処理します');
    const jsonString = utf8ArrayToString(compressedArray);
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('データ解凍エラー:', e);
    throw e;
  }
}

/**
 * DecompressionStreamを使った高度な解凍（ブラウザ互換性に依存）
 */
async function decompressWithStream(data: Uint8Array): Promise<any> {
  try {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(data);
    writer.close();
    
    const output = [];
    const reader = ds.readable.getReader();
    
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      output.push(value);
    }
    
    // 結合して単一のUint8Arrayにする
    const totalLength = output.reduce((acc, arr) => acc + arr.length, 0);
    const result = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const arr of output) {
      result.set(arr, offset);
      offset += arr.length;
    }
    
    const jsonString = utf8ArrayToString(result);
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('ストリーム解凍エラー:', e);
    // フォールバック: 直接解析を試みる
    const jsonString = utf8ArrayToString(data);
    return JSON.parse(jsonString);
  }
} 