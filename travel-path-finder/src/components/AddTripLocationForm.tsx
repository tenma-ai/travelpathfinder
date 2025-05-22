import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { TripInfo, DesiredLocation, Location, Member } from '../types';

interface AddTripLocationFormProps {
  tripInfo: TripInfo;
  onSubmit: (updatedTripInfo: TripInfo) => void;
}

/**
 * 旅行の希望地点を追加するためのフォームコンポーネント
 */
const AddTripLocationForm: React.FC<AddTripLocationFormProps> = ({ 
  tripInfo, 
  onSubmit 
}) => {
  const [locationName, setLocationName] = useState('');
  const [coordinates, setCoordinates] = useState<[number, number]>([0, 0]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<number>(3);
  const [stayDuration, setStayDuration] = useState<number>(4);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 位置情報検索
  const handleSearch = () => {
    if (!locationName.trim()) {
      setErrors({ locationName: '場所名を入力してください' });
      return;
    }
    
    setIsSearching(true);
    setErrors({});
    
    // 実際はAPIを呼び出すが、ここではモック
    setTimeout(() => {
      // モックの検索結果
      const mockResults: Location[] = [
        {
          name: `${locationName}`,
          country: '日本',
          region: '関東',
          coordinates: [139.7673068, 35.6809591]
        },
        {
          name: `${locationName} 駅`,
          country: '日本',
          region: '関東',
          coordinates: [139.7673068, 35.6809591]
        },
        {
          name: `${locationName} 公園`,
          country: '日本',
          region: '関東',
          coordinates: [139.7673068, 35.6809591]
        }
      ];
      
      setSearchResults(mockResults);
      setIsSearching(false);
    }, 1000);
  };

  // 場所選択
  const handleLocationSelect = (location: Location) => {
    setSelectedLocation(location);
    setCoordinates(location.coordinates);
    setSearchResults([]);
  };

  // メンバー選択の切り替え
  const toggleMemberSelection = (memberId: string) => {
    setSelectedMemberIds(prev => 
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  // フォーム送信
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // バリデーション
    const newErrors: Record<string, string> = {};
    
    if (!selectedLocation) {
      newErrors.location = '場所を選択してください';
    }
    
    if (selectedMemberIds.length === 0) {
      newErrors.members = '少なくとも1人のメンバーを選択してください';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // 新しい希望地を作成
    const newLocation: DesiredLocation = {
      id: uuidv4(),
      location: selectedLocation!,
      requesters: selectedMemberIds,
      priority,
      stayDuration,
    };
    
    // 旅行情報を更新
    const updatedTripInfo: TripInfo = {
      ...tripInfo,
      desiredLocations: [...tripInfo.desiredLocations, newLocation]
    };
    
    // 親コンポーネントに通知
    onSubmit(updatedTripInfo);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold mb-6">新しい希望地点を追加</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label className="block mb-2 font-medium">場所の検索</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={locationName}
              onChange={e => setLocationName(e.target.value)}
              placeholder="場所の名前を入力"
              className={`flex-grow border ${errors.locationName ? 'border-red-500' : 'border-gray-300'} rounded p-2`}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={isSearching}
              className="px-4 py-2 bg-black text-white rounded"
            >
              {isSearching ? '検索中...' : '検索'}
            </button>
          </div>
          {errors.locationName && (
            <p className="text-red-500 text-sm mt-1">{errors.locationName}</p>
          )}
          
          {/* 検索結果 */}
          {searchResults.length > 0 && (
            <div className="mt-2 border border-gray-300 rounded">
              <ul>
                {searchResults.map((location, index) => (
                  <li 
                    key={index}
                    onClick={() => handleLocationSelect(location)}
                    className="p-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                  >
                    <div className="font-medium">{location.name}</div>
                    {location.region && (
                      <div className="text-sm text-gray-600">{location.region}, {location.country}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* 選択された場所 */}
          {selectedLocation && (
            <div className="mt-3 p-3 bg-gray-100 rounded">
              <h3 className="font-medium">選択された場所：</h3>
              <p>{selectedLocation.name}</p>
              {selectedLocation.region && (
                <p className="text-sm text-gray-600">{selectedLocation.region}, {selectedLocation.country}</p>
              )}
            </div>
          )}
          
          {errors.location && (
            <p className="text-red-500 text-sm mt-1">{errors.location}</p>
          )}
        </div>
        
        <div className="mb-6">
          <label className="block mb-2 font-medium">
            希望するメンバー（誰がこの場所に行きたいですか？）
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {tripInfo.members.map(member => (
              <div
                key={member.id}
                onClick={() => toggleMemberSelection(member.id)}
                className={`p-2 rounded border cursor-pointer transition-colors ${
                  selectedMemberIds.includes(member.id) 
                    ? 'bg-black text-white' 
                    : 'bg-white border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <span 
                    className="w-3 h-3 rounded-full mr-2" 
                    style={{ backgroundColor: member.color }}
                  ></span>
                  {member.name}
                </div>
              </div>
            ))}
          </div>
          {errors.members && (
            <p className="text-red-500 text-sm mt-1">{errors.members}</p>
          )}
        </div>
        
        <div className="mb-6">
          <label className="block mb-2 font-medium">優先度</label>
          <div className="flex items-center">
            <input
              type="range"
              min="1"
              max="5"
              value={priority}
              onChange={e => setPriority(parseInt(e.target.value))}
              className="w-full mr-4"
            />
            <span className="text-lg font-bold">{priority}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>低</span>
            <span>高</span>
          </div>
        </div>
        
        <div className="mb-6">
          <label className="block mb-2 font-medium">滞在時間 (時間)</label>
          <select
            value={stayDuration}
            onChange={e => setStayDuration(parseInt(e.target.value))}
            className="w-full border border-gray-300 rounded p-2"
          >
            <option value="2">2時間</option>
            <option value="4">4時間</option>
            <option value="8">8時間（日帰り）</option>
            <option value="24">1日</option>
            <option value="48">2日</option>
            <option value="72">3日</option>
          </select>
        </div>
        
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onSubmit(tripInfo)}
            className="px-4 py-2 border border-black rounded"
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-black text-white rounded"
          >
            追加して旅程を再計算
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddTripLocationForm; 