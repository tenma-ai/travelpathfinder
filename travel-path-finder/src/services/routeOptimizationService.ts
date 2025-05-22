import type { TripInfo, Itinerary, ItineraryLocation, Route } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * 旅行情報から最適なルートを生成する
 * @param tripInfo 旅行情報
 * @returns 最適化された旅程
 */
export const generateOptimalRoute = async (tripInfo: TripInfo): Promise<Itinerary> => {
  try {
    console.log('旅程最適化開始', { tripName: tripInfo.name, locations: tripInfo.desiredLocations.length });
    
    // 実装済みのルート最適化ロジックがあればそれを使用
    // ここでは簡易的な実装を提供
    
    const itineraryLocations: ItineraryLocation[] = [];
    const routes: Route[] = [];
    
    // 旅程IDを生成
    const itineraryId = uuidv4();
    
    // 出発地点を追加
    const departureLocationId = uuidv4();
    const departureItineraryLocation: ItineraryLocation = {
      id: departureLocationId,
      location: tripInfo.departureLocation,
      arrivalDate: new Date(tripInfo.startDate),
      departureDate: new Date(tripInfo.startDate),
      originalRequesters: []
    };
    
    itineraryLocations.push(departureItineraryLocation);
    
    // 現在の日付をコピー
    let currentDate = new Date(tripInfo.startDate);
    
    // 各希望地点を処理
    for (let i = 0; i < tripInfo.desiredLocations.length; i++) {
      const location = tripInfo.desiredLocations[i];
      const locationId = uuidv4();
      
      // 前の場所からの移動時間を計算（実際はAPIを使うなど）
      const travelDuration = 2; // 2時間と仮定
      
      // 到着日を計算
      const arrivalDate = new Date(currentDate);
      arrivalDate.setHours(arrivalDate.getHours() + travelDuration);
      
      // 滞在期間を計算（デフォルトは半日）
      const stayDuration = location.stayDuration || 12;
      
      // 出発日を計算
      const departureDate = new Date(arrivalDate);
      departureDate.setHours(departureDate.getHours() + stayDuration);
      
      // 旅程の場所を追加
      const itineraryLocation: ItineraryLocation = {
        id: locationId,
        location: location.location,
        arrivalDate,
        departureDate,
        originalRequesters: location.requesters
      };
      
      itineraryLocations.push(itineraryLocation);
      
      // 前の場所からのルートを追加
      const prevLocationId = i === 0 ? departureLocationId : itineraryLocations[i].id;
      
      const route: Route = {
        id: uuidv4(),
        from: prevLocationId,
        to: locationId,
        transportType: 'land', // 単純化のため
        estimatedDuration: travelDuration
      };
      
      routes.push(route);
      
      // 次の場所の出発日に更新
      currentDate = new Date(departureDate);
    }
    
    // 出発地に戻るルートを追加（オプション）
    if (tripInfo.returnToDeparture) {
      const returnLocationId = uuidv4();
      const lastLocationId = itineraryLocations[itineraryLocations.length - 1].id;
      
      // 最終地点から出発地までの移動時間
      const returnTravelDuration = 3; // 3時間と仮定
      
      // 帰着日を計算
      const returnArrivalDate = new Date(currentDate);
      returnArrivalDate.setHours(returnArrivalDate.getHours() + returnTravelDuration);
      
      // 出発地に戻る旅程を追加
      const returnLocation: ItineraryLocation = {
        id: returnLocationId,
        location: tripInfo.departureLocation,
        arrivalDate: returnArrivalDate,
        departureDate: returnArrivalDate, // 同じ日に到着・出発
        originalRequesters: []
      };
      
      itineraryLocations.push(returnLocation);
      
      // 最終地点から出発地へのルートを追加
      const returnRoute: Route = {
        id: uuidv4(),
        from: lastLocationId,
        to: returnLocationId,
        transportType: 'land',
        estimatedDuration: returnTravelDuration
      };
      
      routes.push(returnRoute);
    }
    
    // 満足度スコアの計算
    const memberSatisfactionScores: Record<string, number> = {};
    
    tripInfo.members.forEach(member => {
      // 各メンバーの希望地がどれだけ含まれているかで計算
      const requestedLocations = tripInfo.desiredLocations.filter(loc => 
        loc.requesters.includes(member.id)
      ).length;
      
      const includedLocations = itineraryLocations.filter(loc => 
        loc.originalRequesters.includes(member.id)
      ).length;
      
      // 満足度を0-100で計算
      const satisfactionScore = requestedLocations > 0 
        ? Math.min(100, Math.round((includedLocations / requestedLocations) * 100))
        : 100;
      
      memberSatisfactionScores[member.id] = satisfactionScore;
    });
    
    // 生成された旅程を返す
    const itinerary: Itinerary = {
      id: itineraryId,
      locations: itineraryLocations,
      routes,
      memberSatisfactionScores
    };
    
    console.log('旅程最適化完了', { 
      locations: itineraryLocations.length,
      routes: routes.length 
    });
    
    return itinerary;
  } catch (error) {
    console.error('旅程最適化中にエラーが発生しました:', error);
    throw new Error(`旅程最適化に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
  }
}; 