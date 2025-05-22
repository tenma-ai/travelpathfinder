import type { DesiredLocation, Itinerary, ItineraryLocation, Location, Member, Route, TripInfo } from '../types';
import { calculateDistance, determineTransportType, estimateTransportDuration } from './mapUtils';
import { createAirRouteWithAirports } from '../services/airports';
import { v4 as uuidv4 } from 'uuid';

/**
 * 複数人の希望を考慮した最適ルートを生成
 */
export async function generateOptimalRoute(tripInfo: TripInfo): Promise<Itinerary> {
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
  const scoredCombinationsPromises = locationCombinations.map(async combo => {
    const itinerary = await createItinerary(combo, tripInfo);
    const equalityScore = calculateEqualityScore(itinerary, members);
    const efficiencyScore = calculateEfficiencyScore(itinerary);
    
    // 総合スコア (等価性:0.7, 効率性:0.3 の重み付け)
    const totalScore = 0.7 * equalityScore + 0.3 * efficiencyScore;
    
    return { itinerary, totalScore, equalityScore, efficiencyScore };
  });
  
  const scoredCombinations = await Promise.all(scoredCombinationsPromises);
  
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
  
  // 旅行の最大日数
  let maxDays: number;
  if (endDate) {
    maxDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  } else {
    // 終了日が指定されていない場合は、全ての希望地の滞在日数の合計の1.5倍を仮定
    const totalDesiredDays = desiredLocations.reduce((sum, loc) => sum + loc.stayDuration / 24, 0);
    maxDays = Math.ceil(totalDesiredDays * 1.5);
  }
  
  // シンプルな貪欲法: 優先度の高い順に選定
  const selectedLocations: DesiredLocation[] = [];
  let totalHours = 0;
  
  // 各メンバーの希望地を優先度付きで取得
  let memberPriorityLocs: { member: Member, locations: DesiredLocation[] }[] = [];
  
  for (const member of members) {
    const memberLocs = desiredLocations
      .filter(loc => loc.requesters.includes(member.id))
      .sort((a, b) => b.priority - a.priority);
    
    memberPriorityLocs.push({ member, locations: memberLocs });
  }
  
  // メンバーの希望地の数を計算
  const memberLocationCounts = new Map<string, number>();
  members.forEach(member => {
    memberLocationCounts.set(member.id, 0);
  });
  
  // 各メンバーから公平に選択するように、ラウンドロビン方式で選ぶ
  let continueSelection = true;
  let round = 0;
  
  while (continueSelection) {
    continueSelection = false;
    
    // メンバーをシャッフル - 毎ラウンド順番が変わるように
    const shuffledMemberPriorityLocs = [...memberPriorityLocs]
      .sort(() => Math.random() - 0.5);
    
    for (const { member, locations } of shuffledMemberPriorityLocs) {
      // このメンバーの現在のラウンドでまだ選ばれていない希望地を取得
      const availableLocations = locations.filter(loc => 
        !selectedLocations.includes(loc) && 
        totalHours + loc.stayDuration <= maxDays * 24
      );
      
      if (availableLocations.length > 0) {
        // 優先度が最も高い希望地を選択
        const topLocation = availableLocations[0];
        
        // まだ選択されていない場合のみ追加
        if (!selectedLocations.includes(topLocation)) {
          selectedLocations.push(topLocation);
          totalHours += topLocation.stayDuration;
          
          // このメンバーの選ばれた希望地の数を増やす
          const currentCount = memberLocationCounts.get(member.id) || 0;
          memberLocationCounts.set(member.id, currentCount + 1);
          
          continueSelection = true;
        }
      }
    }
    
    round++;
    // 無限ループ防止: 10ラウンド以上は回さない
    if (round >= 10) break;
  }
  
  // 残りの日数で追加の希望地を選択 - リクエスト数が少ないメンバーの希望を優先
  const sortedByRequestCount = [...memberPriorityLocs]
    .sort((a, b) => {
      const countA = memberLocationCounts.get(a.member.id) || 0;
      const countB = memberLocationCounts.get(b.member.id) || 0;
      return countA - countB; // リクエスト数が少ない順
    });
  
  // リクエスト数が少ないメンバーから順に追加希望地を検討
  for (const { member, locations } of sortedByRequestCount) {
    for (const loc of locations) {
      if (!selectedLocations.includes(loc) && totalHours + loc.stayDuration <= maxDays * 24) {
        selectedLocations.push(loc);
        totalHours += loc.stayDuration;
      }
    }
  }
  
  // 選択した場所の順序を最適化
  const optimizedLocations = optimizeRouteOrder(departureLocation, selectedLocations, returnToDeparture);
  
  // 最適化された順序の組み合わせを返す
  return [optimizedLocations];
}

/**
 * 旅程を生成
 */
async function createItinerary(selectedLocations: DesiredLocation[], tripInfo: TripInfo): Promise<Itinerary> {
  const { departureLocation, startDate, endDate, returnToDeparture } = tripInfo;
  
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
    const transportType = determineTransportType(prevLocation, desiredLoc.location);
    
    // 空路の場合は最寄りの空港経由のルート
    if (transportType === 'air') {
      // 空港経由のルートを取得
      const airportRoute = await createAirRouteWithAirports(prevLocation, desiredLoc.location);
      
      // 各区間の移動時間を計算し、区間ごとの移動手段を設定
      let currentPosition = prevLocation;
      let accumulatedTravelDays = 0;
      
      // 出発地→出発空港、到着空港→目的地は陸路
      // 出発空港→到着空港は空路
      for (let i = 1; i < airportRoute.length; i++) {
        const nextPosition = airportRoute[i];
        // 修正: より明確な条件で空港間の移動を判定
        // 現在地と次の地点の両方が空港名を含む場合のみ空路と判定
        const fromLocation = i > 0 ? airportRoute[i-1] : null;
        const toLocation = nextPosition;
        
        // fromLocationとtoLocationの両方が空港であれば空路
        const isAirportToAirport = 
          fromLocation && 
          (fromLocation.name.includes('空港') || fromLocation.name.toLowerCase().includes('airport')) &&
          (toLocation.name.includes('空港') || toLocation.name.toLowerCase().includes('airport'));
          
        const segmentTransportType = isAirportToAirport ? 'air' : 'land';
        
        // 移動時間を計算
        const segmentTravelDuration = estimateTransportDuration(
          currentPosition, 
          nextPosition, 
          segmentTransportType
        );
        
        // 移動に必要な時間を加算（日単位に切り上げ）
        const segmentTravelDays = Math.ceil(segmentTravelDuration / 24);
        accumulatedTravelDays += segmentTravelDays;
        
        // 中間地点（空港）の場合
        if (i < airportRoute.length - 1) {
          // 中間地点（空港）を旅程に追加
          const intermediateDate = new Date(currentDate.getTime() + segmentTravelDays * 24 * 60 * 60 * 1000);
          
          const intermediateLoc: ItineraryLocation = {
            id: uuidv4(),
            location: nextPosition,
            arrivalDate: new Date(intermediateDate),
            departureDate: new Date(intermediateDate), // 空港での滞在はなし
            originalRequesters: []
          };
          
          // 移動ルートの作成
          const route: Route = {
            id: uuidv4(),
            from: itineraryLocations[itineraryLocations.length - 1].id,
            to: intermediateLoc.id,
            transportType: segmentTransportType,
            estimatedDuration: segmentTravelDuration
          };
          
          itineraryLocations.push(intermediateLoc);
          routes.push(route);
        } 
        // 最終地点（目的地）の場合
        else {
          // 全移動日数を使って目的地の到着日を設定
          currentDate = new Date(currentDate.getTime() + accumulatedTravelDays * 24 * 60 * 60 * 1000);
          
          // 当該場所の滞在期間
          const arrivalDate = new Date(currentDate);
          const departureDate = new Date(currentDate.getTime() + desiredLoc.stayDuration * 24 * 60 * 60 * 1000);
          
          // 旅程地点の作成
          const itineraryLoc: ItineraryLocation = {
            id: uuidv4(),
            location: desiredLoc.location,
            arrivalDate,
            departureDate,
            originalRequesters: desiredLoc.requesters
          };
          
          // 移動ルートの作成
          const route: Route = {
            id: uuidv4(),
            from: itineraryLocations[itineraryLocations.length - 1].id,
            to: itineraryLoc.id,
            transportType: segmentTransportType,
            estimatedDuration: segmentTravelDuration
          };
          
          itineraryLocations.push(itineraryLoc);
          routes.push(route);
          
          // 次の場所の開始日を設定
          currentDate = new Date(departureDate);
        }
        
        // 現在位置を更新
        currentPosition = nextPosition;
      }
    } 
    // 陸路の場合は従来通りの直接移動
    else {
      // 移動時間を計算
      const travelDuration = estimateTransportDuration(prevLocation, desiredLoc.location, transportType);
      
      // 移動に必要な時間を加算（日単位に切り上げ）
      const travelDays = Math.ceil(travelDuration / 24);
      currentDate = new Date(currentDate.getTime() + travelDays * 24 * 60 * 60 * 1000);
      
      // 当該場所の滞在期間
      const arrivalDate = new Date(currentDate);
      const departureDate = new Date(currentDate.getTime() + desiredLoc.stayDuration * 24 * 60 * 60 * 1000);
      
      // 旅程地点の作成
      const itineraryLoc: ItineraryLocation = {
        id: uuidv4(),
        location: desiredLoc.location,
        arrivalDate,
        departureDate,
        originalRequesters: desiredLoc.requesters
      };
      
      // 移動ルートの作成
      const route: Route = {
        id: uuidv4(),
        from: itineraryLocations[itineraryLocations.length - 1].id,
        to: itineraryLoc.id,
        transportType,
        estimatedDuration: travelDuration
      };
      
      itineraryLocations.push(itineraryLoc);
      routes.push(route);
      
      // 次の場所の開始日を設定
      currentDate = new Date(departureDate);
    }
    
    prevLocation = desiredLoc.location;
  }
  
  // 出発地に戻る場合
  if (returnToDeparture) {
    const lastLoc = itineraryLocations[itineraryLocations.length - 1].location;
    const transportType = determineTransportType(lastLoc, departureLocation);
    
    // 空路の場合は最寄りの空港経由のルート
    if (transportType === 'air') {
      // 空港経由のルートを取得
      const airportRoute = await createAirRouteWithAirports(lastLoc, departureLocation);
      
      // 各区間の移動時間を計算し、区間ごとの移動手段を設定
      let currentPosition = lastLoc;
      let accumulatedTravelDays = 0;
      
      for (let i = 1; i < airportRoute.length; i++) {
        const nextPosition = airportRoute[i];
        // 修正: より明確な条件で空港間の移動を判定
        // 現在地と次の地点の両方が空港名を含む場合のみ空路と判定
        const fromLocation = i > 0 ? airportRoute[i-1] : null;
        const toLocation = nextPosition;
        
        // fromLocationとtoLocationの両方が空港であれば空路
        const isAirportToAirport = 
          fromLocation && 
          (fromLocation.name.includes('空港') || fromLocation.name.toLowerCase().includes('airport')) &&
          (toLocation.name.includes('空港') || toLocation.name.toLowerCase().includes('airport'));
          
        const segmentTransportType = isAirportToAirport ? 'air' : 'land';
        
        // 移動時間を計算
        const segmentTravelDuration = estimateTransportDuration(
          currentPosition, 
          nextPosition, 
          segmentTransportType
        );
        
        // 移動に必要な時間を加算（日単位に切り上げ）
        const segmentTravelDays = Math.ceil(segmentTravelDuration / 24);
        accumulatedTravelDays += segmentTravelDays;
        
        // 中間地点（空港）の場合
        if (i < airportRoute.length - 1) {
          // 中間地点（空港）を旅程に追加
          const intermediateDate = new Date(currentDate.getTime() + segmentTravelDays * 24 * 60 * 60 * 1000);
          
          const intermediateLoc: ItineraryLocation = {
            id: uuidv4(),
            location: nextPosition,
            arrivalDate: new Date(intermediateDate),
            departureDate: new Date(intermediateDate), // 空港での滞在はなし
            originalRequesters: []
          };
          
          // 移動ルートの作成
          const route: Route = {
            id: uuidv4(),
            from: itineraryLocations[itineraryLocations.length - 1].id,
            to: intermediateLoc.id,
            transportType: segmentTransportType,
            estimatedDuration: segmentTravelDuration
          };
          
          itineraryLocations.push(intermediateLoc);
          routes.push(route);
        } 
        // 最終地点（出発地）の場合
        else {
          // 全移動日数を使って目的地の到着日を設定
          currentDate = new Date(currentDate.getTime() + accumulatedTravelDays * 24 * 60 * 60 * 1000);
          
          // 出発地に戻る
          const returnLoc: ItineraryLocation = {
            id: uuidv4(),
            location: departureLocation,
            arrivalDate: new Date(currentDate),
            departureDate: new Date(currentDate),
            originalRequesters: []
          };
          
          // 移動ルートの作成
          const route: Route = {
            id: uuidv4(),
            from: itineraryLocations[itineraryLocations.length - 1].id,
            to: returnLoc.id,
            transportType: segmentTransportType,
            estimatedDuration: segmentTravelDuration
          };
          
          itineraryLocations.push(returnLoc);
          routes.push(route);
        }
        
        // 現在位置を更新
        currentPosition = nextPosition;
      }
    }
    // 陸路の場合は従来通りの直接移動
    else {
      const travelDuration = estimateTransportDuration(lastLoc, departureLocation, transportType);
      const travelDays = Math.ceil(travelDuration / 24);
      
      currentDate = new Date(currentDate.getTime() + travelDays * 24 * 60 * 60 * 1000);
      
      const returnLoc: ItineraryLocation = {
        id: uuidv4(),
        location: departureLocation,
        arrivalDate: new Date(currentDate),
        departureDate: new Date(currentDate),
        originalRequesters: []
      };
      
      const returnRoute: Route = {
        id: uuidv4(),
        from: itineraryLocations[itineraryLocations.length - 1].id,
        to: returnLoc.id,
        transportType,
        estimatedDuration: travelDuration
      };
      
      itineraryLocations.push(returnLoc);
      routes.push(returnRoute);
    }
  }
  
  // 終了日が指定されている場合、旅程を調整して終了日に収まるようにする
  if (tripInfo.endDate) {
    const lastLocation = itineraryLocations[itineraryLocations.length - 1];
    const scheduledEndDate = lastLocation.arrivalDate;
    
    // 旅程が終了日を超える場合
    if (scheduledEndDate > tripInfo.endDate) {
      console.log('旅程が終了日を超えています。滞在日数を調整します。');
      
      // 超過日数
      const overDays = Math.ceil((scheduledEndDate.getTime() - tripInfo.endDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // 場所ごとの滞在日数を比例配分で削減
      const locationsTrimmed: ItineraryLocation[] = [];
      const totalStayDays = selectedLocations.reduce((sum, loc) => sum + loc.stayDuration, 0);
      let remainingDaysToTrim = overDays;
      
      // 前の場所の出発日を追跡（各移動の日数計算に必要）
      let previousDepartureDate = new Date(startDate);
      
      // 最初の出発地点を追加
      locationsTrimmed.push({
        ...itineraryLocations[0],
        arrivalDate: new Date(startDate),
        departureDate: new Date(startDate)
      });
      
      // 各場所の滞在日数を調整（空港を除く実際の訪問場所のみ）
      for (let i = 1; i < itineraryLocations.length; i++) {
        const currentLoc = itineraryLocations[i];
        
        // 空港は滞在日数を持たないので調整不要、ただし到着日と出発日を更新
        if (
          (currentLoc.location.name.includes('空港') || 
           currentLoc.location.name.toLowerCase().includes('airport')) &&
          currentLoc.arrivalDate.getTime() === currentLoc.departureDate.getTime()
        ) {
          // 前の場所からの移動日数を計算
          const routeToAirport = routes.find(route => route.to === currentLoc.id);
          const travelDays = routeToAirport ? Math.ceil(routeToAirport.estimatedDuration / 24) : 1;
          
          const newArrivalDate = new Date(previousDepartureDate.getTime() + travelDays * 24 * 60 * 60 * 1000);
          
          locationsTrimmed.push({
            ...currentLoc,
            arrivalDate: newArrivalDate,
            departureDate: newArrivalDate  // 空港での滞在はなし
          });
          
          previousDepartureDate = newArrivalDate;
          continue;
        }
        
        // 滞在場所の場合は、滞在日数を調整
        const originalStayDuration = currentLoc.departureDate.getTime() - currentLoc.arrivalDate.getTime();
        const stayDays = Math.ceil(originalStayDuration / (1000 * 60 * 60 * 24));
        
        // この場所の滞在日数が1日以上なら調整可能
        if (stayDays > 1) {
          // 比例配分で削減日数を計算（少なくとも1日は滞在）
          const proportionalShare = Math.min(
            Math.floor(stayDays * (remainingDaysToTrim / totalStayDays)), 
            stayDays - 1
          );
          
          // 前の場所からの移動日数を計算
          const routeToHere = routes.find(route => route.to === currentLoc.id);
          const travelDays = routeToHere ? Math.ceil(routeToHere.estimatedDuration / 24) : 1;
          
          const newArrivalDate = new Date(previousDepartureDate.getTime() + travelDays * 24 * 60 * 60 * 1000);
          const newStayDays = Math.max(stayDays - proportionalShare, 1);
          const newDepartureDate = new Date(newArrivalDate.getTime() + newStayDays * 24 * 60 * 60 * 1000);
          
          locationsTrimmed.push({
            ...currentLoc,
            arrivalDate: newArrivalDate,
            departureDate: newDepartureDate
          });
          
          previousDepartureDate = newDepartureDate;
          remainingDaysToTrim -= proportionalShare;
        } else {
          // 滞在日数が1日以下なら調整不可、そのまま追加
          const routeToHere = routes.find(route => route.to === currentLoc.id);
          const travelDays = routeToHere ? Math.ceil(routeToHere.estimatedDuration / 24) : 1;
          
          const newArrivalDate = new Date(previousDepartureDate.getTime() + travelDays * 24 * 60 * 60 * 1000);
          const newDepartureDate = new Date(newArrivalDate.getTime() + 24 * 60 * 60 * 1000); // 1日滞在
          
          locationsTrimmed.push({
            ...currentLoc,
            arrivalDate: newArrivalDate,
            departureDate: newDepartureDate
          });
          
          previousDepartureDate = newDepartureDate;
        }
      }
      
      // 調整後の最終日が終了日を超えていないか確認
      const adjustedLastDate = locationsTrimmed[locationsTrimmed.length - 1].arrivalDate;
      
      if (adjustedLastDate <= tripInfo.endDate) {
        // 調整に成功した場合、調整後の旅程を使用
        itineraryLocations.splice(0, itineraryLocations.length, ...locationsTrimmed);
      } else {
        // 調整しても収まらない場合は、警告を出す
        console.warn('滞在日数を調整しても旅程が終了日に収まりません。一部の目的地を削除する必要があります。');
        // この場合は、generateLocationCombinations側でより少ない目的地を選択する必要がある
      }
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
      totalDuration += route.estimatedDuration;
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