import { v4 as uuidv4 } from 'uuid';
import type { TripInfo, SharedTripInfo, Participant } from '../types';

// ローカルストレージのキー
const SHARED_TRIPS_KEY = 'travelPathFinder_sharedTrips';

/**
 * 旅行情報を共有する
 * @param tripInfo 共有する旅行情報
 * @returns 共有コード
 */
export const shareTripInfo = (tripInfo: TripInfo): string => {
  try {
    console.log('共有処理開始', { tripName: tripInfo.name });
    
    // 既存の共有旅行情報を取得
    const sharedTrips = getSharedTrips();
    
    // 共有コードを生成
    const shareCode = generateShareCode(tripInfo.name);
    
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
 * 共有コードを使用して旅行情報を取得
 * @param shareCode 共有コード
 * @returns 旅行情報（存在しない場合はnull）
 */
export const getTripInfoByShareCode = (shareCode: string): TripInfo | null => {
  try {
    console.log(`共有コード検索開始: ${shareCode}`);
    const sharedTrips = getSharedTrips();
    
    if (sharedTrips[shareCode]) {
      console.log(`共有コード発見: ${shareCode}`);
      
      // 日付のリハイドレーション
      const tripInfo = JSON.parse(JSON.stringify(sharedTrips[shareCode].tripInfo), dateReviver);
      
      console.log('旅行情報を正常に取得・復元しました', tripInfo);
      return tripInfo;
    }
    
    console.log(`共有コード不明: ${shareCode}`);
    return null;
  } catch (error) {
    console.error('共有旅行情報の取得中にエラーが発生しました:', error);
    throw new Error(`共有旅行情報の取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
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
 * 共有コードを生成
 * @param tripName 旅行名（オプション）
 * @returns 共有コード
 */
const generateShareCode = (tripName?: string): string => {
  // 旅行名がある場合は頭文字を取得（英字のみ）
  let prefix = '';
  if (tripName) {
    // 英字の頭文字を取得（最大2文字）
    const initials = tripName
      .split(/\s+/) // スペースで分割
      .map(word => word.charAt(0))
      .filter(char => /[A-Za-z]/.test(char)) // 英字のみフィルタリング
      .slice(0, 2) // 最大2文字
      .join('')
      .toUpperCase();
    
    if (initials) {
      prefix = initials;
    }
  }
  
  // ランダムな英数字（4文字）
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  // プレフィックスがある場合は結合、ない場合は6文字のランダム文字列
  return prefix ? `${prefix}${randomPart}` : Math.random().toString(36).substring(2, 8).toUpperCase();
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