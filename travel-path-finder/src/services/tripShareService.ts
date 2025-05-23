import { v4 as uuidv4 } from 'uuid';
import type { TripInfo, SharedTripInfo, Participant } from '../types';
// 直接リンク機能を削除するため、compression関連のインポートを削除
// import { compressToURI, decompressFromURI } from '../utils/compression';

// ローカルストレージのキー
const SHARED_TRIPS_KEY = 'travelPathFinder_sharedTrips';

// APIエンドポイント
const API_BASE_URL = '/.netlify/functions';

// --- Base64エンコード/デコードユーティリティ ---
// 互換性のために残すが、新しい共有では使わない
const base64EncodeUnicode = (str: string): string => {
  // UTF-8 -> percent-encoding -> raw bytes -> Base64
  return btoa(unescape(encodeURIComponent(str)));
};

const base64DecodeUnicode = (base64: string): string => {
  // Base64 -> raw bytes -> percent-encoding -> UTF-8
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch (e) {
    console.error('Base64デコードエラー:', e);
    throw e;
  }
};

/**
 * 短い共有コードを生成する
 * @param input 入力文字列
 * @returns 短い識別コード
 */
const generateShortCode = (input: string): string => {
  // 固定フォーマットの共有コード (常に8文字)
  // UUIDの最初の部分を使用し、大文字で統一
  // UUID v4を使用することで衝突リスクを最小限に
  const uuid = uuidv4();
  // "-"を含まない最初の8文字を使用
  const uuidPart = uuid.replace(/-/g, '').substr(0, 8).toUpperCase();
  
  // 常に8文字の固定長で返す
  return uuidPart;
};

/**
 * 旅行情報を共有する（サーバーレスAPI版）
 * @param tripInfo 共有する旅行情報
 * @returns {Promise<string>} 共有コード
 */
export const shareToServer = async (tripInfo: TripInfo): Promise<string> => {
  try {
    console.log('サーバーレス共有処理開始', { tripName: tripInfo.name });
    
    // 共有コードを生成（固定8文字長でUUIDベース）
    const shareCode = generateShortCode(tripInfo.id + tripInfo.name);
    console.log(`生成された共有コード: ${shareCode}`);
    
    // まずローカルストレージに確実に保存
    storeTripInfoLocally(shareCode, {
      ...tripInfo,
      shareCode,
      lastUpdated: new Date()
    });
    console.log('ローカルストレージに保存完了');
    
    // 日付関連フィールドをシリアライズするため、クローンして余分なデータを削除
    const tripToShare = JSON.parse(JSON.stringify({
      ...tripInfo,
      shareCode, // 必ず同じ共有コードにする
      lastUpdated: new Date()
    }));
    
    // リトライ機構を設ける
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    let serverResponse = null;
    
    while (attempts < MAX_ATTEMPTS && !serverResponse) {
      attempts++;
      try {
        // APIリクエスト
        console.log(`サーバーへの保存を試行中 (${attempts}/${MAX_ATTEMPTS})`);
        const response = await fetch(`${API_BASE_URL}/createShare`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(tripToShare),
        });
        
        if (!response.ok) {
          const errorData = await response.text();
          console.error(`サーバー共有エラー (${attempts}/${MAX_ATTEMPTS}):`, response.status, errorData);
          
          if (attempts < MAX_ATTEMPTS) {
            // 待機してから再試行
            await new Promise(resolve => setTimeout(resolve, 500 * attempts));
            continue;
          }
          
          // サーバー共有に失敗してもローカル共有は成功
          console.warn('サーバー共有は失敗しましたが、ローカル共有で継続します');
          return shareCode;
        }
        
        serverResponse = await response.json();
        console.log('サーバー共有成功:', serverResponse);
      } catch (error) {
        console.warn(`サーバー共有エラー、再試行します (${attempts}/${MAX_ATTEMPTS})`, error);
        
        if (attempts < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, 500 * attempts));
          continue;
        }
        
        // 最終的にサーバー共有に失敗してもローカル共有を返す
        console.warn('すべてのサーバー試行が失敗しましたが、ローカル共有で継続します');
        return shareCode;
      }
    }
    
    // サーバーが返す共有コードをローカルへも保存（上書き）
    // サーバーが正常に応答した場合
    if (serverResponse && serverResponse.shareCode && serverResponse.shareCode !== shareCode) {
      console.log(`サーバーが別の共有コードを返しました: ${serverResponse.shareCode} (元: ${shareCode})`);
      
      // 新しいコードで再保存
      storeTripInfoLocally(serverResponse.shareCode, {
        ...tripInfo,
        shareCode: serverResponse.shareCode,
        lastUpdated: new Date()
      });
      
      // 元のコードも残しておく（リダイレクト用）
      const redirectInfo: SharedTripInfo = {
        shareCode: shareCode,
        tripInfo: {
          ...tripInfo,
          shareCode: serverResponse.shareCode, // 実際のコードを参照
          lastUpdated: new Date()
        },
        createdAt: new Date(),
        lastUpdated: new Date(),
        redirectTo: serverResponse.shareCode // リダイレクト先を示す
      };
      
      const sharedTrips = getSharedTrips();
      sharedTrips[shareCode] = redirectInfo;
      saveSharedTrips(sharedTrips);
      
      return serverResponse.shareCode;
    }
    
    // サーバーが返した共有コードまたは最初に生成した共有コードを使用
    return (serverResponse && serverResponse.shareCode) || shareCode;
  } catch (error) {
    console.error('サーバーレス共有処理中にエラーが発生しました:', error);
    // サーバー共有に失敗した場合、ローカル共有にフォールバック
    console.log('ローカル共有にフォールバックします...');
    return shareTripInfo(tripInfo);
  }
};

/**
 * 旅行情報を共有する（ローカルストレージ版 - 従来方式）
 * @param tripInfo 共有する旅行情報
 * @returns 共有コード
 */
export const shareTripInfo = (tripInfo: TripInfo): string => {
  try {
    console.log('共有処理開始', { tripName: tripInfo.name });
    
    // 固定長の共有コードを生成
    const shareCode = generateShortCode(tripInfo.id + tripInfo.name);
    console.log(`生成された共有コード: ${shareCode}`);
    
    // 保存処理を共通関数へ
    storeTripInfoLocally(shareCode, tripInfo);
    
    console.log(`共有コード生成成功: ${shareCode}`);
    return shareCode;
  } catch (error) {
    console.error('共有処理中にエラーが発生しました:', error);
    throw new Error(`共有処理に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
};

/**
 * 共有旅行情報をローカルに保存する共通関数
 * @param shareCode 共有コード
 * @param tripInfo 旅行情報
 */
function storeTripInfoLocally(shareCode: string, tripInfo: TripInfo): void {
  // 最終更新日時を設定
  const lastUpdated = new Date();
  
  // 既存の共有旅行情報を取得
  const sharedTrips = getSharedTrips();
  
  // 共有情報を作成
  const sharedTripInfo: SharedTripInfo = {
    shareCode,
    tripInfo: {
      ...tripInfo,
      shareCode,
      lastUpdated
    },
    createdAt: new Date(),
    lastUpdated
  };
  
  // 共有情報を保存
  sharedTrips[shareCode] = sharedTripInfo;
  saveSharedTrips(sharedTrips);
}

/**
 * 共有コードを使用して旅行情報を取得
 * @param shareCode 共有コード
 * @returns 旅行情報（存在しない場合はnull）
 */
export const getTripInfoByShareCode = async (shareCode: string): Promise<TripInfo | null> => {
  try {
    console.log(`共有コード検索開始: ${shareCode}`);
    
    // 0. まずローカルストレージを確認（リダイレクト情報もチェック）
    const sharedTrips = getSharedTrips();
    const localData = sharedTrips[shareCode];
    
    if (localData) {
      // リダイレクト情報がある場合は、リダイレクト先のデータを使用
      if (localData.redirectTo && sharedTrips[localData.redirectTo]) {
        console.log(`リダイレクト先データを使用: ${localData.redirectTo}`);
        const redirectData = sharedTrips[localData.redirectTo];
        
        // リダイレクト先からJSONをクローン後、日付復元
        const tripInfo = JSON.parse(JSON.stringify(redirectData.tripInfo), dateReviver);
        return tripInfo;
      }
      
      console.log(`ローカルストレージで共有コード発見: ${shareCode}`);
      // 日付のリハイドレーション
      const tripInfo = JSON.parse(JSON.stringify(localData.tripInfo), dateReviver);
      console.log('ローカルから旅行情報を取得・復元しました', tripInfo);
      
      // 先にローカルデータを返し、バックグラウンドでサーバー更新を試みる
      // サーバーからも最新データを取得（バックグラウンド更新）
      fetchFromServerAndUpdateLocal(shareCode).catch(e => 
        console.warn('バックグラウンド同期エラー:', e)
      );
      
      return tripInfo;
    }
    
    // 1. サーバーAPIから取得を試みる
    try {
      console.log(`サーバーAPIから取得を試みています: ${shareCode}`);
      
      // リトライ機構の導入
      let attempts = 0;
      const MAX_ATTEMPTS = 3;
      
      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
          console.log(`サーバーからの取得を試行中 (${attempts}/${MAX_ATTEMPTS})`);
          
          const response = await fetch(`${API_BASE_URL}/getShare/${shareCode}`);
          
          if (response.ok) {
            const data = await response.json();
            console.log('サーバーから旅行情報を取得しました', data);
            
            // デバッグ情報ログ
            console.log(`サーバーから取得したデータ構造: 
              id=${data.id}, 
              name=${data.name}, 
              shareCode=${data.shareCode}, 
              場所数=${data.desiredLocations?.length || 0}, 
              generatedItinerary=${data.generatedItinerary ? '存在' : 'なし'}`
            );
            
            // 日付の復元
            const tripData = restoreTripDates(data);
            
            // ローカルにも保存
            const sharedTrips = getSharedTrips();
            sharedTrips[shareCode] = {
              shareCode,
              tripInfo: tripData,
              createdAt: new Date(),
              lastUpdated: new Date(),
              version: 'v1-server'
            };
            saveSharedTrips(sharedTrips);
            
            return tripData;
          }
          
          // 404の場合は次のステップへ
          if (response.status === 404) {
            console.log(`サーバーにデータがありません (${attempts}/${MAX_ATTEMPTS}):`);
            break; // 404ならリトライしない
          }
          
          // その他のエラーでリトライ
          console.warn(`サーバーからの取得に失敗 (${attempts}/${MAX_ATTEMPTS}): ${response.status}`);
          
          if (attempts < MAX_ATTEMPTS) {
            // 再試行前に待機
            await new Promise(resolve => setTimeout(resolve, 300 * attempts));
          }
        } catch (error) {
          console.error(`サーバー接続エラー (${attempts}/${MAX_ATTEMPTS}):`, error);
          
          if (attempts < MAX_ATTEMPTS) {
            // 再試行前に待機
            await new Promise(resolve => setTimeout(resolve, 300 * attempts));
          }
        }
      }
    } catch (e) {
      console.error('サーバーからの取得中にエラー:', e);
    }
    
    // 古い形式のBase64エンコードデータの処理（レガシー互換性のため残す）
    try {
      // 長さが妥当なBase64エンコードっぽい文字列の場合のみ試行
      if (shareCode.length > 50) {
        // URLデコード
        const decodedShareCode = decodeURIComponent(shareCode);
        console.log(`URLデコード後: ${decodedShareCode.substring(0, 50)}...`);
        
        // Base64デコード
        const jsonStr = base64DecodeUnicode(decodedShareCode);
        console.log(`Base64デコード成功、長さ: ${jsonStr.length}`);
        
        // JSONパース
        const parsed: TripInfo = JSON.parse(jsonStr, dateReviver);
        console.log('古い形式の共有データを正常に解析しました');
        
        // 日付の復元
        const tripData = restoreTripDates(parsed);
        
        // 新しい形式に保存
        const newShareCode = generateShortCode(tripData.id + tripData.name);
        tripData.shareCode = newShareCode;
        
        // 保存
        const sharedTripInfo: SharedTripInfo = {
          shareCode: newShareCode,
          tripInfo: tripData,
          createdAt: new Date(),
          lastUpdated: new Date()
        };
        
        const sharedTrips = getSharedTrips();
        sharedTrips[newShareCode] = sharedTripInfo;
        saveSharedTrips(sharedTrips);
        
        console.log(`古い形式のデータを新形式(${newShareCode})に変換して保存しました`);
        
        return tripData;
      }
    } catch (e) {
      console.error('Base64デコード失敗:', e);
    }
    
    console.log(`共有コード不明: ${shareCode}`);
    return null;
  } catch (error) {
    console.error('共有旅行情報の取得中にエラーが発生しました:', error);
    throw error;
  }
};

/**
 * サーバーからデータを取得し、ローカルストレージを更新する（バックグラウンド処理）
 */
async function fetchFromServerAndUpdateLocal(shareCode: string): Promise<void> {
  try {
    console.log(`バックグラウンドでサーバーデータを同期中: ${shareCode}`);
    const response = await fetch(`${API_BASE_URL}/getShare/${shareCode}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('バックグラウンド同期: サーバーデータを取得');
      
      // 日付の復元
      const tripData = restoreTripDates(data);
      
      // ローカルに上書き保存
      const sharedTrips = getSharedTrips();
      sharedTrips[shareCode] = {
        shareCode,
        tripInfo: tripData,
        createdAt: new Date(),
        lastUpdated: new Date(),
        version: 'v1-server'
      };
      saveSharedTrips(sharedTrips);
      
      console.log('ローカルストレージをサーバーデータで更新しました');
    }
  } catch (error) {
    console.warn('バックグラウンド同期失敗:', error);
  }
}

/**
 * 日付文字列を含むTripInfoオブジェクトのすべての日付をDateオブジェクトに変換
 */
function restoreTripDates(data: any): TripInfo {
  // 日付の復元（文字列からDateオブジェクトへ）
  const result = { ...data };
  
  // 基本的な日付フィールド
  if (result.startDate && typeof result.startDate === 'string') {
    result.startDate = new Date(result.startDate);
  }
  
  if (result.endDate && typeof result.endDate === 'string') {
    result.endDate = new Date(result.endDate);
  }
  
  if (result.lastUpdated && typeof result.lastUpdated === 'string') {
    result.lastUpdated = new Date(result.lastUpdated);
  }
  
  // generatedItineraryが存在する場合、そのlocation内の日付も復元
  if (result.generatedItinerary && result.generatedItinerary.locations) {
    result.generatedItinerary.locations = result.generatedItinerary.locations.map((loc: any) => {
      const newLoc = { ...loc };
      
      if (newLoc.arrivalDate && typeof newLoc.arrivalDate === 'string') {
        newLoc.arrivalDate = new Date(newLoc.arrivalDate);
      }
      
      if (newLoc.departureDate && typeof newLoc.departureDate === 'string') {
        newLoc.departureDate = new Date(newLoc.departureDate);
      }
      
      return newLoc;
    });
  }
  
  // desiredLocationsの日付も復元
  if (result.desiredLocations) {
    result.desiredLocations = result.desiredLocations.map((loc: any) => {
      const newLoc = { ...loc };
      
      if (newLoc.specificDates && Array.isArray(newLoc.specificDates)) {
        newLoc.specificDates = newLoc.specificDates.map((date: any) => 
          typeof date === 'string' ? new Date(date) : date
        );
      }
      
      return newLoc;
    });
  }
  
  return result as TripInfo;
}

/**
 * サーバーにTripInfoを同期する
 * @param shareCode 共有コード
 * @param tripInfo 旅行情報
 */
async function syncToServer(shareCode: string, tripInfo: TripInfo): Promise<void> {
  const serverUrl = `/.netlify/functions/createShare`;
  
  const response = await fetch(serverUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...tripInfo,
      shareCode, // 明示的に共有コードを含める
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`サーバー同期エラー: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('サーバー同期成功:', result);
}

/**
 * 旅行に参加
 * @param shareCode 共有コード
 * @param participant 参加者情報
 * @returns 成功したかどうか
 */
export const joinTrip = async (shareCode: string, participant: Participant): Promise<boolean> => {
  try {
    const sharedTrips = getSharedTrips();
    
    if (!sharedTrips[shareCode]) {
      return false;
    }
    
    // 既に同じIDのメンバーがいないか確認
    const existingMember = sharedTrips[shareCode].tripInfo.members.find(
      member => member.id === participant.id
    );
    
    if (!existingMember) {
      // メンバーを追加
      sharedTrips[shareCode].tripInfo.members.push({
        id: participant.id,
        name: participant.name,
        color: participant.color
      });
      
      // 最終更新日時を更新
      sharedTrips[shareCode].lastUpdated = new Date();
      sharedTrips[shareCode].tripInfo.lastUpdated = new Date();
      
      // ローカルストレージに保存
      saveSharedTrips(sharedTrips);
      
      // サーバーにも同期
      try {
        await syncToServer(shareCode, sharedTrips[shareCode].tripInfo);
        console.log('メンバー参加をサーバーに同期しました');
      } catch (syncError) {
        console.warn('サーバー同期に失敗しましたが、ローカルには保存されました:', syncError);
      }
    }
    
    return true;
  } catch (error) {
    console.error('旅行参加処理中にエラーが発生しました:', error);
    return false;
  }
};

/**
 * 希望地を追加
 * @param shareCode 共有コード
 * @param desiredLocation 希望地情報
 * @returns 成功したかどうか
 */
export const addDesiredLocation = async (shareCode: string, desiredLocation: any): Promise<boolean> => {
  try {
    const sharedTrips = getSharedTrips();
    
    if (!sharedTrips[shareCode]) {
      return false;
    }
    
    // 希望地を追加
    sharedTrips[shareCode].tripInfo.desiredLocations.push(desiredLocation);
    
    // 最終更新日時を更新
    sharedTrips[shareCode].lastUpdated = new Date();
    sharedTrips[shareCode].tripInfo.lastUpdated = new Date();
    
    // ローカルストレージに保存
    saveSharedTrips(sharedTrips);
    
    // サーバーにも同期
    try {
      await syncToServer(shareCode, sharedTrips[shareCode].tripInfo);
      console.log('希望地追加をサーバーに同期しました');
    } catch (syncError) {
      console.warn('サーバー同期に失敗しましたが、ローカルには保存されました:', syncError);
    }
    
    return true;
  } catch (error) {
    console.error('希望地追加処理中にエラーが発生しました:', error);
    return false;
  }
};

/**
 * ローカルストレージから共有旅行情報を取得
 */
const getSharedTrips = (): Record<string, SharedTripInfo> => {
  const data = localStorage.getItem(SHARED_TRIPS_KEY);
  console.log(`LocalStorage取得: ${data ? 'データあり' : 'データなし'}`);
  
  if (data) {
    try {
      // dateReviverを使用してパース
      const parsedData = JSON.parse(data, dateReviver);
      console.log(`共有データパース成功: ${Object.keys(parsedData).length}個のデータ`);
      return parsedData;
    } catch (error) {
      console.error('共有データのパースに失敗:', error);
    }
  }
  
  return {};
};

/**
 * ローカルストレージに共有旅行情報を保存
 */
const saveSharedTrips = (sharedTrips: Record<string, SharedTripInfo>): void => {
  try {
    const serializedData = JSON.stringify(sharedTrips);
    localStorage.setItem(SHARED_TRIPS_KEY, serializedData);
    console.log(`共有データ保存完了: ${Object.keys(sharedTrips).length}個のデータ (${serializedData.length} バイト)`);
  } catch (error) {
    console.error('共有データの保存に失敗:', error);
    throw new Error(`共有データの保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
};

/**
 * 日付型を処理するためのJSONリバイバー
 * JSONデータの中に日付形式の文字列があれば、Dateオブジェクトに変換する
 */
const dateReviver = (key: string, value: any): any => {
  // ISO 8601形式の日付文字列を検出するパターン
  const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d{3})?Z$/;
  
  if (typeof value === 'string' && datePattern.test(value)) {
    try {
      return new Date(value);
    } catch (e) {
      console.error(`日付変換エラー: ${value}`, e);
      return value;
    }
  }
  
  return value;
};

/**
 * リアルタイム更新のためのポーリング機能
 * @param shareCode 共有コード
 * @param onUpdate 更新時のコールバック
 * @param intervalMs ポーリング間隔（ミリ秒）
 * @returns ポーリング停止関数
 */
export const startPolling = (
  shareCode: string, 
  onUpdate: (tripInfo: TripInfo) => void, 
  intervalMs: number = 10000 // 10秒間隔
): (() => void) => {
  let lastVersion = '';
  
  const poll = async () => {
    try {
      const updatedTripInfo = await getTripInfoByShareCode(shareCode);
      if (updatedTripInfo) {
        // バージョン情報で変更を検知（lastUpdatedを使用）
        const currentVersion = updatedTripInfo.lastUpdated?.toISOString() || '';
        if (currentVersion !== lastVersion) {
          lastVersion = currentVersion;
          onUpdate(updatedTripInfo);
          console.log('リアルタイム更新を検知しました:', currentVersion);
        }
      }
    } catch (error) {
      console.warn('ポーリング中にエラーが発生しました:', error);
    }
  };
  
  // 初回実行
  poll();
  
  // 定期実行
  const intervalId = setInterval(poll, intervalMs);
  
  // 停止関数を返す
  return () => {
    clearInterval(intervalId);
    console.log('ポーリングを停止しました');
  };
}; 