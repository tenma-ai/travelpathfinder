import React from 'react';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
}

/**
 * アプリケーション全体で使用されるローディングスピナーコンポーネント
 */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'medium', 
  color = 'black' 
}) => {
  // サイズに基づいたクラス名を生成
  const sizeClass = {
    small: 'h-6 w-6 border-2',
    medium: 'h-10 w-10 border-2',
    large: 'h-16 w-16 border-3'
  }[size];
  
  return (
    <div 
      className={`animate-spin rounded-full ${sizeClass} border-t-transparent border-solid border-${color}`}
      style={{ borderColor: color, borderTopColor: 'transparent' }}
    />
  );
};

export default LoadingSpinner; 