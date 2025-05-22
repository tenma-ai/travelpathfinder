// 共通タイプ定義

// 位置情報タイプ
export interface Location {
  name: string;
  country?: string;
  region?: string;
  coordinates: [number, number]; // [longitude, latitude]
}

// メンバータイプ
export interface Member {
  id: string;
  name: string;
  color?: string; // メンバーを識別するための色
}

// 希望地タイプ
export interface DesiredLocation {
  id: string;
  location: Location;
  requesters: string[]; // メンバーID配列
  priority: number; // 1-5のスケール
  stayDuration: number; // 滞在希望時間（時間単位）
  specificDates?: [Date, Date]; // 特定の日付指定がある場合
}

// 旅程タイプ
export interface Itinerary {
  id: string;
  locations: ItineraryLocation[];
  routes: Route[];
  memberSatisfactionScores?: Record<string, number>; // メンバーIDとその満足度スコア
}

// 旅程の各場所
export interface ItineraryLocation {
  id: string;
  location: Location;
  arrivalDate: Date;
  departureDate: Date;
  originalRequesters: string[]; // この場所を希望したメンバーID
  priority?: number; // 優先度
}

// 移動経路
export interface Route {
  id: string;
  from: string; // 出発地点ID
  to: string; // 目的地点ID
  transportType: 'land' | 'air';
  estimatedDuration?: number; // 推定所要時間（時間）
  distance?: number; // 距離（km）
  duration?: number; // 移動時間（時間）
}

// 旅行情報
export interface TripInfo {
  id: string;
  name?: string; // 旅行名（任意）
  members: Member[];
  departureLocation: Location;
  startDate: Date;
  endDate?: Date; // 自動計算の場合はundefined
  returnToDeparture: boolean;
  desiredLocations: DesiredLocation[];
  generatedItinerary?: Itinerary;
  tripType: 'solo' | 'group' | 'join';
  shareCode?: string; // 共有コード - 共有時に自動生成
  lastUpdated?: Date; // 最終更新日時
  isServerShared?: boolean; // サーバーに保存されているかどうか
}

// 共有旅行情報
export interface SharedTripInfo {
  shareCode: string;
  tripInfo: TripInfo;
  createdAt: Date;
  lastUpdated: Date;
  version?: string; // バージョン情報（サーバー連携など）
}

// 参加者情報
export interface Participant {
  id: string;
  name: string;
  color: string;
  joinedAt: Date;
} 