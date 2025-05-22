import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTripInfoByShareCode } from '../services/tripShareService';
import type { TripInfo } from '../types';
import ResultView from '../components/trip/ResultView';
import SoloTripForm from '../components/trip/SoloTripForm';
import GroupTripForm from '../components/trip/GroupTripForm';
import { generateOptimalRoute } from '../utils/routeOptimizer';

/**
 * 共有された旅行ページ
 */
const SharedTripPage = () => {
  const { shareCode } = useParams<{ shareCode: string }>();
  const navigate = useNavigate();
  const [tripInfo, setTripInfo] = useState<TripInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddLocationForm, setShowAddLocationForm] = useState(false);
  const [debugInfo, setDebugInfo] = useState<Record<string, any>>({});

  useEffect(() => {
    const loadSharedTrip = async () => {
      if (!shareCode) {
        setError('共有コードが見つかりません');
        setLoading(false);
        return;
      }

      try {
        console.log(`共有コード「${shareCode}」の旅行情報を読み込み中...`);
        setDebugInfo(prev => ({ ...prev, startTime: new Date().toISOString() }));
        
        // サーバーAPI＋ローカルストレージから旅行情報を取得（非同期）
        const tripData = await getTripInfoByShareCode(shareCode);
        
        if (!tripData) {
          console.error('共有データが見つかりません');
          setError('指定された共有コードの旅行情報が見つかりませんでした');
          setLoading(false);
          setDebugInfo(prev => ({ ...prev, error: 'データなし', endTime: new Date().toISOString() }));
          return;
        }
        
        console.log('共有旅行情報を読み込みました:', tripData);
        
        // 日付の復元（文字列からDateオブジェクトへ）
        if (typeof tripData.startDate === 'string') {
          tripData.startDate = new Date(tripData.startDate);
        }
        
        if (tripData.endDate && typeof tripData.endDate === 'string') {
          tripData.endDate = new Date(tripData.endDate);
        }
        
        // デバッグ情報の更新
        setDebugInfo(prev => ({
          ...prev,
          dataReceived: true,
          tripName: tripData.name,
          tripId: tripData.id,
          locationsCount: tripData.desiredLocations?.length || 0,
          endTime: new Date().toISOString()
        }));
        
        setTripInfo(tripData);
        setLoading(false);
      } catch (error) {
        console.error('共有旅行情報の読み込み中にエラーが発生しました:', error);
        setError(`共有旅行情報の読み込み中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
        setLoading(false);
        
        // デバッグ情報の更新
        setDebugInfo(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : '不明なエラー',
          endTime: new Date().toISOString()
        }));
      }
    };

    loadSharedTrip();
  }, [shareCode]);

  /**
   * ホームに戻る
   */
  const handleBackToHome = () => {
    navigate('/');
  };

  /**
   * 希望地追加フォームを表示
   */
  const handleShowAddLocationForm = () => {
    setShowAddLocationForm(true);
  };

  /**
   * 希望地を追加して再計算
   */
  const handleAddLocation = async (updatedTripInfo: TripInfo) => {
    try {
      // 最適ルートを再計算（非同期）
      const optimizedRoute = await generateOptimalRoute(updatedTripInfo);
      
      // 旅行情報を更新
      setTripInfo({
        ...updatedTripInfo,
        generatedItinerary: optimizedRoute
      });
      
      // フォームを非表示
      setShowAddLocationForm(false);
    } catch (error) {
      console.error('ルート生成中にエラーが発生しました:', error);
      setError(`ルート生成中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-black mb-4"></div>
          <h2 className="text-xl mb-4">共有された旅行情報を読み込み中...</h2>
          <p className="text-gray-600">少々お待ちください</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold mb-4 text-red-600">エラーが発生しました</h2>
          <p className="mb-6 text-gray-700">{error}</p>
          
          {/* デバッグ情報（開発中のみ表示） */}
          <div className="mb-6 p-4 bg-gray-100 rounded-md text-xs">
            <h3 className="font-bold mb-2">デバッグ情報:</h3>
            <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
            <p className="mt-2">共有コード: {shareCode}</p>
            <p>ブラウザ: {navigator.userAgent}</p>
          </div>
          
          <div className="mt-6">
            <button
              onClick={handleBackToHome}
              className="w-full bg-black text-white py-2 rounded hover:bg-gray-800"
            >
              ホームに戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!tripInfo) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold mb-4">旅行情報が見つかりません</h2>
          <p className="mb-6 text-gray-700">指定された共有コードの旅行情報を取得できませんでした。</p>
          <div className="mt-6">
            <button
              onClick={handleBackToHome}
              className="w-full bg-black text-white py-2 rounded hover:bg-gray-800"
            >
              ホームに戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 希望地追加フォームの表示
  if (showAddLocationForm) {
    if (tripInfo.tripType === 'solo') {
      return (
        <SoloTripForm
          initialTripInfo={tripInfo}
          onSubmit={handleAddLocation}
          isAddingLocation={true}
        />
      );
    } else {
      return (
        <GroupTripForm
          initialTripInfo={tripInfo}
          onSubmit={handleAddLocation}
          isAddingLocation={true}
        />
      );
    }
  }

  // 旅行計画の結果表示
  return (
    <div className="container mx-auto p-4 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <ResultView
          tripInfo={tripInfo}
          onReset={handleBackToHome}
          onAddLocation={handleShowAddLocationForm}
        />
      </div>
    </div>
  );
};

export default SharedTripPage; 