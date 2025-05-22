import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SoloTripForm from '../components/trip/SoloTripForm';
import ResultView from '../components/trip/ResultView';
import type { TripInfo } from '../types';
import { generateOptimalRoute } from '../utils/routeOptimizer';

/**
 * 一人旅ページ
 */
const SoloTripPage = () => {
  const navigate = useNavigate();
  const STORAGE_KEY = 'soloTripLast';
  const [loading, setLoading] = useState(false);
  const [tripInfo, setTripInfo] = useState<TripInfo | null>(null);
  const [showAddLocationForm, setShowAddLocationForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  
  // 初回ロード時に保存された旅程を復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: TripInfo = JSON.parse(saved);
        // Date fields rehydrate
        if (parsed.startDate) parsed.startDate = new Date(parsed.startDate);
        if (parsed.endDate) parsed.endDate = new Date(parsed.endDate);
        if (parsed.lastUpdated) parsed.lastUpdated = new Date(parsed.lastUpdated);
        setTripInfo(parsed);
      }
    } catch {}
  }, []);
  
  // 旅程生成処理
  const handleFormSubmit = async (formData: TripInfo) => {
    setLoading(true);
    
    try {
      // 実際のアプリではAPI経由で生成するが、現在はフロントエンドで計算
      // const itinerary = await generateOptimalRouteWithAI(formData);
      
      // 最適ルートをフロントエンドで計算
      const itinerary = generateOptimalRoute(formData);
      
      const updatedTripInfo = {
        ...formData,
        generatedItinerary: itinerary
      };
      
      setTripInfo(updatedTripInfo);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedTripInfo));
      } catch {}
      setShowAddLocationForm(false); // 希望地追加後は結果画面に戻る
      setShowEditForm(false); // プラン編集後は結果画面に戻る
    } catch (error) {
      console.error('Failed to generate itinerary:', error);
      alert('旅程の生成に失敗しました。入力内容を確認してください。');
    } finally {
      setLoading(false);
    }
  };
  
  // リセット処理
  const handleReset = () => {
    setTripInfo(null);
    setShowAddLocationForm(false);
    setShowEditForm(false);
    try { localStorage.removeItem(STORAGE_KEY);} catch {}
  };
  
  // 希望地を追加するフォームを表示
  const handleAddLocation = () => {
    setShowAddLocationForm(true);
  };
  
  // 希望地追加フォームを閉じる
  const handleCloseAddLocationForm = () => {
    setShowAddLocationForm(false);
  };
  
  // プラン編集画面を表示
  const handleEditPlan = () => {
    setShowEditForm(true);
  };
  
  // ホームに戻る
  const handleBackToHome = () => {
    navigate('/');
  };
  
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={
            showAddLocationForm 
              ? handleCloseAddLocationForm 
              : showEditForm 
                ? () => setShowEditForm(false) 
                : tripInfo && tripInfo.generatedItinerary 
                  ? handleEditPlan 
                  : handleBackToHome
          }
          className="mb-6 flex items-center text-gray-600 hover:text-black"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          {showAddLocationForm ? "旅行計画に戻る" : 
           showEditForm ? "旅行計画に戻る" :
           tripInfo && tripInfo.generatedItinerary ? "修正する" : "ホームに戻る"}
        </button>
        
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
            <p className="ml-4 text-lg">旅程を生成中...</p>
          </div>
        ) : showAddLocationForm && tripInfo ? (
          <SoloTripForm 
            onSubmit={handleFormSubmit} 
            initialTripInfo={tripInfo}
            isAddingLocation={true}
          />
        ) : showEditForm && tripInfo ? (
          <SoloTripForm 
            onSubmit={handleFormSubmit} 
            initialTripInfo={tripInfo}
          />
        ) : tripInfo && tripInfo.generatedItinerary ? (
          <ResultView 
            tripInfo={tripInfo} 
            onReset={handleReset}
            onAddLocation={handleAddLocation}
          />
        ) : (
          <SoloTripForm onSubmit={handleFormSubmit} />
        )}
      </div>
    </div>
  );
};

export default SoloTripPage; 