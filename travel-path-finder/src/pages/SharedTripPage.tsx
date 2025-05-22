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

  // 共有コードから旅行情報を取得
  useEffect(() => {
    const loadSharedTrip = async () => {
      if (!shareCode) {
        console.error('SharedTripPage: 共有コードがありません');
        setError('共有コードが指定されていません。URLを確認してください。');
        setLoading(false);
        return;
      }
      
      console.log(`SharedTripPage: 共有コード「${shareCode}」で読み込み開始`);
      setLoading(true);
      
      try {
        // LocalStorageが利用可能か確認
        if (typeof localStorage === 'undefined') {
          throw new Error('ブラウザのLocalStorageが利用できません');
        }
        
        // デバッグ情報を更新
        setDebugInfo(prev => ({ 
          ...prev, 
          shareCode,
          shareCodeLength: shareCode.length,
          loadStartTime: new Date().toISOString(),
          navigator: navigator?.userAgent,
          hasLocalStorage: typeof localStorage !== 'undefined'
        }));
        
        // 共有コードからデータを取得
        const loadedTripInfo = getTripInfoByShareCode(shareCode);
        
        setDebugInfo(prev => ({ 
          ...prev, 
          tripFound: !!loadedTripInfo,
          loadEndTime: new Date().toISOString(),
          tripInfoType: loadedTripInfo ? typeof loadedTripInfo : 'null'
        }));
        
        if (loadedTripInfo) {
          console.log('SharedTripPage: 旅行情報の取得成功', loadedTripInfo);
          
          // 追加のデバッグ情報
          setDebugInfo(prev => ({ 
            ...prev, 
            tripType: loadedTripInfo.tripType,
            hasMembers: !!loadedTripInfo.members && loadedTripInfo.members.length > 0,
            hasLocation: !!loadedTripInfo.departureLocation,
            hasDate: !!loadedTripInfo.startDate,
            loadedAt: new Date().toISOString()
          }));
          
          // 必須フィールドの検証
          if (!loadedTripInfo.departureLocation || !loadedTripInfo.startDate) {
            throw new Error('共有された旅行データに必須情報が含まれていません');
          }
          
          // 日付型の確認と修正
          if (!(loadedTripInfo.startDate instanceof Date)) {
            loadedTripInfo.startDate = new Date(loadedTripInfo.startDate);
          }
          
          if (loadedTripInfo.endDate && !(loadedTripInfo.endDate instanceof Date)) {
            loadedTripInfo.endDate = new Date(loadedTripInfo.endDate);
          }
          
          setTripInfo(loadedTripInfo);
          setError(null);
        } else {
          console.error(`SharedTripPage: 共有コード「${shareCode}」に対応する旅行情報が見つかりませんでした`);
          setError('指定された共有コードの旅行情報が見つかりませんでした。正しい共有コードであることを確認してください。');
        }
      } catch (err) {
        console.error('SharedTripPage: 旅行情報の取得中にエラーが発生しました', err);
        
        // 詳細なデバッグ情報を追加
        setDebugInfo(prev => ({ 
          ...prev, 
          errorMessage: err instanceof Error ? err.message : '不明なエラー',
          errorName: err instanceof Error ? err.name : 'Unknown',
          errorStack: err instanceof Error ? err.stack : undefined,
          errorTime: new Date().toISOString()
        }));
        
        setError(`旅行情報の取得中にエラーが発生しました: ${err instanceof Error ? err.message : '不明なエラー'}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadSharedTrip();
  }, [shareCode]);

  // 希望地を追加するフォームを表示
  const handleAddLocation = () => {
    setShowAddLocationForm(true);
  };

  // フォーム送信処理
  const handleFormSubmit = async (formData: TripInfo) => {
    setLoading(true);
    
    try {
      console.log('SharedTripPage: 旅程生成開始', formData);
      const itinerary = await generateOptimalRoute(formData);
      
      const updatedTripInfo = {
        ...formData,
        generatedItinerary: itinerary
      };
      
      console.log('SharedTripPage: 旅程生成完了', updatedTripInfo);
      setTripInfo(updatedTripInfo);
      setShowAddLocationForm(false);
    } catch (error) {
      console.error('SharedTripPage: 旅程生成失敗', error);
      setError(`旅程の生成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setLoading(false);
    }
  };

  // ホームに戻る
  const handleBackToHome = () => {
    navigate('/');
  };

  // リセット処理（結果画面から入力フォームに戻る）
  const handleReset = () => {
    if (tripInfo) {
      console.log('SharedTripPage: 旅程をリセット');
      setTripInfo({
        ...tripInfo,
        generatedItinerary: undefined
      });
    }
  };

  // 左上の「修正する」ボタンの処理
  const handleEditButton = () => {
    if (showAddLocationForm) {
      // 「追加地点」モードの場合は通常の旅行計画に戻る
      setShowAddLocationForm(false);
    } else if (tripInfo?.generatedItinerary) {
      // 旅程が生成されている場合は、編集モードに切り替え
      handleReset();
    } else {
      // それ以外の場合はホームに戻る
      handleBackToHome();
    }
  };

  // エラーページの表示
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-red-500 mb-4">エラー</h2>
            <p className="text-lg mb-6">{error}</p>
            <div className="mb-8 p-4 bg-gray-100 rounded-lg text-left overflow-auto">
              <h3 className="font-bold mb-2">デバッグ情報:</h3>
              <p>共有コード: {shareCode || 'なし'} (長さ: {shareCode?.length})</p>
              <p>ブラウザ: {navigator.userAgent}</p>
              <p>ローカルストレージが利用可能: {typeof localStorage !== 'undefined' ? 'はい' : 'いいえ'}</p>
              <p>エラー発生時刻: {debugInfo.errorTime || '不明'}</p>
              
              {Object.entries(debugInfo).map(([key, value]) => 
                key !== 'errorStack' && (
                  <p key={key}>{key}: {value?.toString ? value.toString() : JSON.stringify(value)}</p>
                )
              )}
              
              {debugInfo.errorStack && (
                <details>
                  <summary className="cursor-pointer text-blue-600 underline">スタックトレース (クリックして表示)</summary>
                  <pre className="text-xs mt-2 whitespace-pre-wrap p-2 bg-gray-800 text-white rounded">{debugInfo.errorStack}</pre>
                </details>
              )}
            </div>
            <div className="flex justify-between">
              <button
                onClick={handleBackToHome}
                className="px-4 py-2 bg-black text-white rounded"
              >
                ホームに戻る
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 border border-black rounded"
              >
                再読み込み
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ロード中の表示
  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black mb-4"></div>
        <p className="text-lg">読み込み中...</p>
        <p className="text-sm text-gray-500 mt-2">共有コード: {shareCode}</p>
      </div>
    );
  }

  // 旅行情報が見つからない場合
  if (!tripInfo) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <h2 className="text-2xl font-bold mb-4 text-red-500">旅行情報が見つかりません</h2>
            <p className="mb-6">共有コード「{shareCode}」に対応する旅行情報が見つかりませんでした。</p>
            <p className="mb-6 text-sm text-gray-600">
              リンクが切れている可能性があります。正しい共有コードであることを確認してください。
            </p>
            
            <div className="mb-6 p-4 bg-gray-100 rounded-lg text-left">
              <h3 className="font-bold mb-2">確認事項:</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>URLが正しくコピーされているか確認してください</li>
                <li>共有リンクが期限切れになっていないか確認してください</li>
                <li>ブラウザのLocalStorageが有効になっているか確認してください</li>
              </ul>
            </div>
            
            <button
              onClick={handleBackToHome}
              className="px-4 py-2 bg-black text-white rounded"
            >
              ホームに戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 正常な表示
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={handleEditButton}
          className="mb-6 flex items-center text-gray-600 hover:text-black"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          {showAddLocationForm ? "旅行計画に戻る" : tripInfo.generatedItinerary ? "修正する" : "戻る"}
        </button>

        {showAddLocationForm && tripInfo ? (
          tripInfo.tripType === 'solo' ? (
            <SoloTripForm
              onSubmit={handleFormSubmit}
              initialTripInfo={tripInfo}
              isAddingLocation={true}
            />
          ) : (
            <GroupTripForm
              onSubmit={handleFormSubmit}
              initialTripInfo={tripInfo}
              isAddingLocation={true}
            />
          )
        ) : tripInfo.generatedItinerary ? (
          <ResultView
            tripInfo={tripInfo}
            onReset={handleReset}
            onAddLocation={handleAddLocation}
          />
        ) : tripInfo.tripType === 'solo' ? (
          <SoloTripForm
            onSubmit={handleFormSubmit}
            initialTripInfo={tripInfo}
          />
        ) : (
          <GroupTripForm
            onSubmit={handleFormSubmit}
            initialTripInfo={tripInfo}
          />
        )}
      </div>
    </div>
  );
};

export default SharedTripPage; 