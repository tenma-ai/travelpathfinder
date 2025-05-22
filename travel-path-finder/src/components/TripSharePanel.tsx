import React, { useState } from 'react';
import { shareTripInfo, shareTripInfoToCloud, exportTripData } from '../services/tripShareService';
import type { TripInfo } from '../types';

interface TripSharePanelProps {
  tripInfo: TripInfo;
}

/**
 * 旅行共有パネルコンポーネント
 * クラウドストレージ対応版
 */
const TripSharePanel: React.FC<TripSharePanelProps> = ({ tripInfo }) => {
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [cloudShareCode, setCloudShareCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCloudGenerating, setIsCloudGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [shareMethod, setShareMethod] = useState<'code' | 'url' | 'cloud'>('code');
  const [error, setError] = useState<string | null>(null);

  // 共有コードを生成（ローカルストレージ版）
  const handleGenerateCode = () => {
    try {
      setIsGenerating(true);
      setError(null);
      
      // 共有コードを生成
      const code = shareTripInfo(tripInfo);
      setShareCode(code);
      
      setIsGenerating(false);
    } catch (err) {
      console.error('共有コード生成エラー:', err);
      setError(`共有コードの生成に失敗しました: ${err instanceof Error ? err.message : '不明なエラー'}`);
      setIsGenerating(false);
    }
  };
  
  // クラウド共有コードを生成
  const handleGenerateCloudCode = async () => {
    try {
      setIsCloudGenerating(true);
      setError(null);
      
      // クラウド共有コードを生成（非同期）
      const code = await shareTripInfoToCloud(tripInfo);
      setCloudShareCode(code);
      
      setIsCloudGenerating(false);
    } catch (err) {
      console.error('クラウド共有コード生成エラー:', err);
      setError(`クラウド共有コードの生成に失敗しました: ${err instanceof Error ? err.message : '不明なエラー'}`);
      setIsCloudGenerating(false);
    }
  };

  // 共有URLを生成
  const handleGenerateUrl = () => {
    try {
      setIsGenerating(true);
      setError(null);
      
      // データをエクスポート
      const compressedData = exportTripData(tripInfo);
      
      // URLを生成
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/shared-trip/${encodeURIComponent(compressedData)}`;
      
      setShareUrl(url);
      setIsGenerating(false);
    } catch (err) {
      console.error('共有URL生成エラー:', err);
      setError(`共有URLの生成に失敗しました: ${err instanceof Error ? err.message : '不明なエラー'}`);
      setIsGenerating(false);
    }
  };

  // クリップボードにコピー
  const handleCopy = (text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('コピーエラー:', err);
      setError('コピーに失敗しました。ブラウザの設定を確認してください。');
    }
  };

  // 共有方法の切り替え
  const handleChangeShareMethod = (method: 'code' | 'url' | 'cloud') => {
    setShareMethod(method);
    setError(null);
    
    // 必要に応じて共有データを生成
    if (method === 'code' && !shareCode) {
      handleGenerateCode();
    } else if (method === 'url' && !shareUrl) {
      handleGenerateUrl();
    } else if (method === 'cloud' && !cloudShareCode) {
      handleGenerateCloudCode();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold mb-4">旅行プランを共有</h2>
      
      {/* 共有方法の選択タブ */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => handleChangeShareMethod('code')}
          className={`py-2 px-4 font-medium ${
            shareMethod === 'code' 
              ? 'border-b-2 border-black text-black' 
              : 'text-gray-500 hover:text-black'
          }`}
        >
          共有コード
        </button>
        <button
          onClick={() => handleChangeShareMethod('cloud')}
          className={`py-2 px-4 font-medium ${
            shareMethod === 'cloud' 
              ? 'border-b-2 border-black text-black' 
              : 'text-gray-500 hover:text-black'
          }`}
        >
          クラウド共有 (推奨)
        </button>
        <button
          onClick={() => handleChangeShareMethod('url')}
          className={`py-2 px-4 font-medium ${
            shareMethod === 'url' 
              ? 'border-b-2 border-black text-black' 
              : 'text-gray-500 hover:text-black'
          }`}
        >
          直接URL
        </button>
      </div>
      
      {/* エラーメッセージ */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">
          <p>{error}</p>
        </div>
      )}

      {/* 共有コード */}
      {shareMethod === 'code' && (
        <div>
          <p className="mb-4 text-gray-600">
            この共有コードを友人や家族と共有すると、同じ旅行計画に参加できます。
            <br />
            <span className="text-sm text-yellow-600">
              注意: この共有コードはブラウザのローカルストレージに保存されます。ブラウザが異なると共有できません。
            </span>
          </p>
          
          {!shareCode ? (
            <button
              onClick={handleGenerateCode}
              disabled={isGenerating}
              className="w-full py-3 bg-black text-white rounded flex items-center justify-center"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  共有コードを生成中...
                </>
              ) : (
                '共有コードを生成'
              )}
            </button>
          ) : (
            <div>
              <div className="flex mb-4">
                <input
                  type="text"
                  value={shareCode}
                  readOnly
                  className="flex-grow p-3 border border-gray-300 rounded-l bg-gray-50"
                />
                <button
                  onClick={() => handleCopy(shareCode)}
                  className="px-4 py-2 bg-black text-white rounded-r"
                >
                  {isCopied ? 'コピー済み' : 'コピー'}
                </button>
              </div>
              
              <p className="text-sm text-gray-500">
                このコードを旅行に招待したい人に送ってください。ホーム画面の「旅行に参加」から入力できます。
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* クラウド共有 */}
      {shareMethod === 'cloud' && (
        <div>
          <p className="mb-4 text-gray-600">
            クラウド共有では、異なるデバイスやブラウザからでも旅行計画を共有できます。
            <br />
            <span className="text-sm text-green-600">
              推奨: デバイスを問わず共有できる最も確実な方法です。
            </span>
          </p>
          
          {!cloudShareCode ? (
            <button
              onClick={handleGenerateCloudCode}
              disabled={isCloudGenerating}
              className="w-full py-3 bg-black text-white rounded flex items-center justify-center"
            >
              {isCloudGenerating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  クラウド共有コードを生成中...
                </>
              ) : (
                'クラウド共有コードを生成'
              )}
            </button>
          ) : (
            <div>
              <div className="flex mb-4">
                <input
                  type="text"
                  value={cloudShareCode}
                  readOnly
                  className="flex-grow p-3 border border-gray-300 rounded-l bg-gray-50"
                />
                <button
                  onClick={() => handleCopy(cloudShareCode)}
                  className="px-4 py-2 bg-black text-white rounded-r"
                >
                  {isCopied ? 'コピー済み' : 'コピー'}
                </button>
              </div>
              
              <p className="text-sm text-gray-500">
                このコードを旅行に招待したい人に送ってください。ホーム画面の「旅行に参加」から入力できます。
              </p>
            </div>
          )}
        </div>
      )}

      {/* 直接URL共有 */}
      {shareMethod === 'url' && (
        <div>
          <p className="mb-4 text-gray-600">
            このURLを共有すると、リンクをクリックするだけで旅行計画にアクセスできます。
            <br />
            <span className="text-sm text-orange-600">
              注意: URLが非常に長くなる場合があります。メッセージアプリによっては送信できないことがあります。
            </span>
          </p>
          
          {!shareUrl ? (
            <button
              onClick={handleGenerateUrl}
              disabled={isGenerating}
              className="w-full py-3 bg-black text-white rounded flex items-center justify-center"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  共有URLを生成中...
                </>
              ) : (
                '共有URLを生成'
              )}
            </button>
          ) : (
            <div>
              <div className="flex mb-4">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-grow p-3 border border-gray-300 rounded-l bg-gray-50 text-xs overflow-hidden"
                />
                <button
                  onClick={() => handleCopy(shareUrl)}
                  className="px-4 py-2 bg-black text-white rounded-r whitespace-nowrap"
                >
                  {isCopied ? 'コピー済み' : 'コピー'}
                </button>
              </div>
              
              <p className="text-sm text-gray-500">
                このURLをクリックすると直接旅行計画にアクセスできます。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TripSharePanel; 