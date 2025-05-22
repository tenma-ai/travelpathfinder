import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * 初期選択画面（一人旅/複数人旅行/旅行に参加の選択）
 */
const HomePage = () => {
  const navigate = useNavigate();
  const [shareCode, setShareCode] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const handleSoloTripSelect = () => {
    navigate('/solo-trip');
  };

  const handleGroupTripSelect = () => {
    navigate('/group-trip');
  };

  const handleJoinSelect = () => {
    setShowJoinModal(true);
    setShareCode('');
    setCodeError(null);
  };

  const handleShareCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    setShareCode(value);
    
    // 入力値のバリデーション
    if (value.length > 0) {
      if (value.length > 2000) { // 極端に長いコードは警告
        setCodeError('共有コードが長すぎます。正しくコピーされているか確認してください。');
      } else {
        setCodeError(null);
      }
    } else {
      setCodeError(null);
    }
  };

  const handleJoinTrip = () => {
    const trimmedCode = shareCode.trim();
    
    if (!trimmedCode) {
      setCodeError('共有コードを入力してください');
      return;
    }
    
    if (trimmedCode.length > 2000) {
      setCodeError('共有コードが長すぎます。正しくコピーされているか確認してください。');
      return;
    }
    
    // 問題なければ遷移
    navigate(`/join-trip/${encodeURIComponent(trimmedCode)}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white text-black p-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-2 text-black">TravelPathFinder</h1>
        <p className="text-lg text-black">あなたの理想的な旅行ルートを最適化</p>
      </div>
      
      <div className="flex flex-col space-y-4 w-full max-w-md">
        <button 
          onClick={handleSoloTripSelect}
          className="flex items-center justify-between px-6 py-4 bg-white border-2 border-black rounded-lg shadow-md hover:bg-gray-50 transition-colors text-left"
        >
          <div>
            <h2 className="text-xl font-bold mb-1 text-black">一人旅</h2>
            <p className="text-sm text-gray-700">あなただけの旅行計画を最適化</p>
          </div>
          <span className="text-2xl">→</span>
        </button>
        
        <button 
          onClick={handleGroupTripSelect}
          className="flex items-center justify-between px-6 py-4 bg-white border-2 border-black rounded-lg shadow-md hover:bg-gray-50 transition-colors text-left"
        >
          <div>
            <h2 className="text-xl font-bold mb-1 text-black">複数人旅行</h2>
            <p className="text-sm text-gray-700">友人や家族との旅行計画を最適化</p>
          </div>
          <span className="text-2xl">→</span>
        </button>
        
        <button 
          onClick={handleJoinSelect}
          className="flex items-center justify-between px-6 py-4 bg-white border-2 border-black rounded-lg shadow-md hover:bg-gray-50 transition-colors text-left"
        >
          <div>
            <h2 className="text-xl font-bold mb-1 text-black">旅行に参加</h2>
            <p className="text-sm text-gray-700">共有された旅行計画に参加</p>
          </div>
          <span className="text-2xl">→</span>
        </button>
      </div>
      
      {showJoinModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-xl font-bold mb-4 text-black">共有された旅行に参加</h3>
            <p className="mb-4 text-black">友人や家族から受け取った共有コードを入力して、旅行計画に参加しましょう。参加後は自分の希望地を追加できます。</p>
            
            <input
              type="text"
              value={shareCode}
              onChange={handleShareCodeChange}
              placeholder="共有コードを入力"
              className={`w-full border ${codeError ? 'border-red-500' : 'border-black'} rounded p-2 mb-2 text-black bg-white`}
            />
            
            {codeError && (
              <p className="text-red-500 text-sm mb-4">{codeError}</p>
            )}
            
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => {
                  setShowJoinModal(false);
                  setCodeError(null);
                }}
                className="px-4 py-2 border border-black rounded"
              >
                キャンセル
              </button>
              <button
                onClick={handleJoinTrip}
                className="px-4 py-2 bg-black text-white rounded"
                disabled={!shareCode.trim() || !!codeError}
              >
                参加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage; 