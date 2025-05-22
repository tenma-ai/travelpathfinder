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
  const [isEditMode, setIsEditMode] = useState(false);
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
        
        const loadedTripInfo = getTripInfoByShareCode(shareCode);
        setDebugInfo(prev => ({ 
          ...prev, 
          hasLocalStorage: typeof localStorage !== 'undefined',
          tripFound: !!loadedTripInfo,
          shareCode 
        }));
        
        if (loadedTripInfo) {
          console.log('SharedTripPage: 旅行情報の取得成功', loadedTripInfo);
          
          // 必須フィールドの検証
          if (!loadedTripInfo.departureLocation || !loadedTripInfo.startDate) {
            throw new Error('共有された旅行データに必須情報が含まれていません');
          }
          
          setTripInfo(loadedTripInfo);
          setError(null);
        } else {
          console.error(`SharedTripPage: 共有コード「${shareCode}」に対応する旅行情報が見つかりませんでした`);
          setError('指定された共有コードの旅行情報が見つかりませんでした。正しい共有コードであることを確認してください。');
        }
      } catch (err) {
        console.error('SharedTripPage: 旅行情報の取得中にエラーが発生しました', err);
        setError(`旅行情報の取得中にエラーが発生しました: ${err instanceof Error ? err.message : '不明なエラー'}`);
        
        // デバッグ情報を追加
        setDebugInfo(prev => ({ 
          ...prev, 
          errorMessage: err instanceof Error ? err.message : '不明なエラー',
          errorStack: err instanceof Error ? err.stack : undefined 
        }));
      } finally {
        setLoading(false);
      }
    };
    
    loadSharedTrip();
  }, [shareCode]);

  // 希望地を追加するフォームを表示
  const handleAddLocation = () => {
    setShowAddLocationForm(true);
    setIsEditMode(false);
  };

  // 編集モードの切り替え
  const handleToggleEditMode = () => {
    setIsEditMode(!isEditMode);
    setShowAddLocationForm(false);
  };

  // フォーム送信処理
  const handleFormSubmit = (formData: TripInfo) => {
    setLoading(true);
    
    try {
      console.log('SharedTripPage: 旅程生成開始', formData);
      const itinerary = generateOptimalRoute(formData);
      
      const updatedTripInfo = {
        ...formData,
        generatedItinerary: itinerary
      };
      
      console.log('SharedTripPage: 旅程生成完了', updatedTripInfo);
      setTripInfo(updatedTripInfo);
      setShowAddLocationForm(false);
      setIsEditMode(false);
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
        <p className="ml-4 text-lg">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <h2 className="text-2xl font-bold text-red-500 mb-4">エラー</h2>
            <p className="text-lg mb-6">{error}</p>
            <div className="mb-8 p-4 bg-gray-100 rounded-lg text-left overflow-auto">
              <h3 className="font-bold mb-2">デバッグ情報:</h3>
              <p>共有コード: {shareCode || 'なし'}</p>
              <p>ブラウザ: {navigator.userAgent}</p>
              <p>ローカルストレージが利用可能: {typeof localStorage !== 'undefined' ? 'はい' : 'いいえ'}</p>
              {debugInfo.errorMessage && <p>エラー詳細: {debugInfo.errorMessage}</p>}
              {debugInfo.errorStack && (
                <details>
                  <summary>スタックトレース</summary>
                  <pre className="text-xs mt-2 whitespace-pre-wrap">{debugInfo.errorStack}</pre>
                </details>
              )}
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

  if (!tripInfo) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <h2 className="text-2xl font-bold mb-4">旅行情報が見つかりません</h2>
            <p className="mb-6">共有コード「{shareCode}」に対応する旅行情報が見つかりませんでした。正しい共有コードであることを確認してください。</p>
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

  // ヘッダーボタンの表示とイベント処理を決定
  const renderHeaderButton = () => {
    if (showAddLocationForm) {
      return (
        <button
          onClick={() => setShowAddLocationForm(false)}
          className="mb-6 flex items-center text-gray-600 hover:text-black"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          旅行計画に戻る
        </button>
      );
    } else if (isEditMode) {
      return (
        <button
          onClick={() => setIsEditMode(false)}
          className="mb-6 flex items-center text-gray-600 hover:text-black"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          編集をキャンセル
        </button>
      );
    } else {
      return (
        <div className="flex items-center mb-6 gap-4">
          <button
            onClick={handleToggleEditMode}
            className="flex items-center text-gray-600 hover:text-black"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            修正する
          </button>
          <button
            onClick={handleBackToHome}
            className="flex items-center text-gray-600 hover:text-black ml-4"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
            ホームに戻る
          </button>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {renderHeaderButton()}

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
        ) : isEditMode ? (
          tripInfo.tripType === 'solo' ? (
            <SoloTripForm
              onSubmit={handleFormSubmit}
              initialTripInfo={tripInfo}
            />
          ) : (
            <GroupTripForm
              onSubmit={handleFormSubmit}
              initialTripInfo={tripInfo}
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