import React from 'react';
import type { TripInfo, ItineraryLocation, Route, Member } from '../types';

interface ItineraryResultProps {
  tripInfo: TripInfo;
  onReset?: () => void;
}

/**
 * 生成された旅程を表示するコンポーネント
 */
const ItineraryResult: React.FC<ItineraryResultProps> = ({ tripInfo, onReset }) => {
  if (!tripInfo.generatedItinerary) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <p className="text-center text-gray-500">旅程が生成されていません</p>
      </div>
    );
  }
  
  const { locations, routes, memberSatisfactionScores } = tripInfo.generatedItinerary;
  
  // 出発地（最初の地点）
  const departureLocation = locations[0];
  
  // 各メンバーの満足度合計を計算
  const totalSatisfaction = tripInfo.members.reduce((total, member) => {
    return total + (memberSatisfactionScores?.[member.id] || 0);
  }, 0);
  
  // メンバー数が0でなければ平均を計算、そうでなければ0
  const averageSatisfaction = tripInfo.members.length
    ? Math.round(totalSatisfaction / tripInfo.members.length)
    : 0;
  
  // 日付をフォーマット
  const formatDate = (date: Date): string => {
    if (!(date instanceof Date)) {
      date = new Date(date);
    }
    
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };
  
  // 場所に関連するメンバーのアバターを表示
  const renderMemberAvatars = (requesters: string[]) => {
    return requesters.map(requesterId => {
      const member = tripInfo.members.find(m => m.id === requesterId);
      if (!member) return null;
      
      return (
        <span
          key={member.id}
          className="inline-block w-6 h-6 rounded-full mr-1 border border-white"
          style={{ backgroundColor: member.color }}
          title={member.name}
        ></span>
      );
    });
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">最適化された旅行プラン</h2>
        
        <div className="flex items-center">
          <div className="text-center mr-6">
            <div className="text-3xl font-bold">{averageSatisfaction}%</div>
            <div className="text-sm text-gray-600">平均満足度</div>
          </div>
          
          {onReset && (
            <button 
              onClick={onReset}
              className="px-4 py-2 border border-black rounded"
            >
              プランを修正
            </button>
          )}
        </div>
      </div>
      
      <div className="mb-6">
        <h3 className="font-bold text-lg mb-2">メンバーの満足度</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {tripInfo.members.map(member => (
            <div key={member.id} className="border rounded p-3">
              <div className="flex items-center mb-2">
                <span 
                  className="w-4 h-4 rounded-full mr-2" 
                  style={{ backgroundColor: member.color }}
                ></span>
                <span className="font-medium">{member.name}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full mt-2">
                <div 
                  className="h-2 bg-green-500 rounded-full" 
                  style={{ width: `${memberSatisfactionScores?.[member.id] || 0}%` }}
                ></div>
              </div>
              <div className="text-right text-sm mt-1">
                {memberSatisfactionScores?.[member.id] || 0}%
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="mb-6">
        <h3 className="font-bold text-lg mb-4">旅程</h3>
        
        <div className="relative">
          {/* Timeline vertical line */}
          <div className="absolute top-0 bottom-0 left-16 w-0.5 bg-gray-300"></div>
          
          {locations.map((location, index) => {
            // 各地点間のルートを検索
            const incomingRoute = index > 0 
              ? routes.find(r => r.to === location.id)
              : null;
            
            return (
              <div key={location.id} className="mb-8 relative">
                {/* Timeline dot */}
                <div className="absolute left-16 -ml-2.5 mt-1.5 w-5 h-5 rounded-full bg-black"></div>
                
                <div className="pl-24">
                  <div className="font-bold text-lg">{location.location.name}</div>
                  
                  {location.location.region && (
                    <div className="text-gray-600 mb-2">
                      {location.location.region}{location.location.country ? `, ${location.location.country}` : ''}
                    </div>
                  )}
                  
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="bg-gray-100 px-2 py-1 rounded text-sm">
                      到着: {formatDate(location.arrivalDate)}
                    </span>
                    <span className="bg-gray-100 px-2 py-1 rounded text-sm">
                      出発: {formatDate(location.departureDate)}
                    </span>
                    
                    {incomingRoute && (
                      <span className="bg-gray-100 px-2 py-1 rounded text-sm">
                        移動: {incomingRoute.estimatedDuration}時間
                      </span>
                    )}
                    
                    {location.originalRequesters.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center">
                        <span className="mr-2 text-sm text-gray-600">希望者:</span>
                        {renderMemberAvatars(location.originalRequesters)}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* 移動情報（次の場所がある場合） */}
                {index < locations.length - 1 && (
                  <div className="pl-24 mb-4 mt-2 text-gray-600 text-sm">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                      移動
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ItineraryResult; 