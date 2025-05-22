import type { DesiredLocation, Itinerary, ItineraryLocation, Location, Member, Route, TripInfo } from '../types';
import { calculateDistance, determineTransportType, estimateTransportDuration, isAirport, findNearestAirport } from './mapUtils';
import { v4 as uuidv4 } from 'uuid';

/**
 * 複数人の希望を考慮した最適ルートを生成
 */
export function generateOptimalRoute(tripInfo: TripInfo): Itinerary {
  const { members, desiredLocations, departureLocation, startDate, endDate, returnToDeparture } = tripInfo;
  
  // 1. データの前処理と検証
  validateTripData(tripInfo);
  
  // 2. 希望地の組み合わせ候補を生成
  const locationCombinations = generateLocationCombinations(tripInfo);
  
  // 候補がない場合、エラー
  if (locationCombinations.length === 0) {
    throw new Error('有効な旅程を生成できませんでした。旅行期間を延長するか、希望地を減らしてください。');
  }
  
  // 3. 各候補に対してスコアを計算
  const scoredCombinations = locationCombinations.map(combo => {
    const itinerary = createItinerary(combo, tripInfo);
    const equalityScore = calculateEqualityScore(itinerary, members);
    const efficiencyScore = calculateEfficiencyScore(itinerary);
    
    // 総合スコア (等価性:0.7, 効率性:0.3 の重み付け)
    const totalScore = 0.7 * equalityScore + 0.3 * efficiencyScore;
    
    return { itinerary, totalScore, equalityScore, efficiencyScore };
  });
  
  // 4. 最適な組み合わせを選択
  scoredCombinations.sort((a, b) => b.totalScore - a.totalScore);
  
  // 最適解を返す
  return scoredCombinations[0].itinerary;
}

/**
 * 旅行データの検証
 */
function validateTripData(tripInfo: TripInfo): void {
  const { members, desiredLocations, startDate, endDate } = tripInfo;
  
  // メンバーが存在するか
  if (members.length === 0) {
    throw new Error('メンバーが指定されていません');
  }
  
  // 希望地が存在するか
  if (desiredLocations.length === 0) {
    throw new Error('希望地が指定されていません');
  }
  
  // 開始日と終了日の矛盾チェック
  if (endDate && startDate > endDate) {
    throw new Error('開始日は終了日より前でなければなりません');
  }
  
  // その他の検証ロジック...
}

/**
 * 実現可能な希望地の組み合わせを生成
 */
function generateLocationCombinations(tripInfo: TripInfo): DesiredLocation[][] {
  const { members, desiredLocations, startDate, endDate } = tripInfo;
  
  // 旅行の最大日数
  let maxDays: number;
  if (endDate) {
    maxDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  } else {
    // 終了日が指定されていない場合は、全ての希望地の滞在日数の合計の1.5倍を仮定
    const totalDesiredDays = desiredLocations.reduce((sum, loc) => sum + loc.stayDuration, 0);
    maxDays = Math.ceil(totalDesiredDays * 1.5);
  }
  
  // 単純な例: すべてのメンバーから最低1つの希望地を含む組み合わせ
  // 実際には組合せ最適化アルゴリズムを使用する必要がある
  
  // 各メンバーの希望地を抽出
  const memberDesires = members.map(member => {
    return desiredLocations.filter(loc => loc.requesters.includes(member.id));
  });
  
  // シンプルな貪欲法: 優先度の高い順に選定
  const selectedLocations: DesiredLocation[] = [];
  let totalDays = 0;
  
  // ソート済み希望地リスト（優先度高→低）
  const sortedLocations = [...desiredLocations].sort((a, b) => b.priority - a.priority);
  
  // まず各メンバーから少なくとも1つの希望地を選択
  for (const member of members) {
    const memberLocs = sortedLocations.filter(loc => 
      loc.requesters.includes(member.id) && 
      !selectedLocations.includes(loc)
    );
    
    if (memberLocs.length > 0) {
      const topLoc = memberLocs[0];
      if (totalDays + topLoc.stayDuration <= maxDays) {
        selectedLocations.push(topLoc);
        totalDays += topLoc.stayDuration;
      }
    }
  }
  
  // 残りの日数で追加の希望地を選択
  for (const loc of sortedLocations) {
    if (!selectedLocations.includes(loc) && totalDays + loc.stayDuration <= maxDays) {
      selectedLocations.push(loc);
      totalDays += loc.stayDuration;
    }
  }
  
  // ここでは簡略化のため、1つの組み合わせのみ返す
  return [selectedLocations];
}

/**
 * 旅程を生成
 */
function createItinerary(selectedLocations: DesiredLocation[], tripInfo: TripInfo): Itinerary {
  const { departureLocation, startDate, returnToDeparture } = tripInfo;
  
  const itineraryId = uuidv4();
  const itineraryLocations: ItineraryLocation[] = [];
  const routes: Route[] = [];
  
  let currentDate = new Date(startDate);
  let prevLocation: Location = departureLocation;
  
  // 出発地を追加
  const departureItineraryLoc: ItineraryLocation = {
    id: uuidv4(),
    location: departureLocation,
    arrivalDate: new Date(currentDate),
    departureDate: new Date(currentDate),
    originalRequesters: []
  };
  itineraryLocations.push(departureItineraryLoc);
  
  // 各希望地を順に追加
  for (const desiredLoc of selectedLocations) {
    // 前の場所から現在の場所への移動手段を決定
    let transportType = determineTransportType(prevLocation, desiredLoc.location);

    // --- 空路の場合の前後陸路挿入ロジック ---
    const subRoutes: { from: Location; to: Location; type: 'air' | 'land'; }[] = [];

    if (transportType === 'air') {
      let src = prevLocation;
      let dst = desiredLoc.location;

      // 出発地側
      if (!isAirport(src)) {
        const nearest = findNearestAirport(src);
        if (nearest) {
          subRoutes.push({ from: src, to: nearest, type: 'land' });
          src = nearest;
        } else {
          // 空港が見つからない場合は陸路扱い
          transportType = 'land';
        }
      }

      // 到着地側
      if (transportType === 'air' && !isAirport(dst)) {
        const nearestDst = findNearestAirport(dst);
        if (nearestDst) {
          dst = nearestDst;
        } else {
          transportType = 'land';
        }
      }

      if (transportType === 'air') {
        // 空路本体
        subRoutes.push({ from: src, to: dst, type: 'air' });
      }

      // 到着側陸路（placeholder replacement）
      if (transportType === 'air' && !isAirport(desiredLoc.location)) {
        subRoutes.push({ from: dst, to: desiredLoc.location, type: 'land' });
      }
    }

    // fallback to pure land if no subRoutes yet
    if (subRoutes.length === 0) {
      subRoutes.push({ from: prevLocation, to: desiredLoc.location, type: 'land' });
    }

    // --- サブルートを旅程に反映 ---
    for (const sr of subRoutes) {
      const fromLoc = sr.from || prevLocation; // placeholder handled
      const toLoc = sr.to || desiredLoc.location;
      const dur = estimateTransportDuration(fromLoc, toLoc, sr.type);
      const days = Math.ceil(dur / 24);
      currentDate = new Date(currentDate.getTime() + days * 24 * 60 * 60 * 1000);

      // 中継地は滞在0日で追加（空港・中継地点）
      const arr = new Date(currentDate);
      const dep = new Date(currentDate);
      const locId = uuidv4();
      const itLoc: ItineraryLocation = {
        id: locId,
        location: toLoc,
        arrivalDate: arr,
        departureDate: dep,
        originalRequesters: []
      };

      const route: Route = {
        id: uuidv4(),
        from: itineraryLocations[itineraryLocations.length - 1].id,
        to: locId,
        transportType: sr.type,
        estimatedDuration: dur
      };

      itineraryLocations.push(itLoc);
      routes.push(route);

      prevLocation = toLoc;
    }

    // 最後の実際の目的地は desiredLoc.location → add stay duration
    const stayArrival = itineraryLocations[itineraryLocations.length - 1].arrivalDate;
    const departureDate = new Date(stayArrival.getTime() + desiredLoc.stayDuration * 24 * 60 * 60 * 1000);
    itineraryLocations[itineraryLocations.length - 1].departureDate = departureDate;

    // update currentDate for next leg
    currentDate = new Date(departureDate);
  }
  
  // 出発地に戻る場合
  if (returnToDeparture) {
    const lastLoc = itineraryLocations[itineraryLocations.length - 1].location;
    let transportType = determineTransportType(lastLoc, departureLocation);

    const subRoutes: { from: Location; to: Location; type: 'air' | 'land' }[] = [];

    if (transportType === 'air') {
      let src = lastLoc;
      let dst = departureLocation;

      if (!isAirport(src)) {
        const nearest = findNearestAirport(src);
        if (nearest) {
          subRoutes.push({ from: src, to: nearest, type: 'land' });
          src = nearest;
        } else {
          transportType = 'land';
        }
      }

      if (transportType === 'air' && !isAirport(dst)) {
        const nearestDst = findNearestAirport(dst);
        if (nearestDst) {
          dst = nearestDst;
        } else {
          transportType = 'land';
        }
      }

      if (transportType === 'air') {
        subRoutes.push({ from: src, to: dst, type: 'air' });
      }

      if (transportType === 'air' && !isAirport(departureLocation)) {
        subRoutes.push({ from: dst, to: departureLocation, type: 'land' });
      }
    }

    if (subRoutes.length === 0) {
      subRoutes.push({ from: lastLoc, to: departureLocation, type: 'land' });
    }

    for (const sr of subRoutes) {
      const dur = estimateTransportDuration(sr.from, sr.to, sr.type);
      const days = Math.ceil(dur / 24);
      currentDate = new Date(currentDate.getTime() + days * 24 * 60 * 60 * 1000);

      const arr = new Date(currentDate);
      const dep = new Date(currentDate);
      const locId = uuidv4();
      const itLoc: ItineraryLocation = {
        id: locId,
        location: sr.to,
        arrivalDate: arr,
        departureDate: dep,
        originalRequesters: []
      };

      const route: Route = {
        id: uuidv4(),
        from: itineraryLocations[itineraryLocations.length - 1].id,
        to: locId,
        transportType: sr.type,
        estimatedDuration: dur
      };

      itineraryLocations.push(itLoc);
      routes.push(route);
    }
  }
  
  // メンバー満足度スコアを計算
  const memberSatisfactionScores = calculateMemberSatisfactionScores(tripInfo.members, selectedLocations, itineraryLocations);
  
  return {
    id: itineraryId,
    locations: itineraryLocations,
    routes,
    memberSatisfactionScores
  };
}

/**
 * 平等性スコアを計算
 */
function calculateEqualityScore(itinerary: Itinerary, members: Member[]): number {
  if (!itinerary.memberSatisfactionScores) return 0;
  
  const scores = Object.values(itinerary.memberSatisfactionScores);
  
  if (scores.length === 0) return 0;
  
  // 平均満足度
  const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  
  // 分散（低いほど平等）
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
  
  // 最小満足度
  const minScore = Math.min(...scores);
  
  // 平等性スコア = (最小満足度 * 0.5) + (1 - 正規化分散) * 0.5
  // 分散が0に近いほど、最小満足度が高いほど、スコアは1に近づく
  const normalizedVariance = Math.min(variance / 0.25, 1); // 分散を0-1に正規化
  
  return (minScore * 0.5) + ((1 - normalizedVariance) * 0.5);
}

/**
 * ルート効率スコアを計算
 */
function calculateEfficiencyScore(itinerary: Itinerary): number {
  // 総移動距離
  let totalDistance = 0;
  
  // 各ルートごとの距離を計算
  for (const route of itinerary.routes) {
    const fromLoc = itinerary.locations.find(loc => loc.id === route.from);
    const toLoc = itinerary.locations.find(loc => loc.id === route.to);
    
    if (fromLoc && toLoc) {
      totalDistance += calculateDistance(fromLoc.location.coordinates, toLoc.location.coordinates);
    }
  }
  
  // 効率スコア = 1 / (1 + 正規化総距離)
  // 距離が短いほどスコアは1に近づく
  const normalizedDistance = totalDistance / 10000; // 10000kmで正規化
  
  return 1 / (1 + normalizedDistance);
}

/**
 * メンバーごとの満足度スコアを計算
 */
function calculateMemberSatisfactionScores(
  members: Member[],
  selectedLocations: DesiredLocation[],
  itineraryLocations: ItineraryLocation[]
): Record<string, number> {
  const scores: Record<string, number> = {};
  
  for (const member of members) {
    // このメンバーの希望場所
    const memberDesires = selectedLocations.filter(loc => loc.requesters.includes(member.id));
    
    // 希望が一つもない場合
    if (memberDesires.length === 0) {
      scores[member.id] = 0;
      continue;
    }
    
    // 希望場所ごとの満足度を計算
    let totalSatisfaction = 0;
    
    for (const desire of memberDesires) {
      // 旅程内でこの希望場所が見つかるか
      const itineraryLoc = itineraryLocations.find(
        loc => loc.location.name === desire.location.name
      );
      
      if (itineraryLoc) {
        // 希望場所が旅程に入っている場合、優先度に応じた点数を加算
        totalSatisfaction += desire.priority / 5;
      }
    }
    
    // 正規化（0-1のスコア）
    scores[member.id] = totalSatisfaction / memberDesires.length;
  }
  
  return scores;
} 