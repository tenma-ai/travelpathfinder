import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTripInfoByShareCode, startPolling } from '../services/tripShareService';
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
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddLocationForm, setShowAddLocationForm] = useState(false);
  const [debugInfo, setDebugInfo] = useState<Record<string, any>>({});
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  // タイマーIDを保持するためのref
  const retryTimerRef = useRef<number | null>(null);
  // ポーリング停止関数を保持するためのref
  const pollingStopRef = useRef<(() => void) | null>(null);

  // コンポーネントのクリーンアップ関数
  useEffect(() => {
    return () => {
      // コンポーネントのアンマウント時にタイマーをクリア
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
      }
      // ポーリングも停止
      if (pollingStopRef.current) {
        pollingStopRef.current();
        pollingStopRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // 以前のタイマーがあればクリアする
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const loadSharedTrip = async () => {
      if (!shareCode) {
        setError('共有コードが見つかりません');
        setLoading(false);
        return;
      }

      try {
        console.log(`共有コード「${shareCode}」の旅行情報を読み込み中...（試行回数: ${retryCount + 1}）`);
        setDebugInfo(prev => ({ 
          ...prev, 
          startTime: new Date().toISOString(),
          shareCode,
          userAgent: navigator.userAgent,
          retryCount: retryCount + 1
        }));
        
        // サーバーAPI＋ローカルストレージから旅行情報を取得（非同期）
        const tripData = await getTripInfoByShareCode(shareCode);
        
        if (!tripData) {
          console.error('共有データが見つかりません');
          
          // 最大リトライ回数に達していない場合は再試行
          if (retryCount < MAX_RETRIES - 1) { // 0-indexedなので-1する
            console.log(`再試行します (${retryCount + 1}/${MAX_RETRIES})...`);
            setRetryCount(prev => prev + 1);
            // 次のレンダリングサイクルで再試行が実行される
            return;
          }
          
          setError('指定された共有コードの旅行情報が見つかりませんでした');
          setLoading(false);
          setDebugInfo(prev => ({ 
            ...prev, 
            error: 'データなし', 
            endTime: new Date().toISOString(),
            finalRetryCount: retryCount + 1
          }));
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
        
        // 最適ルートが存在しない場合は生成する
        if (!tripData.generatedItinerary) {
          try {
            setRouteLoading(true);
            console.log('ルートが存在しないため、新しくルートを生成します');
            const optimizedRoute = await generateOptimalRoute(tripData);
            
            // 採用された希望地IDを抽出
            const adoptedLocationIds = optimizedRoute.locations
              .filter(loc => loc.originalRequesters.length > 0) // 希望地のみ（出発地/帰着地は除く）
              .map(loc => {
                // ItineraryLocationから対応するDesiredLocationのIDを見つける
                const matchingDesiredLocation = tripData.desiredLocations.find(desired =>
                  desired.location.name === loc.location.name &&
                  desired.location.coordinates[0] === loc.location.coordinates[0] &&
                  desired.location.coordinates[1] === loc.location.coordinates[1]
                );
                return matchingDesiredLocation?.id;
              })
              .filter(id => id !== undefined) as string[];
            
            tripData.generatedItinerary = optimizedRoute;
            tripData.adoptedLocationIds = adoptedLocationIds;
          } catch (routeError) {
            console.error('ルート生成中にエラーが発生しました:', routeError);
            // ルート生成に失敗してもTripInfoは表示できるようにする
          } finally {
            setRouteLoading(false);
          }
        }
        
        // デバッグ情報の更新
        setDebugInfo(prev => ({
          ...prev,
          dataReceived: true,
          tripName: tripData.name,
          tripId: tripData.id,
          locationsCount: tripData.desiredLocations?.length || 0,
          hasRoute: !!tripData.generatedItinerary,
          endTime: new Date().toISOString(),
          finalRetryCount: retryCount + 1
        }));
        
        setTripInfo(tripData);
        setLoading(false);
        
        // リアルタイム更新のためのポーリングを開始
        if (shareCode) {
          console.log('リアルタイム更新ポーリングを開始します');
          // 既存のポーリングがあれば停止
          if (pollingStopRef.current) {
            pollingStopRef.current();
          }
          
          // 新しいポーリングを開始
          pollingStopRef.current = startPolling(
            shareCode,
            (updatedTripInfo) => {
              console.log('リアルタイム更新を受信:', updatedTripInfo.lastUpdated);
              setTripInfo(updatedTripInfo);
            },
            10000 // 10秒間隔
          );
        }
      } catch (error) {
        console.error('共有旅行情報の読み込み中にエラーが発生しました:', error);
        
        // 最大リトライ回数に達していない場合は再試行
        if (retryCount < MAX_RETRIES - 1) { // 0-indexedなので-1する
          console.log(`エラーが発生したため再試行します (${retryCount + 1}/${MAX_RETRIES})...`);
          setRetryCount(prev => prev + 1);
          // 次のレンダリングサイクルで再試行が実行される
          return;
        }
        
        setError(`共有旅行情報の読み込み中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
        setLoading(false);
        
        // デバッグ情報の更新
        setDebugInfo(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : '不明なエラー',
          endTime: new Date().toISOString(),
          finalRetryCount: retryCount + 1
        }));
      }
    };

    loadSharedTrip();
  }, [shareCode, retryCount]); // retryCountを依存配列に追加

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
      setRouteLoading(true);
      // 最適ルートを再計算（非同期）
      const optimizedRoute = await generateOptimalRoute(updatedTripInfo);
      
      // 採用された希望地IDを抽出
      const adoptedLocationIds = optimizedRoute.locations
        .filter(loc => loc.originalRequesters.length > 0) // 希望地のみ（出発地/帰着地は除く）
        .map(loc => {
          // ItineraryLocationから対応するDesiredLocationのIDを見つける
          const matchingDesiredLocation = updatedTripInfo.desiredLocations.find(desired =>
            desired.location.name === loc.location.name &&
            desired.location.coordinates[0] === loc.location.coordinates[0] &&
            desired.location.coordinates[1] === loc.location.coordinates[1]
          );
          return matchingDesiredLocation?.id;
        })
        .filter(id => id !== undefined) as string[];
      
      // 旅行情報を更新
      setTripInfo({
        ...updatedTripInfo,
        generatedItinerary: optimizedRoute,
        adoptedLocationIds
      });
      
      // フォームを非表示
      setShowAddLocationForm(false);
    } catch (error) {
      console.error('ルート生成中にエラーが発生しました:', error);
      setError(`ルート生成中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setRouteLoading(false);
    }
  };

  /**
   * 再試行ボタン処理
   */
  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setRetryCount(0); // カウンターをリセット
    // サーバーからの応答を再取得
    console.log('共有データ再取得を試みます: ' + shareCode);

    // デバッグ情報をクリアして再取得
    setDebugInfo(prev => ({
      ...prev,
      retryAttempt: true,
      manualRetryTime: new Date().toISOString()
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-black mb-4"></div>
          <h2 className="text-xl mb-4">共有された旅行情報を読み込み中...</h2>
          <p className="text-gray-600">少々お待ちください</p>
          {retryCount > 0 && (
            <p className="text-gray-500 mt-2">再試行中 ({retryCount + 1}/{MAX_RETRIES})</p>
          )}
        </div>
      </div>
    );
  }

  if (routeLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-black mb-4"></div>
          <h2 className="text-xl mb-4">最適な旅行ルートを計算中...</h2>
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
          
          <div className="mt-6 flex flex-col space-y-3">
            <button
              onClick={handleRetry}
              className="w-full bg-black text-white py-2 rounded hover:bg-gray-800"
            >
              再試行する
            </button>
            <button
              onClick={handleBackToHome}
              className="w-full border border-black text-black py-2 rounded hover:bg-gray-100"
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