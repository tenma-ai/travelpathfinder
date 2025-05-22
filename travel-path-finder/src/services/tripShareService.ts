import { v4 as uuidv4 } from 'uuid';
import type { TripInfo, SharedTripInfo, Participant } from '../types';
import { compressToURI, decompressFromURI } from '../utils/compression';

// ローカルストレージのキー
const SHARED_TRIPS_KEY = 'travelPathFinder_sharedTrips';
// クラウドストレージ統合用の識別子
const CLOUD_STORAGE_PREFIX = 'CLOUD:';

// --- Base64エンコード/デコードユーティリティ ---
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
  // 簡易ハッシュ関数 (文字列に基づいた短いコードを生成)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit整数に変換
  }
  
  // タイムスタンプを追加して一意性を高める
  const timestamp = Date.now().toString(36);
  
  // ランダムな文字を追加
  const randomPart = Math.random().toString(36).substr(2, 4);
  
  // 8文字のコードを生成 (ハッシュ+タイムスタンプ+ランダム)
  return (Math.abs(hash).toString(36).substr(0, 3) + 
          timestamp.substr(-3) + 
          randomPart.substr(0, 2)).toUpperCase();
};

/**
 * 一時クラウドストレージを使用したデータ保存（デモ用）
 * 注意: 本番環境では適切なバックエンド実装に置き換えてください
 */
const tempCloudStore = {
  // クラウドストレージURLが有効かどうかを判定
  isCloudUrl: (code: string): boolean => {
    return code.startsWith(CLOUD_STORAGE_PREFIX);
  },
  
  // クラウドストレージからURLを抽出
  extractUrl: (code: string): string => {
    return code.replace(CLOUD_STORAGE_PREFIX, '');
  },
  
  // JSON Bin APIを使用した一時的なクラウドストレージ
  saveDataToCloud: async (data: any): Promise<string> => {
    try {
      const compressed = compressToURI(data);
      const binId = await createJsonBin(compressed);
      return `${CLOUD_STORAGE_PREFIX}${binId}`;
    } catch (e) {
      console.error('クラウドストレージ保存エラー:', e);
      throw e;
    }
  },
  
  // クラウドストレージからデータを取得
  getDataFromCloud: async (cloudCode: string): Promise<any> => {
    try {
      if (!tempCloudStore.isCloudUrl(cloudCode)) {
        throw new Error('有効なクラウドストレージコードではありません');
      }
      
      const binId = tempCloudStore.extractUrl(cloudCode);
      const compressed = await getJsonBin(binId);
      
      if (!compressed) {
        throw new Error('クラウドストレージからデータを取得できませんでした');
      }
      
      return decompressFromURI(compressed);
    } catch (e) {
      console.error('クラウドストレージ取得エラー:', e);
      throw e;
    }
  }
};

/**
 * JSONBin.ioに圧縮データを保存する
 * 注意: これは一時的なデモ実装です。本番環境では適切なバックエンドが必要です。
 */
async function createJsonBin(compressedData: string): Promise<string> {
  // 匿名の一時ストレージとして使用できるサービス（例：JSONBin.io）
  const endpoint = 'https://api.jsonbin.io/v3/b';
  
  try {
    // 注: 実際の実装では適切なAPI認証が必要です
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': '$2a$10$RaUa9mlAmZvPzKKK3nqI2.l0oJ0Bt2tEjfRdKpjPG08sIyTYmX14i', // デモ用キー
        'X-Bin-Private': 'false'
      },
      body: JSON.stringify({ data: compressedData })
    });
    
    if (!response.ok) {
      throw new Error(`クラウドストレージへの保存に失敗しました: ${response.status}`);
    }
    
    const result = await response.json();
    return result.metadata.id;
  } catch (e) {
    console.error('JSONBin保存エラー:', e);
    throw new Error('一時ストレージへの保存に失敗しました。インターネット接続を確認してください。');
  }
}

/**
 * JSONBin.ioから圧縮データを取得する
 */
async function getJsonBin(binId: string): Promise<string | null> {
  const endpoint = `https://api.jsonbin.io/v3/b/${binId}`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'X-Master-Key': '$2a$10$RaUa9mlAmZvPzKKK3nqI2.l0oJ0Bt2tEjfRdKpjPG08sIyTYmX14i' // デモ用キー
      }
    });
    
    if (!response.ok) {
      throw new Error(`クラウドストレージからの取得に失敗しました: ${response.status}`);
    }
    
    const result = await response.json();
    return result.record.data;
  } catch (e) {
    console.error('JSONBin取得エラー:', e);
    return null;
  }
}

/**
 * 旅行情報を共有する（クラウドストレージ対応版）
 * @param tripInfo 共有する旅行情報
 * @returns 共有コード（同期版）
 */
export const shareTripInfo = (tripInfo: TripInfo): string => {
  try {
    console.log('共有処理開始', { tripName: tripInfo.name });
    
    // 既存の共有旅行情報を取得
    const sharedTrips = getSharedTrips();
    
    // シンプルな共有コードを生成 (タイムスタンプやIDに基づく固有コード)
    const baseCodeInfo = tripInfo.id + tripInfo.name + new Date().toISOString();
    const shareCode = generateShortCode(baseCodeInfo);
    
    // 最終更新日時を設定
    const lastUpdated = new Date();
    
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
    
    console.log(`共有コード生成成功: ${shareCode}`);
    return shareCode;
  } catch (error) {
    console.error('共有処理中にエラーが発生しました:', error);
    throw new Error(`共有処理に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
};

/**
 * 旅行情報を共有する（クラウドストレージ版、非同期）
 * @param tripInfo 共有する旅行情報
 * @returns Promise<共有コード>
 */
export const shareTripInfoToCloud = async (tripInfo: TripInfo): Promise<string> => {
  try {
    console.log('クラウド共有処理開始', { tripName: tripInfo.name });
    
    // 最終更新日時を設定
    const lastUpdated = new Date();
    
    // 共有用に最小限の情報を含むオブジェクトを作成
    const minimalInfo = {
      ...tripInfo,
      lastUpdated
    };
    
    // クラウドストレージに保存
    const cloudCode = await tempCloudStore.saveDataToCloud(minimalInfo);
    console.log(`クラウド共有コード生成成功: ${cloudCode}`);
    
    // ローカルストレージにも保存（キャッシュとして）
    try {
      const sharedTrips = getSharedTrips();
      const shareCode = cloudCode.replace(CLOUD_STORAGE_PREFIX, 'LOCAL_');
      
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
    } catch (localError) {
      // ローカル保存に失敗してもクラウドコードは返す
      console.warn('ローカルキャッシュの保存に失敗:', localError);
    }
    
    return cloudCode;
  } catch (error) {
    console.error('クラウド共有処理中にエラーが発生しました:', error);
    throw new Error(`クラウド共有処理に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
};

/**
 * 旅行情報を共有データとしてエクスポート（直接URLに含めるデータ）
 * 新方式: 圧縮ユーティリティを使用
 * @param tripInfo 共有する旅行情報
 * @returns 圧縮されたデータ文字列
 */
export const exportTripData = (tripInfo: TripInfo): string => {
  try {
    // 最小限のデータに変換（サイズ削減のため）
    const minimalTripInfo = {
      ...tripInfo,
      id: tripInfo.id,
      name: tripInfo.name,
      members: tripInfo.members,
      departureLocation: tripInfo.departureLocation,
      startDate: tripInfo.startDate,
      endDate: tripInfo.endDate,
      desiredLocations: tripInfo.desiredLocations,
      tripType: tripInfo.tripType,
      lastUpdated: new Date()
    };
    
    // 圧縮ユーティリティを使用
    return compressToURI(minimalTripInfo);
  } catch (error) {
    console.error('旅行データのエクスポート中にエラーが発生しました:', error);
    // エラー時は最低限の情報のみを含む
    if (tripInfo && tripInfo.id && tripInfo.name) {
      return `minimal:${tripInfo.id}:${encodeURIComponent(tripInfo.name)}`;
    }
    throw error;
  }
};

/**
 * 共有コードを使用して旅行情報を取得（クラウドストレージ対応）
 * @param shareCode 共有コード
 * @returns 旅行情報（存在しない場合はnull）
 */
export const getTripInfoByShareCode = (shareCode: string): TripInfo | null => {
  try {
    console.log(`共有コード検索開始: ${shareCode}`);
    
    // クラウドストレージのコードの場合は非同期処理が必要なため、エラーを返す
    if (tempCloudStore.isCloudUrl(shareCode)) {
      console.error('クラウドコードは非同期版のgetTripInfoByShareCodeAsyncを使用してください:', shareCode);
      return null;
    }
    
    const sharedTrips = getSharedTrips();
    
    // 1. まず通常の共有コードとして検索
    if (sharedTrips[shareCode]) {
      console.log(`共有コード発見: ${shareCode}`);
      
      // 日付のリハイドレーション
      const tripInfo = JSON.parse(JSON.stringify(sharedTrips[shareCode].tripInfo), dateReviver);
      
      console.log('旅行情報を正常に取得・復元しました', tripInfo);
      return tripInfo;
    }
    
    console.log(`通常の共有コードでは見つかりませんでした。データ解凍を試行: ${shareCode.substring(0, 20)}...`);
    
    // 2. データ復元を試行（新しい圧縮形式）
    try {
      // 圧縮データを解凍
      const tripInfo = decompressFromURI(shareCode);
      console.log('圧縮データを正常に解凍しました', tripInfo);
      
      // データ検証
      if (!tripInfo || !tripInfo.id || !tripInfo.name) {
        console.error('解凍されたデータが不完全です');
        return null;
      }
      
      // 日付の修正
      if (tripInfo.startDate && !(tripInfo.startDate instanceof Date)) {
        tripInfo.startDate = new Date(tripInfo.startDate);
      }
      
      if (tripInfo.endDate && !(tripInfo.endDate instanceof Date)) {
        tripInfo.endDate = new Date(tripInfo.endDate);
      }
      
      // 新しい共有コードを生成
      const newShareCode = generateShortCode(tripInfo.id + tripInfo.name + new Date().toISOString());
      tripInfo.shareCode = newShareCode;
      
      // 保存
      const sharedTripInfo: SharedTripInfo = {
        shareCode: newShareCode,
        tripInfo,
        createdAt: new Date(),
        lastUpdated: new Date()
      };
      
      sharedTrips[newShareCode] = sharedTripInfo;
      saveSharedTrips(sharedTrips);
      
      console.log(`圧縮データから復元された旅行情報を保存しました: ${newShareCode}`);
      return tripInfo;
    } catch (e) {
      console.error('データ解凍失敗:', e);
    }
    
    // 3. 古い形式のBase64エンコードされたデータとして試行
    try {
      // URLデコード
      const decodedShareCode = decodeURIComponent(shareCode);
      console.log(`URLデコード後: ${decodedShareCode.substring(0, 50)}...`);
      
      // Base64デコード
      const jsonStr = base64DecodeUnicode(decodedShareCode);
      console.log(`Base64デコード成功、長さ: ${jsonStr.length}`);
      
      // JSONパース
      const parsed: TripInfo = JSON.parse(jsonStr, dateReviver);
      console.log('古い形式の共有データを正常に解析しました');
      
      // 新しい形式に保存
      const newShareCode = generateShortCode(parsed.id + parsed.name + new Date().toISOString());
      parsed.shareCode = newShareCode;
      
      // 保存
      const sharedTripInfo: SharedTripInfo = {
        shareCode: newShareCode,
        tripInfo: parsed,
        createdAt: new Date(),
        lastUpdated: new Date()
      };
      
      sharedTrips[newShareCode] = sharedTripInfo;
      saveSharedTrips(sharedTrips);
      
      console.log(`古い形式のデータを新形式(${newShareCode})に変換して保存しました`);
      
      return parsed;
    } catch (e) {
      console.error('Base64デコード失敗:', e);
    }
    
    console.log(`共有コード不明: ${shareCode}`);
    return null;
  } catch (error) {
    console.error('共有旅行情報の取得中にエラーが発生しました:', error);
    throw new Error(`共有旅行情報の取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
};

/**
 * 共有コードを使用して旅行情報を取得（非同期版、クラウドストレージ対応）
 * @param shareCode 共有コード
 * @returns Promise<旅行情報>（存在しない場合はnull）
 */
export const getTripInfoByShareCodeAsync = async (shareCode: string): Promise<TripInfo | null> => {
  try {
    console.log(`非同期: 共有コード検索開始: ${shareCode}`);
    
    // 1. クラウドストレージのコードの場合は専用の処理を実行
    if (tempCloudStore.isCloudUrl(shareCode)) {
      console.log(`クラウドストレージコードを検出: ${shareCode}`);
      try {
        const tripInfo = await tempCloudStore.getDataFromCloud(shareCode);
        
        // データ検証と修正
        if (!tripInfo || !tripInfo.id || !tripInfo.name) {
          console.error('クラウドから取得したデータが不完全です');
          return null;
        }
        
        // 日付の修正
        if (tripInfo.startDate && !(tripInfo.startDate instanceof Date)) {
          tripInfo.startDate = new Date(tripInfo.startDate);
        }
        
        if (tripInfo.endDate && !(tripInfo.endDate instanceof Date)) {
          tripInfo.endDate = new Date(tripInfo.endDate);
        }
        
        console.log('クラウドから旅行情報を正常に取得しました', tripInfo);
        
        // ローカルキャッシュに保存
        try {
          const sharedTrips = getSharedTrips();
          const localShareCode = shareCode.replace(CLOUD_STORAGE_PREFIX, 'LOCAL_');
          
          const sharedTripInfo: SharedTripInfo = {
            shareCode: localShareCode,
            tripInfo: {
              ...tripInfo,
              shareCode: localShareCode
            },
            createdAt: new Date(),
            lastUpdated: new Date()
          };
          
          sharedTrips[localShareCode] = sharedTripInfo;
          saveSharedTrips(sharedTrips);
          console.log('クラウドデータをローカルキャッシュに保存しました');
        } catch (cacheError) {
          console.warn('ローカルキャッシュへの保存に失敗:', cacheError);
        }
        
        return tripInfo;
      } catch (cloudError) {
        console.error('クラウドストレージからのデータ取得に失敗:', cloudError);
        throw new Error(`クラウドストレージからのデータ取得に失敗しました: ${cloudError instanceof Error ? cloudError.message : '不明なエラー'}`);
      }
    }
    
    // 2. 通常の同期処理でデータを取得
    return getTripInfoByShareCode(shareCode);
  } catch (error) {
    console.error('非同期共有旅行情報の取得中にエラーが発生しました:', error);
    throw new Error(`非同期共有旅行情報の取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
};

/**
 * 旅行に参加
 * @param shareCode 共有コード
 * @param participant 参加者情報
 * @returns 成功したかどうか
 */
export const joinTrip = (shareCode: string, participant: Participant): boolean => {
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
      
      // 保存
      saveSharedTrips(sharedTrips);
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
export const addDesiredLocation = (shareCode: string, desiredLocation: any): boolean => {
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
    
    // 保存
    saveSharedTrips(sharedTrips);
    
    return true;
  } catch (error) {
    console.error('希望地追加処理中にエラーが発生しました:', error);
    return false;
  }
};

/**
 * 共有コードを生成 (Base64 方式) - 後方互換性のために残す
 * @param tripInfo 旅行情報
 * @returns ポータブルな共有コード
 */
export const generatePortableShareCode = (tripInfo: TripInfo): string => {
  const json = JSON.stringify(tripInfo);
  return encodeURIComponent(base64EncodeUnicode(json));
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