import type { Itinerary, Member, ItineraryLocation } from '../../types';
import { useState, useEffect } from 'react';

interface CalendarViewProps {
  itinerary: Itinerary;
  members: Member[];
}

/**
 * 旅程のカレンダービュー表示コンポーネント
 */
const CalendarView = ({ itinerary, members }: CalendarViewProps) => {
  // 全日程のリスト
  const [allDates, setAllDates] = useState<Date[]>([]);
  // 日付ごとのイベント情報
  const [dateEvents, setDateEvents] = useState<Record<string, {
    isTravel: boolean;
    locations: ItineraryLocation[];
    startLocation?: string;
    endLocation?: string;
    transportType?: 'air' | 'land';
  }>>({});
  
  // カレンダーデータの生成
  useEffect(() => {
    if (!itinerary || !itinerary.locations.length) return;
    
    // 開始日と終了日を取得
    const startLocation = itinerary.locations[0];
    const endLocation = itinerary.locations[itinerary.locations.length - 1];
    const startDate = new Date(startLocation.arrivalDate);
    const endDate = new Date(endLocation.departureDate);
    
    // 日数を計算
    const dayDiff = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // 全ての日を生成
    const dates: Date[] = [];
    const events: Record<string, any> = {};
    
    for (let i = 0; i <= dayDiff; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      dates.push(date);
      
      const dateStr = date.toISOString().split('T')[0];
      events[dateStr] = {
        isTravel: false,
        locations: []
      };
    }
    
    // 各場所の滞在日を設定
    for (const location of itinerary.locations) {
      const arrivalDate = new Date(location.arrivalDate);
      const departureDate = new Date(location.departureDate);
      
      // 滞在日ごとに場所を追加
      let currentDate = new Date(arrivalDate);
      while (currentDate <= departureDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (events[dateStr]) {
          events[dateStr].locations.push(location);
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    
    // 移動日を設定
    for (const route of itinerary.routes) {
      const fromLocation = itinerary.locations.find(loc => loc.id === route.from);
      const toLocation = itinerary.locations.find(loc => loc.id === route.to);
      
      if (fromLocation && toLocation) {
        const departureDate = new Date(fromLocation.departureDate);
        const dateStr = departureDate.toISOString().split('T')[0];
        
        if (events[dateStr]) {
          events[dateStr].isTravel = true;
          events[dateStr].startLocation = fromLocation.location.name;
          events[dateStr].endLocation = toLocation.location.name;
          events[dateStr].transportType = route.transportType;
        }
      }
    }
    
    setAllDates(dates);
    setDateEvents(events);
  }, [itinerary]);
  
  // 日付のフォーマット
  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString(undefined, options);
  };
  
  // 曜日の取得
  const getDayOfWeek = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'short' };
    return date.toLocaleDateString(undefined, options);
  };
  
  // 移動タイプのアイコン
  const TransportIcon = ({ type }: { type?: 'air' | 'land' }) => {
    if (type === 'air') {
      return <img src="/airplane.png" alt="飛行機" className="w-4 h-4" />;
    } else {
      return <img src="/car.png" alt="車" className="w-4 h-4" />;
    }
  };
  
  // メンバーカラーのスタイル生成
  const getMemberColorStyle = (requesters: string[]) => {
    if (requesters.length === 0) return {};
    
    const requesterMembers = members.filter(m => requesters.includes(m.id));
    
    if (requesterMembers.length === 1) {
      // 単一メンバーの場合
      return { 
        borderLeft: `4px solid ${requesterMembers[0].color || '#000'}`
      };
    } else if (requesterMembers.length > 1) {
      // 複数メンバーの場合はグラデーション
      const colors = requesterMembers.map(m => m.color || '#000').join(', ');
      return { 
        borderLeft: `4px solid black`,
        borderImage: `linear-gradient(to bottom, ${colors}) 1 100%`
      };
    }
    
    return {};
  };
  
  return (
    <div className="bg-white p-4 rounded-lg h-full overflow-auto">
      <h3 className="text-lg font-bold mb-4">旅程カレンダー</h3>
      
      <div className="space-y-2">
        {allDates.map((date, index) => {
          const dateStr = date.toISOString().split('T')[0];
          const eventData = dateEvents[dateStr];
          
          if (!eventData) return null;
          
          // すべての場所の希望者を集める
          const allRequesters = eventData.locations.reduce((acc, loc) => {
            return [...acc, ...loc.originalRequesters];
          }, [] as string[]);
          
          // 重複を削除
          const uniqueRequesters = [...new Set(allRequesters)];
          
          return (
            <div 
              key={dateStr}
              className="border rounded p-3 bg-white"
              style={getMemberColorStyle(uniqueRequesters)}
            >
              <div className="flex justify-between mb-2">
                <div className="font-bold">
                  {formatDate(date)}
                  <span className="ml-1 text-gray-500 font-normal">
                    {getDayOfWeek(date)}
                  </span>
                </div>
                <div className="text-sm text-gray-500">
                  Day {index + 1}
                </div>
              </div>
              
              {eventData.isTravel ? (
                <div className="flex items-center text-sm">
                  <span className="mr-1"><TransportIcon type={eventData.transportType} /></span>
                  <span className="font-medium">
                    {eventData.startLocation} → {eventData.endLocation}
                  </span>
                </div>
              ) : (
                <div className="text-sm">
                  {eventData.locations.map((loc, i) => (
                    <div key={`${loc.id}-${i}`} className="flex items-center">
                      <span className="font-medium">{loc.location.name}</span>
                      {loc.originalRequesters.length > 0 && (
                        <div className="flex ml-2">
                          {loc.originalRequesters.map(id => {
                            const member = members.find(m => m.id === id);
                            if (!member) return null;
                            
                            return (
                              <div
                                key={id}
                                className="w-4 h-4 rounded-full ml-1"
                                style={{ backgroundColor: member.color || '#000' }}
                                title={member.name}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarView; 