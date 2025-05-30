import { useState, useEffect } from 'react';
import type { Location, DesiredLocation, TripInfo, Member } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { geocodeLocation, getLocationSuggestions } from '../../services/here';
import { generateMemberColors } from '../../utils/mapUtils';

interface GroupTripFormProps {
  onSubmit: (tripInfo: TripInfo) => void;
  initialTripInfo?: TripInfo; // 初期値として設定する旅行情報
  isAddingLocation?: boolean; // 希望地追加モードかどうか
}

/**
 * 複数人旅行入力フォーム
 */
const GroupTripForm = ({ onSubmit, initialTripInfo, isAddingLocation = false }: GroupTripFormProps) => {
  const DRAFT_KEY = 'groupTripDraft';
  // メンバー情報
  const [members, setMembers] = useState<Member[]>(initialTripInfo?.members || []);
  const [newMemberName, setNewMemberName] = useState('');
  
  // 基本情報
  const [tripName, setTripName] = useState(initialTripInfo?.name || '');
  const [departureLocationName, setDepartureLocationName] = useState(initialTripInfo?.departureLocation?.name || '');
  const [departureSuggestions, setDepartureSuggestions] = useState<string[]>([]);
  const [departureLocation, setDepartureLocation] = useState<Location | null>(initialTripInfo?.departureLocation || null);
  const [startDate, setStartDate] = useState(initialTripInfo?.startDate ? formatDate(initialTripInfo.startDate) : '');
  const [endDate, setEndDate] = useState(initialTripInfo?.endDate ? formatDate(initialTripInfo.endDate) : '');
  const [autoEndDate, setAutoEndDate] = useState(initialTripInfo?.endDate ? false : false);
  const [returnToDeparture, setReturnToDeparture] = useState(initialTripInfo?.returnToDeparture !== false);
  
  // 希望地情報
  const [desiredLocations, setDesiredLocations] = useState<DesiredLocation[]>(initialTripInfo?.desiredLocations || []);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationSuggestions, setNewLocationSuggestions] = useState<string[]>([]);
  const [newLocationDuration, setNewLocationDuration] = useState(24); // 24時間(1日)をデフォルト値に
  const [newLocationPriority, setNewLocationPriority] = useState(3);
  const [newLocationRequesters, setNewLocationRequesters] = useState<string[]>([]);
  
  // 編集モード用state
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  
  // エラーメッセージ
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  
  // Dateオブジェクトを'YYYY-MM-DD'形式の文字列に変換
  function formatDate(date: Date): string {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  }
  
  // フォーマット関数
  const formatDuration = (hours: number): string => {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    
    if (days > 0) {
      return `${days}日${remainingHours > 0 ? ` ${remainingHours}時間` : ''}`;
    }
    
    return `${remainingHours}時間`;
  };
  
  // 出発地の候補を取得
  useEffect(() => {
    if (departureLocationName.trim().length > 0) {
      const fetchSuggestions = async () => {
        const suggestions = await getLocationSuggestions(departureLocationName);
        setDepartureSuggestions(suggestions);
      };
      fetchSuggestions();
    } else {
      setDepartureSuggestions([]);
    }
  }, [departureLocationName]);
  
  // 希望地の候補を取得
  useEffect(() => {
    if (newLocationName.trim().length > 0) {
      const fetchSuggestions = async () => {
        const suggestions = await getLocationSuggestions(newLocationName);
        setNewLocationSuggestions(suggestions);
      };
      fetchSuggestions();
    } else {
      setNewLocationSuggestions([]);
    }
  }, [newLocationName]);
  
  // -------------------- 下書きの読み込み --------------------
  useEffect(() => {
    if (initialTripInfo || isAddingLocation) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        setMembers(d.members || []);
        setTripName(d.tripName || '');
        setDepartureLocationName(d.departureLocationName || '');
        setDepartureLocation(d.departureLocation || null);
        setStartDate(d.startDate || '');
        setEndDate(d.endDate || '');
        setAutoEndDate(d.autoEndDate ?? false);
        setReturnToDeparture(d.returnToDeparture ?? true);
        setDesiredLocations(d.desiredLocations || []);
      }
    } catch (e) {
      console.error('Failed to load group draft', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // -------------------- 下書きの保存 --------------------
  useEffect(() => {
    if (isAddingLocation) return;
    const draft = {
      members,
      tripName,
      departureLocationName,
      departureLocation,
      startDate,
      endDate,
      autoEndDate,
      returnToDeparture,
      desiredLocations
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (e) {
      console.error('Failed to save group draft', e);
    }
  }, [members, tripName, departureLocationName, departureLocation, startDate, endDate, autoEndDate, returnToDeparture, desiredLocations, isAddingLocation]);
  
  /**
   * 新しいメンバーを追加
   */
  const handleAddMember = () => {
    if (!newMemberName.trim()) {
      setErrors(prev => ({ ...prev, newMember: 'メンバー名を入力してください' }));
      return;
    }
    
    const newMember: Member = {
      id: uuidv4(),
      name: newMemberName.trim()
    };
    
    setMembers(prev => {
      const updatedMembers = [...prev, newMember];
      
      // メンバーカラーを割り当て
      const colors = generateMemberColors(updatedMembers.length);
      return updatedMembers.map((member, index) => ({
        ...member,
        color: colors[index]
      }));
    });
    
    setNewMemberName('');
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.newMember;
      return newErrors;
    });
  };
  
  /**
   * メンバーを削除
   */
  const handleRemoveMember = (id: string) => {
    setMembers(prev => prev.filter(member => member.id !== id));
    
    // このメンバーが希望者に含まれる希望地を更新
    setDesiredLocations(prev => 
      prev.map(loc => ({
        ...loc,
        requesters: loc.requesters.filter(requesterId => requesterId !== id)
      }))
    );
    
    // 希望者が0になった希望地を削除
    setDesiredLocations(prev => 
      prev.filter(loc => loc.requesters.length > 0)
    );
  };
  
  /**
   * 出発地を選択
   */
  const handleDepartureSelect = async (suggestion: string) => {
    const location = await geocodeLocation(suggestion);
    if (location) {
      setDepartureLocation(location);
      setDepartureLocationName(suggestion);
      setDepartureSuggestions([]);
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.departureLocation;
        return newErrors;
      });
    } else {
      setErrors(prev => ({ ...prev, departureLocation: '出発地が見つかりませんでした' }));
    }
  };
  
  /**
   * 希望地の編集モードを開始
   */
  const handleEditLocation = (location: DesiredLocation) => {
    setIsEditingLocation(true);
    setEditingLocationId(location.id);
    setNewLocationName(location.location.name);
    setNewLocationDuration(location.stayDuration);
    setNewLocationPriority(location.priority);
    setNewLocationRequesters([...location.requesters]);
    
    // 候補のクリア
    setNewLocationSuggestions([]);
  };

  /**
   * 編集モードをキャンセル
   */
  const handleCancelEdit = () => {
    setIsEditingLocation(false);
    setEditingLocationId(null);
    setNewLocationName('');
    setNewLocationDuration(24);
    setNewLocationPriority(3);
    setNewLocationRequesters([]);
    
    // エラーのクリア
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.newLocation;
      delete newErrors.newLocationRequesters;
      return newErrors;
    });
  };

  /**
   * 希望地の更新
   */
  const handleUpdateLocation = async () => {
    if (!editingLocationId) return;
    
    if (!newLocationName.trim()) {
      setErrors(prev => ({ ...prev, newLocation: '希望地を入力してください' }));
      return;
    }
    
    if (newLocationRequesters.length === 0) {
      setErrors(prev => ({ ...prev, newLocationRequesters: '希望者を選択してください' }));
      return;
    }
    
    const location = await geocodeLocation(newLocationName);
    if (location) {
      // 既存の希望地を更新
      setDesiredLocations(prev => prev.map(loc => 
        loc.id === editingLocationId
          ? {
              ...loc,
              location,
              priority: newLocationPriority,
              stayDuration: newLocationDuration,
              requesters: [...newLocationRequesters]
            }
          : loc
      ));
      
      // 編集モードをリセット
      setIsEditingLocation(false);
      setEditingLocationId(null);
      setNewLocationName('');
      setNewLocationDuration(24);
      setNewLocationPriority(3);
      setNewLocationRequesters([]);
      
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.newLocation;
        delete newErrors.newLocationRequesters;
        return newErrors;
      });
    } else {
      setErrors(prev => ({ ...prev, newLocation: '希望地が見つかりませんでした' }));
    }
  };

  /**
   * 新しい希望地を追加
   */
  const handleAddLocation = async (suggestion?: string) => {
    // 編集モードの場合は更新処理を実行
    if (isEditingLocation) {
      handleUpdateLocation();
      return;
    }
    
    const locationNameToUse = suggestion || newLocationName;
    
    if (!locationNameToUse.trim()) {
      setErrors(prev => ({ ...prev, newLocation: '希望地を入力してください' }));
      return;
    }
    
    if (newLocationRequesters.length === 0) {
      setErrors(prev => ({ ...prev, newLocationRequesters: '希望者を選択してください' }));
      return;
    }
    
    // ローディング状態の追加
    setErrors(prev => ({ ...prev, newLocation: '検索中...' }));
    
    const location = await geocodeLocation(locationNameToUse);
    if (location) {
      const newDesiredLocation: DesiredLocation = {
        id: uuidv4(),
        location,
        requesters: [...newLocationRequesters],
        priority: newLocationPriority,
        stayDuration: newLocationDuration
      };
      
      setDesiredLocations(prev => [...prev, newDesiredLocation]);
      setNewLocationName('');
      setNewLocationSuggestions([]);
      setNewLocationDuration(24);
      setNewLocationPriority(3);
      setNewLocationRequesters([]);
      
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.newLocation;
        delete newErrors.newLocationRequesters;
        return newErrors;
      });
    } else {
      setErrors(prev => ({ ...prev, newLocation: '希望地が見つかりませんでした' }));
    }
  };
  
  /**
   * 希望地を削除
   */
  const handleRemoveLocation = (id: string) => {
    setDesiredLocations(prev => prev.filter(loc => loc.id !== id));
  };
  
  /**
   * 希望者選択の切り替え
   */
  const toggleRequester = (memberId: string) => {
    if (newLocationRequesters.includes(memberId)) {
      setNewLocationRequesters(prev => prev.filter(id => id !== memberId));
    } else {
      setNewLocationRequesters(prev => [...prev, memberId]);
    }
  };
  
  /**
   * 全メンバーを希望者として選択
   */
  const selectAllRequesters = () => {
    setNewLocationRequesters(members.map(member => member.id));
  };
  
  /**
   * 希望地候補を選択したら直接追加の準備をする
   */
  const handleNewLocationSelect = (suggestion: string) => {
    setNewLocationName(suggestion);
    setNewLocationSuggestions([]);
    
    // 直接追加処理をせず、テキストフィールドに入力するだけにする
  };
  
  /**
   * フォーム送信処理
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 希望地追加モードの場合はメンバーのバリデーションは省略
    if (!isAddingLocation && members.length === 0) {
      setErrors({ members: '少なくとも1人のメンバーを追加してください' });
      return;
    }
    
    // バリデーション
    const newErrors: { [key: string]: string } = {};
    
    if (!departureLocation) {
      newErrors.departureLocation = '出発地を設定してください';
    }
    
    if (!startDate) {
      newErrors.startDate = '出発日を選択してください';
    }
    
    if (!autoEndDate && !endDate) {
      newErrors.endDate = '帰国日を選択するか、自動計算を有効にしてください';
    }
    
    if (desiredLocations.length === 0) {
      newErrors.desiredLocations = '少なくとも1つの希望地を追加してください';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // TripInfo作成
    const tripInfo: TripInfo = {
      id: initialTripInfo?.id || uuidv4(),
      name: tripName.trim() || undefined,
      members,
      departureLocation: departureLocation!,
      startDate: new Date(startDate),
      endDate: autoEndDate ? undefined : new Date(endDate),
      returnToDeparture,
      desiredLocations,
      tripType: 'group',
      // 既存の共有コードやその他の情報を保持
      shareCode: initialTripInfo?.shareCode,
      lastUpdated: new Date()
    };
    
    onSubmit(tripInfo);

    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  };
  
  return (
    <div className="bg-white p-6 rounded-lg shadow-md max-w-4xl mx-auto text-black">
      <h2 className="text-2xl font-bold mb-6 border-b pb-3 text-black">
        {isAddingLocation ? '希望地を追加' : '複数人旅行プラン作成'}
      </h2>
      
      <form onSubmit={handleSubmit}>
        {/* メンバーセクション */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-black">旅行メンバー</h3>
          
          {/* メンバーリスト */}
          {members.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {members.map((member) => (
                <div 
                  key={member.id} 
                  className="flex items-center space-x-2 bg-gray-100 rounded-full px-3 py-1"
                  style={{ borderLeft: `4px solid ${member.color}` }}
                >
                  <span className="text-black">{member.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(member.id)}
                    className="text-gray-500 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-4 p-4 border border-dashed rounded text-center text-gray-500">
              メンバーが追加されていません
            </div>
          )}
          
          {errors.members && (
            <p className="text-red-500 text-sm mb-2">{errors.members}</p>
          )}
          
          {/* メンバー追加フォーム */}
          <div className="flex mb-6">
            <input
              type="text"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="メンバー名"
              className="flex-grow border border-black rounded-l p-2 text-black bg-white"
            />
            <button
              type="button"
              onClick={handleAddMember}
              className="bg-black text-white px-4 py-2 rounded-r"
            >
              追加
            </button>
          </div>
          {errors.newMember && (
            <p className="text-red-500 text-sm mt-1 mb-2">{errors.newMember}</p>
          )}
        </div>
        
        {/* 出発情報セクション - 希望地追加モードでない場合のみ表示 */}
        {!isAddingLocation && (
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4 text-black">出発情報</h3>
            
            <div className="space-y-4">
              {/* 旅行名 */}
              <div>
                <label className="block text-sm font-medium mb-1 text-black">旅行名（任意）</label>
                <input
                  type="text"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder="例: グループで行く沖縄旅行"
                  className="w-full border border-black rounded p-2 text-black bg-white"
                />
              </div>
              
              {/* 出発地 */}
              <div>
                <label className="block text-sm font-medium mb-1 text-black">出発地</label>
                <div className="relative">
                  <input
                    type="text"
                    value={departureLocationName}
                    onChange={(e) => setDepartureLocationName(e.target.value)}
                    placeholder="例: 東京、ニューヨーク、エッフェル塔など"
                    className="w-full border border-black rounded p-2 text-black bg-white"
                  />
                  {departureSuggestions.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg">
                      {departureSuggestions.map((suggestion, index) => (
                        <div 
                          key={index}
                          className="p-2 hover:bg-gray-100 cursor-pointer text-black"
                          onClick={() => handleDepartureSelect(suggestion)}
                        >
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {departureLocation && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-sm flex justify-between items-center">
                    <div>
                      <strong>{departureLocation.name}</strong>
                      {departureLocation.country && ` (${departureLocation.country}${departureLocation.region ? `, ${departureLocation.region}` : ''})`}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDepartureLocation(null);
                        setDepartureLocationName('');
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                )}
                {errors.departureLocation && (
                  <p className="text-red-500 text-sm mt-1">{errors.departureLocation}</p>
                )}
              </div>
              
              {/* 日程 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-black">出発日</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-black rounded p-2 text-black bg-white"
                  />
                  {errors.startDate && (
                    <p className="text-red-500 text-sm mt-1">{errors.startDate}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1 text-black">帰国日</label>
                  <div>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      disabled={autoEndDate}
                      className="w-full border border-black rounded p-2 text-black bg-white"
                    />
                    <div className="flex items-center mt-2">
                      <input
                        type="checkbox"
                        id="autoEndDate"
                        checked={autoEndDate}
                        onChange={(e) => setAutoEndDate(e.target.checked)}
                        className="mr-2"
                      />
                      <label htmlFor="autoEndDate" className="text-sm text-black">自動計算</label>
                    </div>
                  </div>
                  {errors.endDate && (
                    <p className="text-red-500 text-sm mt-1">{errors.endDate}</p>
                  )}
                </div>
              </div>
              
              {/* 出発地に戻るオプション */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="returnToDeparture"
                  checked={returnToDeparture}
                  onChange={(e) => setReturnToDeparture(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="returnToDeparture" className="text-black">出発地に戻る</label>
              </div>
            </div>
          </div>
        )}
        
        {/* 希望地セクション */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-black">希望地</h3>
          
          {/* 希望地リスト */}
          {desiredLocations.length > 0 ? (
            <div className="mb-4 space-y-2">
              {desiredLocations.map((loc) => (
                <div key={loc.id} className="border rounded p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium">{loc.location.name}</div>
                      <div className="text-sm text-gray-600">
                        {loc.location.country && `${loc.location.country}`}
                        <span className="mx-2">•</span>
                        滞在: {formatDuration(loc.stayDuration)}
                        <span className="mx-2">•</span>
                        優先度: {loc.priority}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => handleEditLocation(loc)}
                        className="text-blue-500 hover:text-blue-700"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveLocation(loc.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">希望者: </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {loc.requesters.map(requesterId => {
                        const member = members.find(m => m.id === requesterId);
                        return member ? (
                          <span 
                            key={requesterId}
                            className="inline-block px-2 py-1 rounded-full text-xs"
                            style={{ 
                              backgroundColor: member.color,
                              color: '#fff'
                            }}
                          >
                            {member.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-4 p-4 border border-dashed rounded text-center text-gray-500">
              希望地が追加されていません
            </div>
          )}
          
          {errors.desiredLocations && (
            <p className="text-red-500 text-sm mb-2">{errors.desiredLocations}</p>
          )}
          
          {/* 希望地追加フォーム */}
          {members.length > 0 && (
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-3 text-black">
                {isEditingLocation ? '希望地を編集' : '新しい希望地を追加'}
              </h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-black">地名/施設名</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={newLocationName}
                      onChange={(e) => setNewLocationName(e.target.value)}
                      placeholder="例: パリ、東京ディズニーランド、シドニーオペラハウス"
                      className="w-full border border-black rounded p-2 text-black bg-white"
                      autoComplete="off"
                    />
                    {newLocationSuggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {newLocationSuggestions.map((suggestion, index) => (
                          <div 
                            key={index}
                            className="p-2 hover:bg-gray-100 cursor-pointer text-black"
                            onClick={() => handleNewLocationSelect(suggestion)}
                          >
                            {suggestion}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {errors.newLocation && (
                    <p className="text-red-500 text-sm mt-1">{errors.newLocation}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1 text-black">滞在時間</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">日</label>
                      <input
                        type="number"
                        min="0"
                        value={Math.floor(newLocationDuration / 24)}
                        onChange={(e) => {
                          const days = parseInt(e.target.value) || 0;
                          const hours = newLocationDuration % 24;
                          setNewLocationDuration(days * 24 + hours);
                        }}
                        className="w-full border border-black rounded p-2 text-black bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">時間</label>
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={newLocationDuration % 24}
                        onChange={(e) => {
                          const hours = parseInt(e.target.value) || 0;
                          const days = Math.floor(newLocationDuration / 24);
                          setNewLocationDuration(days * 24 + (hours % 24));
                        }}
                        className="w-full border border-black rounded p-2 text-black bg-white"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    合計: {formatDuration(newLocationDuration)}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1 text-black">優先度 ({newLocationPriority})</label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={newLocationPriority}
                    onChange={(e) => setNewLocationPriority(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs">
                    <span>低</span>
                    <span>高</span>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-black">希望者</label>
                    <button
                      type="button"
                      onClick={selectAllRequesters}
                      className="text-xs text-gray-600 underline"
                    >
                      全員選択
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 border border-black rounded p-2">
                    {members.map(member => (
                      <div 
                        key={member.id}
                        onClick={() => toggleRequester(member.id)}
                        className={`cursor-pointer px-3 py-1 rounded-full ${
                          newLocationRequesters.includes(member.id)
                            ? 'bg-black text-white'
                            : 'bg-gray-200'
                        }`}
                      >
                        {member.name}
                      </div>
                    ))}
                  </div>
                  {errors.newLocationRequesters && (
                    <p className="text-red-500 text-sm mt-1">{errors.newLocationRequesters}</p>
                  )}
                </div>
                
                {/* 追加/更新ボタン */}
                <div className="mt-4 flex space-x-2">
                  {isEditingLocation ? (
                    <>
                      <button
                        type="button"
                        onClick={handleUpdateLocation}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                      >
                        更新
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="flex-1 bg-gray-500 text-white py-2 rounded-lg font-medium hover:bg-gray-600 transition-colors"
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAddLocation()}
                      className="w-full bg-black text-white py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors"
                    >
                      希望地を追加
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* 送信ボタン */}
        <button
          type="submit"
          disabled={members.length === 0}
          className={`w-full py-3 rounded-lg font-medium text-lg transition-colors ${
            members.length > 0 
              ? 'bg-black text-white hover:bg-gray-800' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          ルートを生成
        </button>
      </form>
    </div>
  );
};

export default GroupTripForm; 