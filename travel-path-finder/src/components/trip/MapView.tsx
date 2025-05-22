import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Itinerary, Member } from '../../types';

// 環境変数からMapbox APIキーを取得
const MAPBOX_API_KEY = import.meta.env.VITE_MAPBOX_API_KEY || '';

// Mapbox APIキーを設定
mapboxgl.accessToken = MAPBOX_API_KEY;

// 交通タイプごとの色定義
const TRANSPORT_COLORS = {
  air: '#3b82f6', // 青色
  land: '#22c55e', // 緑色
};

interface MapViewProps {
  itinerary: Itinerary;
  members: Member[];
}

/**
 * 旅程のマップ表示コンポーネント
 */
const MapView = ({ itinerary, members }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  
  // マップの初期化
  useEffect(() => {
    if (!mapContainer.current || !itinerary) return;
    
    // マップを初期化するか、既存のマップをクリーンアップする
    const initMap = () => {
      // 既存のマップをクリーンアップ
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      
      // HTMLElement確保
      const container = mapContainer.current;
      if (!container) return;
      
      console.log('MapView: マップの初期化を開始します');
      
      // マップの初期化
      map.current = new mapboxgl.Map({
        container: container as HTMLElement,
        style: 'mapbox://styles/mapbox/light-v10',
        center: [0, 20], // 初期表示位置（世界全体が見えるように）
        zoom: 1.5
      });
      
      // マップ読み込み完了イベントを処理
      map.current.on('load', () => {
        console.log('MapView: マップの読み込みが完了しました');
        
        if (!map.current) return; // 念のためnullチェック
        
        // ソースとレイヤーを追加
        addSourcesAndLayers(map.current);
        
        // 準備完了フラグをセット
        setMapReady(true);
      });
    };
    
    // マップを初期化
    initMap();
    
    // クリーンアップ関数
    return () => {
      console.log('MapView: マップをクリーンアップします');
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapReady(false);
    };
  }, [itinerary]); // itineraryが変更されたときに再初期化
  
  // ソースとレイヤーを追加する関数
  const addSourcesAndLayers = (mapInstance: mapboxgl.Map) => {
    try {
      // ソースとレイヤーが既に存在するかチェック
      if (mapInstance.getSource('route-source')) {
        return; // 既に存在する場合は早期リターン
      }
      
      // ソースを追加
      mapInstance.addSource('route-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
      
      // 経路ライン - 陸路
      mapInstance.addLayer({
        id: 'route-line-land',
        type: 'line',
        source: 'route-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': TRANSPORT_COLORS.land,
          'line-width': 3,
          'line-opacity': 0.8
        },
        filter: ['==', ['get', 'transportType'], 'land']
      });
      
      // 経路ライン - 空路
      mapInstance.addLayer({
        id: 'route-line-air',
        type: 'line',
        source: 'route-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': TRANSPORT_COLORS.air,
          'line-width': 3,
          'line-opacity': 0.8,
          'line-dasharray': [2, 1]
        },
        filter: ['==', ['get', 'transportType'], 'air']
      });
      
      // 経路の点（出発点、到着点など）
      mapInstance.addLayer({
        id: 'route-points',
        type: 'circle',
        source: 'route-source',
        paint: {
          'circle-radius': 8,
          'circle-color': '#000',
          'circle-opacity': 0.7
        },
        filter: ['==', '$type', 'Point']
      });
      
      console.log('MapView: ソースとレイヤーを追加しました');
    } catch (error) {
      console.error('MapView: ソースとレイヤーの追加に失敗しました', error);
    }
  };
  
  // 経路データの更新
  useEffect(() => {
    if (!itinerary || !map.current) return;

    // マップが読み込み完了しているか確認
    if (!mapReady) {
      console.log('MapView: マップがまだ準備できていません');
      return;
    }
    
    console.log('MapView: 経路データを更新します');
    updateRouteData();
    
  }, [itinerary, members, mapReady]);
  
  // 経路データの更新関数
  const updateRouteData = () => {
    if (!map.current || !itinerary || !mapReady) return;
    
    try {
      console.log('MapView: 経路データ更新処理を開始します');
      
      // マーカーを全て削除
      const markerElements = document.querySelectorAll('.mapboxgl-marker');
      markerElements.forEach(element => element.remove());
      
      // 経由地点の座標配列
      const coordinates = itinerary.locations.map(loc => loc.location.coordinates);
      
      // 経路のGeoJSONを作成
      const routeFeatures = [];
      
      // 地点のフィーチャー
      const pointFeatures = itinerary.locations.map(loc => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: loc.location.coordinates
        },
        properties: {
          id: loc.id,
          name: loc.location.name,
          arrivalDate: loc.arrivalDate.toISOString(),
          departureDate: loc.departureDate.toISOString(),
          requesters: loc.originalRequesters
        }
      }));
      
      // 経路のライン
      for (let i = 0; i < itinerary.routes.length; i++) {
        const route = itinerary.routes[i];
        const fromLoc = itinerary.locations.find(loc => loc.id === route.from);
        const toLoc = itinerary.locations.find(loc => loc.id === route.to);
        
        if (fromLoc && toLoc) {
          let lineCoordinates;
          
          if (route.transportType === 'air') {
            // 空路は円弧で表現
            lineCoordinates = generateArcCoordinates(
              fromLoc.location.coordinates,
              toLoc.location.coordinates
            );
          } else {
            // 陸路/海路は直線で表現
            lineCoordinates = [
              fromLoc.location.coordinates,
              toLoc.location.coordinates
            ];
          }
          
          routeFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: lineCoordinates
            },
            properties: {
              id: route.id,
              transportType: route.transportType,
              duration: route.estimatedDuration
            }
          });
        }
      }
      
      // GeoJSONデータを更新
      const geojsonData = {
        type: 'FeatureCollection',
        features: [...pointFeatures, ...routeFeatures]
      };
      
      // ソースとレイヤーが存在するか確認し、存在しなければ追加
      try {
        if (!map.current.getSource('route-source')) {
          addSourcesAndLayers(map.current);
        }
        
        // ソースデータを更新
        const source = map.current.getSource('route-source') as mapboxgl.GeoJSONSource;
        if (source) {
          source.setData(geojsonData as any);
          console.log('MapView: ソースデータを更新しました');
        } else {
          console.warn('MapView: route-sourceが見つかりません');
        }
      } catch (error) {
        console.error('MapView: ソースデータの更新に失敗しました', error);
      }
      
      // 各地点にマーカーを追加
      itinerary.locations.forEach((loc, index) => {
        // マーカー要素
        const el = document.createElement('div');
        el.className = 'location-marker';
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid #000';
        el.style.textAlign = 'center';
        el.style.lineHeight = '24px';
        el.style.fontWeight = 'bold';
        el.style.fontSize = '12px';
        
        // 最初と最後は特別なスタイル
        if (index === 0 || index === itinerary.locations.length - 1) {
          el.style.backgroundColor = '#000';
          el.style.color = '#fff';
          el.textContent = index === 0 ? 'S' : 'E';
        } else {
          el.style.backgroundColor = '#fff';
          el.textContent = String(index);
        }
        
        // マーカー作成
        new mapboxgl.Marker(el)
          .setLngLat(loc.location.coordinates)
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <div class="p-2">
              <h3 class="font-bold text-black">${loc.location.name}</h3>
              <p class="text-xs text-gray-600">
                ${new Date(loc.arrivalDate).toLocaleDateString()} - 
                ${new Date(loc.departureDate).toLocaleDateString()}
              </p>
            </div>
          `))
          .addTo(map.current!);
      });
      
      // マップの表示範囲を調整
      if (coordinates.length > 0) {
        try {
          let bounds = new mapboxgl.LngLatBounds();
          coordinates.forEach(coord => {
            if (Array.isArray(coord) && coord.length === 2 && 
                !isNaN(coord[0]) && !isNaN(coord[1])) {
              bounds.extend(coord);
            }
          });
          
          // バウンディングボックスが有効な場合のみfitBoundsを呼び出す
          if (!bounds.isEmpty()) {
            map.current.fitBounds(bounds, {
              padding: 50,
              maxZoom: 10
            });
            console.log('MapView: マップの表示範囲を調整しました');
          }
        } catch (error) {
          console.error('MapView: 表示範囲の調整に失敗しました', error);
        }
      }
    } catch (error) {
      console.error('MapView: 経路データ更新処理でエラーが発生しました', error);
    }
  };
  
  // 空路表示用の円弧座標を生成する関数
  const generateArcCoordinates = (start: [number, number], end: [number, number]) => {
    const points = 20; // 円弧の解像度
    const coords = [];
    
    // 地球の曲率を考慮した大円弧を生成
    for (let i = 0; i <= points; i++) {
      const t = i / points;
      
      // 単純な線形補間
      const lng = start[0] + t * (end[0] - start[0]);
      const lat = start[1] + t * (end[1] - start[1]);
      
      // 高度を考慮（中央部分が最も高い）
      const alt = Math.sin(t * Math.PI) * 0.5;
      
      // 距離が遠いほど高度を上げる
      const distance = Math.sqrt(
        Math.pow(end[0] - start[0], 2) + 
        Math.pow(end[1] - start[1], 2)
      );
      
      const scaledAlt = alt * Math.min(distance * 0.2, 2);
      
      // 中間点を高度に応じて緯度方向に調整（簡易的な曲線表現）
      const adjustedLat = lat + scaledAlt * (end[1] > start[1] ? 1 : -1);
      
      coords.push([lng, adjustedLat]);
    }
    
    return coords;
  };
  
  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full rounded-lg" />
      
      {/* マップの凡例 */}
      <div className="absolute bottom-2 right-2 bg-white p-2 rounded shadow-md text-sm">
        <div className="flex items-center mb-1">
          <div style={{ width: 20, height: 3, backgroundColor: TRANSPORT_COLORS.land, marginRight: 4 }} />
          <span>陸路</span>
        </div>
        <div className="flex items-center">
          <div style={{ 
            width: 20, 
            height: 3, 
            backgroundImage: `linear-gradient(to right, ${TRANSPORT_COLORS.air} 50%, transparent 50%)`,
            backgroundSize: '6px 3px',
            marginRight: 4
          }} />
          <span>空路</span>
        </div>
      </div>
    </div>
  );
};

export default MapView; 