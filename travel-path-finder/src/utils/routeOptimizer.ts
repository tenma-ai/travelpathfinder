import type { DesiredLocation, Itinerary, ItineraryLocation, Location, Member, Route, TripInfo } from '../types';
import { calculateDistance, determineTransportType, estimateTransportDuration } from './mapUtils';
import { createAirRouteWithAirports } from '../services/airports';
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
  
  // 同期的にルートを生成（サーバーレス関数用に簡略化）
  const scoredCombinations = locationCombinations.map((combo, index) => {
    try {
      const itinerary = createItinerarySync(combo, tripInfo);
      
      // 各メンバーが少なくとも1つの希望地を訪問できているか確認
      const memberVisitCounts = new Map<string, number>();
      members.forEach(member => memberVisitCounts.set(member.id, 0));
      
      itinerary.locations.forEach(loc => {
        loc.originalRequesters.forEach(requesterId => {
          const count = memberVisitCounts.get(requesterId) || 0;
          memberVisitCounts.set(requesterId, count + 1);
        });
      });
      
      // 少なくとも1つの希望地を訪問できないメンバーがいる場合のペナルティ
      const allMembersHaveOneVisit = Array.from(memberVisitCounts.values()).every(count => count > 0);
      
      const equalityScore = calculateEqualityScore(itinerary, members);
      const efficiencyScore = calculateEfficiencyScore(itinerary);
      
      // 総合スコア (等価性:0.6, 効率性:0.3, 全メンバー訪問:0.1 の重み付け)
      const memberVisitBonus = allMembersHaveOneVisit ? 1 : 0;
      const totalScore = 0.6 * equalityScore + 0.3 * efficiencyScore + 0.1 * memberVisitBonus;
      
      return { itinerary, totalScore, equalityScore, efficiencyScore, memberVisitBonus, combinationIndex: index };
    } catch (error) {
      console.error(`Combination ${index} failed:`, error);
      return null;
    }
  }).filter(result => result !== null);
  
  if (scoredCombinations.length === 0) {
    throw new Error('有効な旅程を生成できませんでした。旅行期間を延長するか、希望地を減らしてください。');
  }
  
  // 4. 最適な組み合わせを選択（スコアでソート）
  scoredCombinations.sort((a, b) => b.totalScore - a.totalScore);
  
  // トップ5の結果をログに出力（デバッグ用）
  const top5 = scoredCombinations.slice(0, 5);
  console.log('Top 5 itineraries:', top5.map(item => ({
    score: item.totalScore,
    equality: item.equalityScore,
    efficiency: item.efficiencyScore,
    memberVisit: item.memberVisitBonus,
    locations: item.itinerary.locations.length,
    lastDate: item.itinerary.locations[item.itinerary.locations.length - 1].departureDate
  })));
  
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
 * 最適化された移動順序を計算する（近似的巡回セールスマン問題解法）
 * @param departureLocation 出発地点
 * @param locations 訪問したい場所のリスト
 * @param returnToDeparture 出発地に戻るかどうか
 * @returns 最適化された訪問順序
 */
function optimizeRouteOrder(
  departureLocation: Location,
  locations: DesiredLocation[],
  returnToDeparture: boolean
): DesiredLocation[] {
  // 場所が0または1つの場合はそのまま返す
  if (locations.length <= 1) return [...locations];
  
  // 全ての地点の距離行列を計算
  const allLocations = [departureLocation, ...locations.map(loc => loc.location)];
  const distanceMatrix: number[][] = [];
  
  for (let i = 0; i < allLocations.length; i++) {
    distanceMatrix[i] = [];
    for (let j = 0; j < allLocations.length; j++) {
      if (i === j) {
        distanceMatrix[i][j] = 0;
      } else {
        distanceMatrix[i][j] = calculateDistance(
          allLocations[i].coordinates,
          allLocations[j].coordinates
        );
      }
    }
  }
  
  // 最近傍法（Nearest Neighbor）による経路構築
  const visited = new Array(locations.length + 1).fill(false);
  visited[0] = true; // 出発地はすでに訪問済み
  
  const path: number[] = [0]; // 出発地からスタート
  let currentNode = 0;
  
  // 全ての地点を訪問するまで繰り返す
  while (path.length < locations.length + 1) {
    let minDistance = Infinity;
    let nearestNode = -1;
    
    // 現在地から最も近い未訪問の地点を見つける
    for (let i = 1; i < allLocations.length; i++) {
      if (!visited[i] && distanceMatrix[currentNode][i] < minDistance) {
        minDistance = distanceMatrix[currentNode][i];
        nearestNode = i;
      }
    }
    
    if (nearestNode !== -1) {
      // 最も近い未訪問地点を経路に追加
      path.push(nearestNode);
      visited[nearestNode] = true;
      currentNode = nearestNode;
    }
  }
  
  // 出発地に戻る場合は最後に出発地を追加
  if (returnToDeparture) {
    path.push(0);
  }
  
  // 最適化された順序で希望地を並べ替え
  return path
    .slice(1, returnToDeparture ? -1 : undefined) // 最初と最後（出発地）を除去
    .map(index => locations[index - 1]); // インデックスを希望地に変換
}

/**
 * 実現可能な希望地の組み合わせを生成
 */
function generateLocationCombinations(tripInfo: TripInfo): DesiredLocation[][] {
  const { members, desiredLocations, startDate, endDate, departureLocation, returnToDeparture } = tripInfo;
  
  const combinations: DesiredLocation[][] = [];
  
  // 旅行の最大時間数
  let maxHours: number;
  if (endDate) {
    // 出発日と帰国日の差（時間単位）
    maxHours = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
  } else {
    // 終了日が指定されていない場合は、全ての希望地の滞在時間の合計の1.5倍を仮定
    const totalDesiredHours = desiredLocations.reduce((sum, loc) => sum + loc.stayDuration, 0);
    maxHours = Math.ceil(totalDesiredHours * 1.5);
  }
  
  // 最低限必要な移動時間の概算（出発地と各希望地間の距離から）
  const estimatedMinTravelHours = desiredLocations.reduce((sum, loc) => {
    const distance = calculateDistance(departureLocation.coordinates, loc.location.coordinates);
    // 距離に基づいて移動時間を概算（陸路なら時速60km、空路なら時速800kmと仮定）
    const estimatedHours = distance > 700 ? distance / 800 : distance / 60;
    return sum + estimatedHours;
  }, 0);
  
  // 利用可能な滞在時間 = 最大時間 - 最低限の移動時間
  const availableStayHours = Math.max(maxHours - estimatedMinTravelHours, 0);
  
  // 実際の旅程を作るには全希望地を入れられない可能性があるため、複数の候補を生成
  
  // 1. 全ての希望地を含む候補（自動終了日の場合や、期間が十分にある場合）
  const allLocations = optimizeRouteOrder(departureLocation, [...desiredLocations], returnToDeparture);
  combinations.push(allLocations);
  
  // 2. 各メンバーの優先度高い希望地のみを含む候補
  if (endDate) {
    // メンバーごとの希望地を抽出し、優先度でソート
    const memberPriorityLocs: { member: Member, locations: DesiredLocation[] }[] = [];
    
    for (const member of members) {
      const memberLocs = desiredLocations
        .filter(loc => loc.requesters.includes(member.id))
        .sort((a, b) => b.priority - a.priority);
      
      memberPriorityLocs.push({ member, locations: memberLocs });
    }
    
    // メンバー間での公平性と優先度を考慮した複数の組み合わせ候補を生成
    for (let priorityThreshold = 5; priorityThreshold >= 3; priorityThreshold--) {
      const highPriorityOnly = desiredLocations.filter(loc => loc.priority >= priorityThreshold);
      if (highPriorityOnly.length > 0) {
        const optimizedHighPriority = optimizeRouteOrder(departureLocation, highPriorityOnly, returnToDeparture);
        combinations.push(optimizedHighPriority);
      }
    }
    
    // メンバーごとに均等に希望地を選ぶ候補を生成（複数バージョン）
    const generateBalancedCombination = (maxLocationsPerMember: number) => {
      const selectedLocations: DesiredLocation[] = [];
      const memberSelectionCounts = new Map<string, number>();
      members.forEach(m => memberSelectionCounts.set(m.id, 0));
      
      // 各メンバーから順番に希望地を選択
      for (const { member, locations } of memberPriorityLocs) {
        let count = 0;
        for (const loc of locations) {
          if (count >= maxLocationsPerMember) break;
          if (!selectedLocations.includes(loc)) {
            selectedLocations.push(loc);
            count++;
            const currentCount = memberSelectionCounts.get(member.id) || 0;
            memberSelectionCounts.set(member.id, currentCount + 1);
          }
        }
      }
      
      if (selectedLocations.length > 0) {
        return optimizeRouteOrder(departureLocation, selectedLocations, returnToDeparture);
      }
      return null;
    };
    
    // メンバーごとに1〜3個の希望地を選ぶパターン
    for (let i = 3; i >= 1; i--) {
      const balancedCombo = generateBalancedCombination(i);
      if (balancedCombo) {
        combinations.push(balancedCombo);
      }
    }
    
    // 総滞在時間が利用可能時間に近い候補を生成
    const generateOptimalTimeCombo = () => {
      const selectedLocations: DesiredLocation[] = [];
      let totalStayHours = 0;
      
      // 優先度順にソート
      const sortedByPriority = [...desiredLocations].sort((a, b) => b.priority - a.priority);
      
      // メンバーごとに最低1つは選ぶ
      for (const member of members) {
        const topLoc = sortedByPriority.find(loc => 
          loc.requesters.includes(member.id) && !selectedLocations.includes(loc)
        );
        
        if (topLoc) {
          selectedLocations.push(topLoc);
          totalStayHours += topLoc.stayDuration;
        }
      }
      
      // 残りの時間で優先度順に追加
      for (const loc of sortedByPriority) {
        if (!selectedLocations.includes(loc) && totalStayHours + loc.stayDuration <= availableStayHours) {
          selectedLocations.push(loc);
          totalStayHours += loc.stayDuration;
        }
      }
      
      if (selectedLocations.length > 0) {
        return optimizeRouteOrder(departureLocation, selectedLocations, returnToDeparture);
      }
      return null;
    };
    
    const timeOptimalCombo = generateOptimalTimeCombo();
    if (timeOptimalCombo) {
      combinations.push(timeOptimalCombo);
    }
  }
  
  // 重複を排除
  const uniqueCombinations: DesiredLocation[][] = [];
  const seen = new Set<string>();
  
  for (const combo of combinations) {
    const key = combo.map(loc => loc.id).sort().join(',');
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCombinations.push(combo);
    }
  }
  
  return uniqueCombinations;
}

/**
 * 同期版の旅程作成関数（サーバーレス環境用に簡略化）
 */
function createItinerarySync(selectedLocations: DesiredLocation[], tripInfo: TripInfo): Itinerary {
  const { departureLocation, startDate, returnToDeparture } = tripInfo;
  
  // 移動順序の最適化
  const optimizedLocations = optimizeRouteOrder(departureLocation, selectedLocations, returnToDeparture);
  
  // 旅程を構築
  const itinerary: Itinerary = {
    id: uuidv4(),
    locations: [],
    routes: []
  };
  
  // 旅程に出発地点を追加
  const departureItineraryLocation: ItineraryLocation = {
    id: uuidv4(),
    location: departureLocation,
    arrivalDate: new Date(startDate),
    departureDate: new Date(startDate),
    originalRequesters: []
  };
  
  itinerary.locations.push(departureItineraryLocation);
  
  let currentDate = new Date(startDate);
  let currentLocation = departureItineraryLocation;
  
  // 各希望地を訪問
  for (const desiredLocation of optimizedLocations) {
    // 前の場所から現在の場所への移動を計算
    const distance = calculateDistance(
      currentLocation.location.coordinates,
      desiredLocation.location.coordinates
    );
    
    const transportType = determineTransportType(distance);
    const travelHours = estimateTransportDuration(distance, transportType);
    const travelMinutes = Math.ceil(travelHours * 60);
    
    // 移動時間を加算して到着日時を計算
    const arrivalDate = new Date(currentDate);
    arrivalDate.setMinutes(arrivalDate.getMinutes() + travelMinutes);
    
    // 滞在期間を加算して出発日時を計算
    const departureDate = new Date(arrivalDate);
    departureDate.setHours(departureDate.getHours() + desiredLocation.stayDuration);
    
    // ルートを作成
    const route: Route = {
      id: uuidv4(),
      from: currentLocation.id,
      to: uuidv4(), // 仮ID（後で更新）
      distance,
      transportType,
      duration: travelHours
    };
    
    // 旅程に希望地を追加
    const itineraryLocation: ItineraryLocation = {
      id: route.to,
      location: desiredLocation.location,
      arrivalDate,
      departureDate,
      originalRequesters: desiredLocation.requesters,
      priority: desiredLocation.priority
    };
    
    itinerary.locations.push(itineraryLocation);
    itinerary.routes.push(route);
    
    // 次の移動のための情報を更新
    currentDate = new Date(departureDate);
    currentLocation = itineraryLocation;
  }
  
  // 出発地に戻る場合
  if (returnToDeparture) {
    // 最後の場所から出発地への移動を計算
    const distance = calculateDistance(
      currentLocation.location.coordinates,
      departureLocation.coordinates
    );
    
    const transportType = determineTransportType(distance);
    const travelHours = estimateTransportDuration(distance, transportType);
    const travelMinutes = Math.ceil(travelHours * 60);
    
    // 移動時間を加算して到着日時を計算
    const arrivalDate = new Date(currentDate);
    arrivalDate.setMinutes(arrivalDate.getMinutes() + travelMinutes);
    
    // ルートを作成
    const route: Route = {
      id: uuidv4(),
      from: currentLocation.id,
      to: uuidv4(),
      distance,
      transportType,
      duration: travelHours
    };
    
    // 旅程に出発地を再追加
    const returnLocation: ItineraryLocation = {
      id: route.to,
      location: departureLocation,
      arrivalDate,
      departureDate: arrivalDate, // 戻ったらそこで終わり
      originalRequesters: []
    };
    
    itinerary.locations.push(returnLocation);
    itinerary.routes.push(route);
  }
  
  return itinerary;
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
 * 効率性スコアを計算
 */
function calculateEfficiencyScore(itinerary: Itinerary): number {
  // 総移動距離を計算
  let totalDistance = 0;
  let totalDuration = 0;
  
  for (const route of itinerary.routes) {
    // 移動元と移動先のロケーションを取得
    const fromLoc = itinerary.locations.find(loc => loc.id === route.from);
    const toLoc = itinerary.locations.find(loc => loc.id === route.to);
    
    if (fromLoc && toLoc) {
      // 地点間の距離を計算
      const distance = calculateDistance(fromLoc.location.coordinates, toLoc.location.coordinates);
      totalDistance += distance;
      totalDuration += route.duration || 0; // durationがundefinedの場合は0を使用
    }
  }
  
  // スコアの計算 (逆数を取るため、距離が短いほどスコアは高くなる)
  // 10000kmを基準として正規化
  const normalizedDistance = Math.min(totalDistance / 10000, 1);
  const distanceScore = 1 - normalizedDistance;
  
  // 移動時間も同様に評価 (100時間を基準)
  const normalizedDuration = Math.min(totalDuration / 100, 1);
  const durationScore = 1 - normalizedDuration;
  
  // 総合効率スコア (距離:60%, 時間:40%の重み付け)
  return distanceScore * 0.6 + durationScore * 0.4;
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
    // このメンバーの希望地のみ抽出
    const memberDesires = selectedLocations.filter(loc => 
      loc.requesters.includes(member.id)
    );
    
    if (memberDesires.length === 0) {
      scores[member.id] = 0;
      continue;
    }
    
    // 希望がどれだけ旅程に含まれているかの比率
    const inclusionRatio = memberDesires.length / Math.max(
      selectedLocations.filter(loc => loc.requesters.includes(member.id)).length,
      1
    );
    
    // 希望の重要度による加重平均
    const totalPriority = memberDesires.reduce((sum, loc) => sum + loc.priority, 0);
    const weightedPriorityScore = memberDesires.reduce(
      (sum, loc) => sum + (loc.priority / 5), // 優先度を0-1に正規化
      0
    ) / Math.max(memberDesires.length, 1);
    
    // 最終的な満足度スコア (0-1の範囲)
    // 希望地含有率:40%, 優先度:60%の重み付け
    scores[member.id] = inclusionRatio * 0.4 + weightedPriorityScore * 0.6;
  }
  
  return scores;
} 