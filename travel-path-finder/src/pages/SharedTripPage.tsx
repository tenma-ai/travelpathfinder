import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTripInfoByShareCode, getTripInfoByShareCodeAsync } from '../services/tripShareService';
import { generateOptimalRoute } from '../services/routeOptimizationService';
import ItineraryResult from '../components/ItineraryResult';
import AddTripLocationForm from '../components/AddTripLocationForm';
import LoadingSpinner from '../components/LoadingSpinner';
import type { TripInfo } from '../types';

/**
 * 共有された旅行の表示と編集を行うページ
 * クラウドストレージ対応版
 */
const SharedTripPage = () => {
  const { shareCode = '' } = useParams<{ shareCode: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [tripInfo, setTripInfo] = useState<TripInfo | null>(null);
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
        
        // 共有コードからデータを取得（非同期版を使用）
        const loadedTripInfo = await getTripInfoByShareCodeAsync(shareCode);
        
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

  // ローディング表示
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <LoadingSpinner size="large" />
        <p className="mt-4 text-lg">旅行情報を読み込んでいます...</p>
      </div>
    );
  }

  // 旅行情報がない場合
  if (!tripInfo) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-6 rounded-lg shadow-md text-center">
          <h2 className="text-2xl font-bold mb-4">旅行情報が見つかりませんでした</h2>
          <p className="mb-6">指定された共有コードの旅行情報を取得できませんでした。</p>
          <button
            onClick={handleBackToHome}
            className="px-4 py-2 bg-black text-white rounded"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  // 旅程が生成されている場合は結果を表示
  if (tripInfo.generatedItinerary) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto p-4">
          <header className="flex justify-between items-center mb-6">
            <button
              onClick={handleEditButton}
              className="px-4 py-2 border border-black rounded"
            >
              修正する
            </button>
            <h1 className="text-2xl font-bold">{tripInfo.name}</h1>
            <button
              onClick={handleBackToHome}
              className="px-4 py-2 bg-black text-white rounded"
            >
              ホームに戻る
            </button>
          </header>
          
          <ItineraryResult tripInfo={tripInfo} onReset={handleReset} />
        </div>
      </div>
    );
  }

  // 追加地点フォームが表示されている場合
  if (showAddLocationForm) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto p-4">
          <header className="flex justify-between items-center mb-6">
            <button
              onClick={handleEditButton}
              className="px-4 py-2 border border-black rounded"
            >
              戻る
            </button>
            <h1 className="text-2xl font-bold">希望地点を追加</h1>
            <button
              onClick={handleBackToHome}
              className="px-4 py-2 bg-black text-white rounded"
            >
              ホームに戻る
            </button>
          </header>
          
          <AddTripLocationForm tripInfo={tripInfo} onSubmit={handleFormSubmit} />
        </div>
      </div>
    );
  }

  // 旅行情報のみ表示（まだ旅程は生成されていない）
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4">
        <header className="flex justify-between items-center mb-6">
          <button
            onClick={handleBackToHome}
            className="px-4 py-2 border border-black rounded"
          >
            戻る
          </button>
          <h1 className="text-2xl font-bold">{tripInfo.name}</h1>
          <div></div> {/* 空のdivでフレックスレイアウトを整える */}
        </header>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">旅行情報</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-bold mb-2">基本情報</h3>
              <p><span className="font-medium">出発地:</span> {tripInfo.departureLocation.name}</p>
              <p><span className="font-medium">開始日:</span> {tripInfo.startDate.toLocaleDateString()}</p>
              {tripInfo.endDate && (
                <p><span className="font-medium">終了日:</span> {tripInfo.endDate.toLocaleDateString()}</p>
              )}
            </div>
            
            <div>
              <h3 className="font-bold mb-2">メンバー ({tripInfo.members.length}人)</h3>
              <ul>
                {tripInfo.members.map(member => (
                  <li key={member.id} className="flex items-center mb-1">
                    <span 
                      className="w-4 h-4 rounded-full mr-2" 
                      style={{ backgroundColor: member.color }}
                    ></span>
                    {member.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="mt-6">
            <h3 className="font-bold mb-2">
              希望地点 ({tripInfo.desiredLocations.length}箇所)
            </h3>
            {tripInfo.desiredLocations.length > 0 ? (
              <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tripInfo.desiredLocations.map(location => (
                  <li key={location.id} className="border border-gray-200 rounded p-3">
                    <div className="font-medium">{location.location.name}</div>
                    <div className="text-sm text-gray-600">
                      {location.requesters.map((memberId: string) => {
                        const member = tripInfo.members.find(m => m.id === memberId);
                        return member ? (
                          <span 
                            key={memberId}
                            className="inline-block w-3 h-3 rounded-full mr-1" 
                            style={{ backgroundColor: member.color }}
                            title={member.name}
                          ></span>
                        ) : null;
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">まだ希望地点はありません。</p>
            )}
          </div>
          
          <div className="mt-8 flex justify-center">
            <button
              onClick={handleAddLocation}
              className="px-6 py-3 bg-black text-white rounded-lg shadow hover:shadow-md transition-shadow"
            >
              希望地点を追加する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedTripPage; 