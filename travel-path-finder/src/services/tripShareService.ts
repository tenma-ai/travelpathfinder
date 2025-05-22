import { v4 as uuidv4 } from 'uuid';
import type { TripInfo, SharedTripInfo, Participant } from '../types';
import { compressToURI, decompressFromURI } from '../utils/compression';

// ローカルストレージのキー
const SHARED_TRIPS_KEY = 'travelPathFinder_sharedTrips';

// APIエンドポイント
const API_BASE_URL = '/api';

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
 * 旅行情報を共有する（サーバーレスAPI版）
 * @param tripInfo 共有する旅行情報
 * @returns {Promise<string>} 共有コード
 */
export const shareToServer = async (tripInfo: TripInfo): Promise<string> => {
  try {
    console.log('サーバーレス共有処理開始', { tripName: tripInfo.name });
    
    // クローンして余分なデータを削除
    const tripToShare = JSON.parse(JSON.stringify(tripInfo));
    
    // APIリクエスト
    const response = await fetch(`${API_BASE_URL}/createShare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tripToShare),
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('サーバー共有エラー:', response.status, errorData);
      throw new Error(`サーバー共有に失敗しました (${response.status}): ${errorData}`);
    }
    
    const data = await response.json();
    console.log('サーバー共有成功:', data);
    
    // クライアント側にも情報を保存（フォールバック用）
    const sharedTrips = getSharedTrips();
    
    // 共有情報を作成
    const sharedTripInfo: SharedTripInfo = {
      shareCode: data.shareCode,
      tripInfo: {
        ...tripInfo,
        shareCode: data.shareCode,
        lastUpdated: new Date(),
        isServerShared: true
      },
      createdAt: new Date(),
      lastUpdated: new Date(),
      version: 'v1-server',
    };
    
    // 共有情報をローカルにも保存
    sharedTrips[data.shareCode] = sharedTripInfo;
    saveSharedTrips(sharedTrips);
    
    return data.shareCode;
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
 * 共有コードを使用して旅行情報を取得
 * @param shareCode 共有コード
 * @returns 旅行情報（存在しない場合はnull）
 */
export const getTripInfoByShareCode = async (shareCode: string): Promise<TripInfo | null> => {
  try {
    console.log(`共有コード検索開始: ${shareCode}`);
    
    // 1. サーバーAPIから取得を試みる（新方式）
    try {
      console.log(`サーバーAPIから取得を試みています: ${shareCode}`);
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
      
      // 404の場合は続行
      if (response.status !== 404) {
        console.error(`サーバーからの取得に失敗: ${response.status}`);
      }
    } catch (e) {
      console.error('サーバーからの取得中にエラー:', e);
    }
    
    // 2. ローカルストレージから検索（旧方式）
    const sharedTrips = getSharedTrips();
    
    if (sharedTrips[shareCode]) {
      console.log(`ローカルストレージで共有コード発見: ${shareCode}`);
      
      // 日付のリハイドレーション
      const tripInfo = JSON.parse(JSON.stringify(sharedTrips[shareCode].tripInfo), dateReviver);
      
      console.log('旅行情報を正常に取得・復元しました', tripInfo);
      return tripInfo;
    }
    
    console.log(`ローカルストレージでも見つかりませんでした。データ解凍を試行: ${shareCode.substring(0, 20)}...`);
    
    // 3. データ復元を試行（新しい圧縮形式）
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
      const tripData = restoreTripDates(tripInfo);
      
      // 新しい共有コードを生成
      const newShareCode = generateShortCode(tripData.id + tripData.name + new Date().toISOString());
      tripData.shareCode = newShareCode;
      
      // 保存
      const sharedTripInfo: SharedTripInfo = {
        shareCode: newShareCode,
        tripInfo: tripData,
        createdAt: new Date(),
        lastUpdated: new Date()
      };
      
      sharedTrips[newShareCode] = sharedTripInfo;
      saveSharedTrips(sharedTrips);
      
      console.log(`圧縮データから復元された旅行情報を保存しました: ${newShareCode}`);
      return tripData;
    } catch (e) {
      console.error('データ解凍失敗:', e);
    }
    
    // 4. 古い形式のBase64エンコードされたデータとして試行
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
      
      // 日付の復元
      const tripData = restoreTripDates(parsed);
      
      // 新しい形式に保存
      const newShareCode = generateShortCode(tripData.id + tripData.name + new Date().toISOString());
      tripData.shareCode = newShareCode;
      
      // 保存
      const sharedTripInfo: SharedTripInfo = {
        shareCode: newShareCode,
        tripInfo: tripData,
        createdAt: new Date(),
        lastUpdated: new Date()
      };
      
      sharedTrips[newShareCode] = sharedTripInfo;
      saveSharedTrips(sharedTrips);
      
      console.log(`古い形式のデータを新形式(${newShareCode})に変換して保存しました`);
      
      return tripData;
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