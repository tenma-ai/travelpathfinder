import { useEffect, useRef } from 'react';
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
  sea: '#0ea5e9'  // 水色
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
  
  // マップの初期化と経路描画
  useEffect(() => {
    if (!mapContainer.current || !itinerary) return;
    
    // マップが既に初期化されている場合は再利用
    if (map.current) return;
    
    // マップの初期化
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v10',
      center: [0, 20], // 初期表示位置（世界全体が見えるように）
      zoom: 1.5
    });
    
    const mapInstance = map.current;
    
    // マップ読み込み完了後に経路描画
    mapInstance.on('load', () => {
      // ソースとレイヤーを追加
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
      
      // 経路ライン - 海路
      mapInstance.addLayer({
        id: 'route-line-sea',
        type: 'line',
        source: 'route-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': TRANSPORT_COLORS.sea,
          'line-width': 3,
          'line-opacity': 0.8,
          'line-dasharray': [3, 2]
        },
        filter: ['==', ['get', 'transportType'], 'sea']
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
      
      // 経路データを更新
      updateRouteData();
    });
    
    // クリーンアップ
    return () => {
      mapInstance.remove();
      map.current = null;
    };
  }, []);
  
  // 経路データの更新
  useEffect(() => {
    if (!map.current || !itinerary) return;
    
    // マップが読み込み完了しているか確認
    if (!map.current.isStyleLoaded()) {
      map.current.on('load', updateRouteData);
      return;
    }
    
    updateRouteData();
  }, [itinerary, members]);
  
  // 経路データの更新関数
  const updateRouteData = () => {
    if (!map.current || !itinerary) return;
    
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
    
    // ソースデータを更新
    const source = map.current.getSource('route-source') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(geojsonData as any);
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
      
      // 希望者のカラーコーディング
      if (loc.originalRequesters.length > 0) {
        const requesterMembers = members.filter(m => 
          loc.originalRequesters.includes(m.id)
        );
        
        if (requesterMembers.length === 1) {
          // 単一メンバーの場合はそのメンバーの色
          el.style.borderColor = requesterMembers[0].color || '#000';
        } else if (requesterMembers.length > 1) {
          // 複数メンバーの場合はグラデーション
          const colors = requesterMembers.map(m => m.color || '#000');
          el.style.borderImage = `conic-gradient(${colors.join(', ')}) 1`;
        }
      }
      
      // ポップアップ
      const popupContent = `
        <h3 style="font-weight: bold; margin-bottom: 5px;">${loc.location.name}</h3>
        <p style="margin: 0 0 5px 0;">
          ${new Date(loc.arrivalDate).toLocaleDateString()} - 
          ${new Date(loc.departureDate).toLocaleDateString()}
        </p>
        ${loc.originalRequesters.length > 0 ? `
          <p style="margin: 0; font-size: 12px;">
            <strong>希望者:</strong> 
            ${loc.originalRequesters.map(id => {
              const member = members.find(m => m.id === id);
              return member ? member.name : '';
            }).filter(Boolean).join(', ')}
          </p>
        ` : ''}
      `;
      
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupContent);
      
      // マーカーを地図に追加
      new mapboxgl.Marker(el)
        .setLngLat(loc.location.coordinates)
        .setPopup(popup)
        .addTo(map.current!);
    });
    
    // 全ての経由地が見えるようにビューを調整
    const bounds = new mapboxgl.LngLatBounds();
    coordinates.forEach(coord => bounds.extend(coord as mapboxgl.LngLatLike));
    
    map.current.fitBounds(bounds, {
      padding: 50,
      maxZoom: 8
    });
  };
  
  // 空路用の円弧座標を生成
  const generateArcCoordinates = (start: [number, number], end: [number, number]) => {
    const points = 20; // 円弧の細かさ
    const coords = [];
    
    for (let i = 0; i <= points; i++) {
      const fraction = i / points;
      
      // 単純な線形補間ではなく、円弧のように見せるための中間点を計算
      const lat = start[1] + (end[1] - start[1]) * fraction;
      const lng = start[0] + (end[0] - start[0]) * fraction;
      
      // 高度の増減（放物線状に）
      const altitude = Math.sin(fraction * Math.PI) * 
        Math.min(
          Math.abs(start[0] - end[0]), 
          Math.abs(start[1] - end[1])
        ) * 0.5;
        
      coords.push([lng, lat + altitude]);
    }
    
    return coords;
  };
  
  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full rounded-lg" />
      
      <div className="absolute bottom-2 right-2 bg-white p-2 rounded shadow text-sm">
        <div className="flex items-center mb-2">
          <div style={{ width: 30, height: 3, backgroundColor: TRANSPORT_COLORS.land, marginRight: 8 }} />
          <div className="flex items-center">
            <img src="/car.png" alt="車" className="w-4 h-4 mr-1" />
            <span>陸路移動</span>
          </div>
        </div>
        <div className="flex items-center">
          <div style={{ width: 30, height: 3, backgroundColor: TRANSPORT_COLORS.air, marginRight: 8, 
            backgroundImage: 'linear-gradient(90deg, #3b82f6 50%, transparent 50%)', 
            backgroundSize: '6px 3px' }} />
          <div className="flex items-center">
            <img src="/airplane.png" alt="飛行機" className="w-4 h-4 mr-1" />
            <span>空路移動</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapView; 