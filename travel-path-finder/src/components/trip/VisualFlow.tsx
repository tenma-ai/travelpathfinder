import type { Itinerary, Member } from '../../types';

interface VisualFlowProps {
  itinerary: Itinerary;
  members: Member[];
}

/**
 * 旅程のビジュアルフロー表示コンポーネント
 */
const VisualFlow = ({ itinerary, members }: VisualFlowProps) => {
  // 日付のフォーマット
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString();
  };
  
  // 所要時間のフォーマット
  const formatDuration = (hours: number) => {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    
    if (days > 0) {
      return `${days}日${remainingHours > 0 ? ` ${remainingHours}時間` : ''}`;
    }
    
    return `${remainingHours}時間`;
  };
  
  // 交通手段のアイコン
  const TransportIcon = ({ type }: { type: 'air' | 'land' }) => {
    if (type === 'air') {
      return (
        <img src="/airplane.png" alt="飛行機" className="w-4 h-4" />
      );
    }
    
    return (
      <img src="/car.png" alt="車" className="w-4 h-4" />
    );
  };
  
  // 希望者アバターを表示
  const MemberAvatars = ({ requesterIds }: { requesterIds: string[] }) => {
    if (requesterIds.length === 0) return null;
    
    return (
      <div className="flex -space-x-2 overflow-hidden">
        {requesterIds.map(id => {
          const member = members.find(m => m.id === id);
          if (!member) return null;
          
          return (
            <div
              key={id}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-white text-xs font-bold"
              style={{ backgroundColor: member.color || '#000', color: '#fff' }}
              title={member.name}
            >
              {member.name.substring(0, 1)}
            </div>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className="bg-white p-4 rounded-lg h-full overflow-auto">
      <h3 className="text-lg font-bold mb-4">旅程フロー</h3>
      
      <div className="flex flex-col items-stretch">
        {itinerary.locations.map((location, index) => (
          <div key={location.id}>
            {/* 場所のボックス */}
            <div className="border-2 border-black rounded-lg p-3 bg-white">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold">{location.location.name}</h4>
                  <p className="text-sm text-gray-600">
                    {formatDate(location.arrivalDate)} - {formatDate(location.departureDate)}
                  </p>
                </div>
                <div className="text-lg font-bold bg-black text-white w-7 h-7 rounded-full flex items-center justify-center">
                  {index + 1}
                </div>
              </div>
              
              {/* 希望者アバター */}
              {location.originalRequesters.length > 0 && (
                <div className="mt-2">
                  <MemberAvatars requesterIds={location.originalRequesters} />
                </div>
              )}
            </div>
            
            {/* 移動の矢印 */}
            {index < itinerary.routes.length && (
              <div className="my-2 border-l-2 border-black ml-6 pl-4">
                <div className="flex items-center">
                  <div className="mr-2">
                    <TransportIcon type={itinerary.routes[index].transportType} />
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">
                      {itinerary.routes[index].transportType === 'air' ? '空路' : '陸路'}
                    </div>
                    <div className="text-gray-600">
                      {formatDuration(itinerary.routes[index].estimatedDuration || itinerary.routes[index].duration || 0)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VisualFlow; 