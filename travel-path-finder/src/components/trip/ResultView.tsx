import { useState } from 'react';
import type { Itinerary, TripInfo } from '../../types';
import MapView from './MapView';
import VisualFlow from './VisualFlow';
import CalendarView from './CalendarView';
import { shareTripInfo, shareToServer } from '../../services/tripShareService';

interface ResultViewProps {
  tripInfo: TripInfo;
  onReset: () => void;
  onAddLocation?: () => void; // 希望地追加画面への遷移ハンドラ
}

/**
 * 旅程結果表示コンポーネント
 */
const ResultView = ({ tripInfo, onReset, onAddLocation }: ResultViewProps) => {
  const { generatedItinerary } = tripInfo;
  const members = tripInfo.members; // メンバー情報を取得
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMethod, setShareMethod] = useState<'code' | 'url'>('code');
  const [copyMessage, setCopyMessage] = useState<string>('');
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  
  if (!generatedItinerary) {
    return (
      <div className="text-center p-8">
        <p className="text-xl">結果が見つかりませんでした。</p>
        <button 
          onClick={onReset}
          className="mt-4 bg-black text-white px-4 py-2 rounded"
        >
          戻る
        </button>
      </div>
    );
  }
  
  /**
   * 共有コードを生成する
   */
  const handleShare = async () => {
    try {
      setIsSharing(true);
      console.log('ResultView: 共有処理開始', { tripName: tripInfo.name });
      
      // 1. 優先: サーバーレスAPIを使用した共有（より信頼性が高い）
      try {
        const code = await shareToServer(tripInfo);
        setShareCode(code);
        
        // 共有用URLを生成（コード方式）
        const baseUrl = window.location.origin;
        const shareUrl = `${baseUrl}/shared/${code}`;
        setShareUrl(shareUrl);
        console.log('サーバーレス共有成功:', { code, shareUrl });
      } catch (serverError) {
        console.error('サーバーレス共有失敗:', serverError);
        
        // 2. フォールバック: 従来の共有コード方式（ローカルストレージ）
        const code = shareTripInfo(tripInfo);
        setShareCode(code);
        
        // 共有用URLを生成（コード方式）
        const baseUrl = window.location.origin;
        const shareUrl = `${baseUrl}/shared/${code}`;
        setShareUrl(shareUrl);
        console.log('ローカル共有にフォールバック:', { code, shareUrl });
      }
      
      setShareError(null);
      console.log('ResultView: 共有処理完了');
      setIsShareModalOpen(true);
    } catch (error) {
      console.error('ResultView: 共有処理エラー', error);
      setShareError(`共有の処理中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
      setIsShareModalOpen(true);
    } finally {
      setIsSharing(false);
    }
  };
  
  /**
   * 共有コードをクリップボードにコピーする
   */
  const handleCopyCode = () => {
    if (shareCode) {
      try {
        navigator.clipboard.writeText(shareCode);
        setCopyMessage('共有コードをコピーしました');
        setTimeout(() => setCopyMessage(null), 2000);
      } catch (error) {
        console.error('ResultView: コピーエラー', error);
        setCopyMessage('コピーに失敗しました。手動でコピーしてください。');
      }
    }
  };
  
  /**
   * 共有URLをクリップボードにコピーする
   */
  const handleCopyUrl = () => {
    if (shareMethod === 'url' && shareUrl) {
      try {
        navigator.clipboard.writeText(shareUrl);
        setCopyMessage('共有URLをコピーしました');
        setTimeout(() => setCopyMessage(null), 2000);
      } catch (error) {
        console.error('ResultView: URLコピーエラー', error);
        setCopyMessage('URLのコピーに失敗しました。手動でコピーしてください。');
      }
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* ヘッダー */}
      <div className="p-4 border-b">
        {tripInfo.name && (
          <h1 className="text-3xl font-bold mb-2 text-black">{tripInfo.name}</h1>
        )}
        <h2 className="text-2xl font-bold">最適旅行ルート</h2>
        <p className="text-gray-600">
          {generatedItinerary.locations.length}箇所 • 
          {Math.ceil((new Date(generatedItinerary.locations[generatedItinerary.locations.length - 1].departureDate).getTime() - 
            new Date(generatedItinerary.locations[0].arrivalDate).getTime()) / (1000 * 60 * 60 * 24))}日間
        </p>
      </div>
      
      {/* 希望地の採用状況 */}
      {tripInfo.desiredLocations.length > 0 && (
        <div className="p-4 border-b bg-gray-50">
          <h3 className="text-lg font-bold mb-3 text-black">希望地の採用状況</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 採用された希望地 */}
            <div>
              <h4 className="font-semibold text-green-700 mb-2">✅ 採用された希望地 ({tripInfo.adoptedLocationIds?.length || 0}箇所)</h4>
              <div className="space-y-2">
                {tripInfo.desiredLocations
                  .filter(loc => tripInfo.adoptedLocationIds?.includes(loc.id))
                  .map(loc => (
                    <div key={loc.id} className="bg-green-50 border border-green-200 rounded p-2">
                      <div className="font-medium text-green-800">{loc.location.name}</div>
                      <div className="text-sm text-green-600">
                        希望者: {loc.requesters.map(id => 
                          members.find(m => m.id === id)?.name || id
                        ).join(', ')}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
            
            {/* 採用されなかった希望地 */}
            <div>
              <h4 className="font-semibold text-red-700 mb-2">❌ 採用されなかった希望地 ({tripInfo.desiredLocations.length - (tripInfo.adoptedLocationIds?.length || 0)}箇所)</h4>
              <div className="space-y-2">
                {tripInfo.desiredLocations
                  .filter(loc => !tripInfo.adoptedLocationIds?.includes(loc.id))
                  .map(loc => (
                    <div key={loc.id} className="bg-red-50 border border-red-200 rounded p-2">
                      <div className="font-medium text-red-800">{loc.location.name}</div>
                      <div className="text-sm text-red-600">
                        希望者: {loc.requesters.map(id => 
                          members.find(m => m.id === id)?.name || id
                        ).join(', ')} • 優先度: {loc.priority}
                      </div>
                    </div>
                  ))}
                {tripInfo.desiredLocations.length - (tripInfo.adoptedLocationIds?.length || 0) === 0 && (
                  <div className="text-gray-500 italic">すべての希望地が採用されました！</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* コンテンツセクション - 縦に並べる */}
      <div className="flex flex-col space-y-6 p-4">
        {/* マップビュー */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-lg font-bold mb-4 text-black">マップビュー</h3>
          <div className="h-[400px]">
            <MapView itinerary={generatedItinerary} members={members} />
          </div>
        </div>
        
        {/* ビジュアルフロー */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-lg font-bold mb-4 text-black">ビジュアルフロー</h3>
          <div className="h-[400px]">
            <VisualFlow itinerary={generatedItinerary} members={members} />
          </div>
        </div>
        
        {/* カレンダービュー */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-lg font-bold mb-4 text-black">カレンダー</h3>
          <div className="h-[400px]">
            <CalendarView itinerary={generatedItinerary} members={members} />
          </div>
        </div>
      </div>
      
      {/* アクションボタン */}
      <div className="p-4 border-t flex justify-between">
        <button 
          onClick={onReset}
          className="px-4 py-2 border border-black rounded"
        >
          ホームへ戻る
        </button>
        
        <div className="flex space-x-2">
          <button 
            className="px-4 py-2 bg-black text-white rounded flex items-center"
            onClick={handleShare}
            disabled={isSharing}
          >
            {isSharing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                共有中...
              </>
            ) : (
              '共有する'
            )}
          </button>
          
          {onAddLocation && (
            <button 
              className="px-4 py-2 bg-black text-white rounded"
              onClick={onAddLocation}
            >
              希望地を追加
            </button>
          )}
        </div>
      </div>
      
      {/* 共有モーダル */}
      {isShareModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-xl font-bold mb-4 text-black">旅行を共有</h3>
            
            {shareError ? (
              <div className="mb-4 p-4 bg-red-100 rounded-lg text-red-700">
                <p className="font-bold">エラーが発生しました</p>
                <p>{shareError}</p>
              </div>
            ) : (
              <>
                <p className="mb-4 text-black">以下の共有方法から選択して、友人や家族に送信してください。</p>
                
                <div className="mb-4">
                  <div className="flex border-b border-gray-200 mb-4">
                    <button
                      className={`py-2 px-4 ${shareMethod === 'code' ? 'border-b-2 border-black font-bold' : 'text-gray-500'}`}
                      onClick={() => setShareMethod('code')}
                    >
                      共有コード
                    </button>
                    <button
                      className={`py-2 px-4 ${shareMethod === 'url' ? 'border-b-2 border-black font-bold' : 'text-gray-500'}`}
                      onClick={() => setShareMethod('url')}
                    >
                      共有URL
                    </button>
                  </div>
                  
                  {shareMethod === 'code' && (
                    <>
                      <p className="text-sm font-medium text-black mb-1">共有コード:</p>
                      <div className="flex">
                        <input
                          type="text"
                          value={shareCode || ''}
                          readOnly
                          className="flex-grow border border-black rounded-l p-2 text-black bg-white"
                        />
                        <button
                          onClick={handleCopyCode}
                          className="bg-black text-white px-4 py-2 rounded-r"
                        >
                          コピー
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">※ 共有コードを受け取った人は「旅行に参加」から入力できます</p>
                    </>
                  )}
                  
                  {shareMethod === 'url' && (
                    <>
                      <p className="text-sm font-medium text-black mb-1">共有URL:</p>
                      <div className="flex">
                        <input
                          type="text"
                          value={shareUrl || ''}
                          readOnly
                          className="flex-grow border border-black rounded-l p-2 text-black bg-white text-xs"
                        />
                        <button
                          onClick={handleCopyUrl}
                          className="bg-black text-white px-4 py-2 rounded-r"
                        >
                          コピー
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">※ URLを受け取った人はリンクをクリックするだけで参加できます</p>
                    </>
                  )}
                </div>
                
                {copyMessage && (
                  <div className="mb-4 p-2 bg-green-100 rounded-lg text-green-700 text-center">
                    {copyMessage}
                  </div>
                )}
              </>
            )}
            
            <div className="flex justify-end">
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="px-4 py-2 bg-black text-white rounded"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultView; 