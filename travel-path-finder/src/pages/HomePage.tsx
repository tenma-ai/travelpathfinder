import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * 初期選択画面（一人旅/複数人旅行/旅行に参加の選択）
 */
const HomePage = () => {
  const navigate = useNavigate();
  const [shareCode, setShareCode] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);

  const handleSoloTripSelect = () => {
    navigate('/solo-trip');
  };

  const handleGroupTripSelect = () => {
    navigate('/group-trip');
  };

  const handleJoinSelect = () => {
    setShowJoinModal(true);
  };

  const handleJoinTrip = () => {
    if (shareCode.trim()) {
      navigate(`/join-trip/${shareCode}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white text-black p-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-2 text-black">TravelPathFinder</h1>
        <p className="text-lg text-black">あなたの理想的な旅行ルートを最適化</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <button
          onClick={handleSoloTripSelect}
          className="trip-selection-card flex flex-col items-center p-8 bg-white border-2 border-black rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 max-w-xs w-full"
        >
          <div className="icon-container mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-black">一人旅</h2>
          <p className="text-center text-black">個人の希望に合わせた最適な旅程を作成します。</p>
        </button>

        <button
          onClick={handleGroupTripSelect}
          className="trip-selection-card flex flex-col items-center p-8 bg-white border-2 border-black rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 max-w-xs w-full"
        >
          <div className="icon-container mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-black">複数人旅行</h2>
          <p className="text-center text-black">グループ全員の希望を平等に考慮した最適な旅程を提案します。</p>
        </button>

        <button
          onClick={handleJoinSelect}
          className="trip-selection-card flex flex-col items-center p-8 bg-white border-2 border-black rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 max-w-xs w-full"
        >
          <div className="icon-container mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-black">旅行に参加</h2>
          <p className="text-center text-black">共有コードを使って他の人の旅行計画に参加します。</p>
        </button>
      </div>

      {/* 参加モーダル */}
      {showJoinModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-xl font-bold mb-4 text-black">共有された旅行に参加</h3>
            <p className="mb-4 text-black">友人や家族から受け取った共有コードを入力して、旅行計画に参加しましょう。参加後は自分の希望地を追加できます。</p>
            
            <input
              type="text"
              value={shareCode}
              onChange={(e) => setShareCode(e.target.value)}
              placeholder="共有コード（例: ABC123）"
              className="w-full border border-black rounded p-2 mb-4 text-black bg-white"
            />
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowJoinModal(false)}
                className="px-4 py-2 border border-black rounded"
              >
                キャンセル
              </button>
              <button
                onClick={handleJoinTrip}
                className="px-4 py-2 bg-black text-white rounded"
                disabled={!shareCode.trim()}
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