// src/FieldReport.jsx - 현장 실시간 부적합 입력
import React, { useEffect, useState, useRef } from 'react';

// 부적합 항목 카테고리
const CATEGORIES = [
  {
    id: 'parking',
    name: '주차구역',
    items: [
      { id: 'width', label: '주차구역 폭', unit: 'cm', fields: ['측정값'] },
      { id: 'length', label: '주차구역 길이', unit: 'cm', fields: ['측정값'] },
      { id: 'sign', label: '표지판 미설치', unit: '개소', fields: ['개수'] },
      { id: 'marking', label: '바닥 표시 불량', unit: '개소', fields: ['개수'] }
    ]
  },
  {
    id: 'curb',
    name: '턱 낮추기',
    items: [
      { id: 'height', label: '턱 높이', unit: 'cm', fields: ['측정값'] },
      { id: 'width', label: '유효폭', unit: 'cm', fields: ['측정값'] },
      { id: 'slope', label: '경사도', unit: '%', fields: ['측정값'] },
      { id: 'none', label: '턱낮추기 미설치', unit: '개소', fields: ['개수'] }
    ]
  },
  {
    id: 'ramp',
    name: '경사로',
    items: [
      { id: 'slope', label: '경사로 기울기', unit: '%', fields: ['측정값'] },
      { id: 'width', label: '유효폭', unit: 'cm', fields: ['측정값'] },
      { id: 'handrail', label: '손잡이 미설치', unit: '개소', fields: ['개수'] }
    ]
  },
  {
    id: 'elevator',
    name: '승강기',
    items: [
      { id: 'door_width', label: '출입문 폭', unit: 'cm', fields: ['측정값'] },
      { id: 'cabin_width', label: '승강장 폭', unit: 'cm', fields: ['측정값'] },
      { id: 'cabin_depth', label: '승강장 깊이', unit: 'cm', fields: ['측정값'] },
      { id: 'button', label: '버튼 높이', unit: 'cm', fields: ['측정값'] }
    ]
  },
  {
    id: 'toilet',
    name: '화장실',
    items: [
      { id: 'door_width', label: '출입문 폭', unit: 'cm', fields: ['측정값'] },
      { id: 'space', label: '활동 공간', unit: 'cm', fields: ['폭', '깊이'] },
      { id: 'handrail', label: '손잡이 미설치', unit: '개소', fields: ['개수'] },
      { id: 'sink_height', label: '세면대 높이', unit: 'cm', fields: ['측정값'] }
    ]
  },
  {
    id: 'entrance',
    name: '출입구',
    items: [
      { id: 'door_width', label: '출입문 유효폭', unit: 'cm', fields: ['측정값'] },
      { id: 'threshold', label: '문턱 높이', unit: 'cm', fields: ['측정값'] },
      { id: 'handle_height', label: '손잡이 높이', unit: 'cm', fields: ['측정값'] }
    ]
  }
];

export default function FieldReport({ user, branch, supabase, onBack }) {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [marker, setMarker] = useState(null);
  
  // 위치 정보
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('위치 확인 중...');
  
  // 입력 상태
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [measurements, setMeasurements] = useState({});
  const [memo, setMemo] = useState('');
  const [photos, setPhotos] = useState([]);
  
  // 저장된 데이터
  const [savedReports, setSavedReports] = useState([]);

  // 네이버 지도 초기화
  useEffect(() => {
    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID || 'YOUR_CLIENT_ID';
    
    const script = document.createElement('script');
    script.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&submodules=geocoder`;
    script.async = true;
    script.onload = () => {
      console.log('네이버 지도 API 로드 완료');
      initMap();
    };
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  // 지도 초기화
  const initMap = () => {
    if (!window.naver || !window.naver.maps) {
      console.error('네이버 지도 API가 로드되지 않았습니다.');
      return;
    }

    // 현재 위치 가져오기
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          setLocation({ lat, lng });
          
          // 지도 생성
          const mapInstance = new window.naver.maps.Map(mapRef.current, {
            center: new window.naver.maps.LatLng(lat, lng),
            zoom: 17,
            zoomControl: true,
            zoomControlOptions: {
              position: window.naver.maps.Position.TOP_RIGHT
            }
          });
          
          // 마커 생성
          const markerInstance = new window.naver.maps.Marker({
            position: new window.naver.maps.LatLng(lat, lng),
            map: mapInstance,
            icon: {
              content: '<div style="background: #ff4444; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
              anchor: new window.naver.maps.Point(10, 10)
            }
          });
          
          setMap(mapInstance);
          setMarker(markerInstance);
          
          // 주소 가져오기
          getAddressFromCoords(lat, lng);
          
          // 지도 클릭 이벤트
          window.naver.maps.Event.addListener(mapInstance, 'click', (e) => {
            const clickedLat = e.coord.lat();
            const clickedLng = e.coord.lng();
            
            setLocation({ lat: clickedLat, lng: clickedLng });
            markerInstance.setPosition(new window.naver.maps.LatLng(clickedLat, clickedLng));
            getAddressFromCoords(clickedLat, clickedLng);
          });
        },
        (error) => {
          console.error('위치 가져오기 실패:', error);
          // 기본 위치 (서울시청)
          const defaultLat = 37.5665;
          const defaultLng = 126.9780;
          
          const mapInstance = new window.naver.maps.Map(mapRef.current, {
            center: new window.naver.maps.LatLng(defaultLat, defaultLng),
            zoom: 15
          });
          
          setMap(mapInstance);
          setLocation({ lat: defaultLat, lng: defaultLng });
          setAddress('위치 권한을 허용해주세요');
        }
      );
    } else {
      alert('이 브라우저는 위치 서비스를 지원하지 않습니다.');
    }
  };

  // 좌표로 주소 가져오기 (백엔드 API 호출)
  const getAddressFromCoords = async (lat, lng) => {
    try {
      console.log(`주소 조회 시작: lat=${lat}, lng=${lng}`);
      
      const response = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
      
      console.log(`응답 상태: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API 오류 응답:', errorText);
        setAddress('주소를 불러올 수 없습니다');
        return;
      }
      
      const data = await response.json();
      console.log('응답 데이터:', data);
      
      // Reverse Geocoding 응답 형식 처리
      if (data.results && data.results[0]) {
        const result = data.results[0];
        if (result.region) {
          const region = result.region;
          const addr = region.area1.name + ' ' + region.area2.name + ' ' + region.area3.name;
          console.log('추출된 주소:', addr);
          setAddress(addr);
        } else {
          setAddress('주소를 불러올 수 없습니다');
        }
      } else {
        console.log('예상된 형식의 데이터가 없음');
        setAddress('주소를 불러올 수 없습니다');
      }
    } catch (error) {
      console.error('주소 조회 오류:', error);
      setAddress('주소를 불러올 수 없습니다');
    }
  };

  // 항목 선택
  const handleSelectItem = (category, item) => {
    setSelectedCategory(category);
    setSelectedItem(item);
    setMeasurements({});
    setMemo('');
  };

  // 측정값 입력
  const handleMeasurementChange = (field, value) => {
    setMeasurements(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 사진 추가
  const handleAddPhoto = (e) => {
    const files = Array.from(e.target.files || []);
    
    files.forEach(file => {
      if (photos.length >= 4) {
        alert('최대 4장까지만 업로드할 수 있습니다.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotos(prev => [...prev, {
          id: Date.now() + Math.random(),
          src: event.target.result,
          file: file
        }]);
      };
      reader.readAsDataURL(file);
    });

    // input 초기화
    e.target.value = '';
  };

  // 사진 삭제
  const handleRemovePhoto = (photoId) => {
    setPhotos(prev => prev.filter(p => p.id !== photoId));
  };

  // 저장
  const handleSave = async () => {
    if (!selectedItem || !location) {
      alert('항목과 위치를 선택해주세요.');
      return;
    }

    // 필수 필드 확인
    const hasAllFields = selectedItem.fields.every(field => measurements[field]);
    if (!hasAllFields) {
      alert('모든 측정값을 입력해주세요.');
      return;
    }

    const report = {
      id: Date.now(),
      category: selectedCategory.name,
      item: selectedItem.label,
      location: location,
      address: address,
      measurements: measurements,
      memo: memo,
      timestamp: new Date().toISOString(),
      user: user.id
    };

    try {
      // Supabase에 저장
      const { data, error } = await supabase
        .from('field_reports')
        .insert([{
          user_id: user.id,
          branch_id: user.branchId,
          category: selectedCategory.name,
          item_name: selectedItem.label,
          latitude: location.lat,
          longitude: location.lng,
          address: address,
          measurements: measurements,
          memo: memo
        }]);

      if (error) throw error;

      // 로컬 상태 업데이트
      setSavedReports([report, ...savedReports]);
      
      alert('✅ 저장되었습니다!');
      
      // 폼 초기화
      setSelectedCategory(null);
      setSelectedItem(null);
      setMeasurements({});
      setMemo('');
      setPhotos([]);
    } catch (error) {
      console.error('저장 실패:', error);
      
      // Supabase 연결 실패 시 로컬 저장
      setSavedReports([report, ...savedReports]);
      alert('✅ 임시 저장되었습니다. (서버 연결 실패)');
    }
  };

  // 현재 위치로 이동
  const handleMoveToCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        setLocation({ lat, lng });
        
        if (map && marker) {
          const newPos = new window.naver.maps.LatLng(lat, lng);
          map.setCenter(newPos);
          marker.setPosition(newPos);
          getAddressFromCoords(lat, lng);
        }
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 헤더 */}
      <div className="bg-blue-600 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">📍 현장 부적합 입력</h1>
            <p className="text-sm opacity-90 mt-1">{branch?.name || user.id}</p>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg font-medium transition"
            >
              ← 돌아가기
            </button>
          )}
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="flex-1 overflow-hidden flex">
        {/* 지도 영역 */}
        <div className="flex-1 relative">
          <div ref={mapRef} className="w-full h-full" />
          
          {/* 위치 정보 오버레이 */}
          <div className="absolute top-4 left-4 right-4 bg-white rounded-lg shadow-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs text-gray-500">📍 현재 위치</p>
                <p className="font-medium text-base text-gray-800">
                  {address && address !== '주소를 불러오는 중...' ? address : '위치 확인 중...'}
                </p>
              </div>
              <button
                onClick={handleMoveToCurrentLocation}
                className="ml-2 bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-600"
              >
                🎯 내 위치
              </button>
            </div>
          </div>
        </div>

        {/* 입력 패널 */}
        <div className="w-96 bg-white border-l flex flex-col">
          {/* 카테고리 선택 */}
          <div className="p-4 border-b">
            <h2 className="font-bold text-lg mb-3">부적합 항목</h2>
            <div className="space-y-1">
              {CATEGORIES.map(category => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category)}
                  className={`w-full text-left px-3 py-2 rounded-lg font-medium transition-colors ${
                    selectedCategory?.id === category.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {/* 세부 항목 선택 */}
          {selectedCategory && (
            <div className="p-4 border-b overflow-y-auto">
              <h3 className="font-bold mb-2">{selectedCategory.name} 상세</h3>
              <div className="space-y-1">
                {selectedCategory.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectItem(selectedCategory, item)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      selectedItem?.id === item.id
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 측정값 입력 */}
          {selectedItem && (
            <div className="flex-1 p-4 overflow-y-auto">
              <h3 className="font-bold mb-3">{selectedItem.label}</h3>
              
              {selectedItem.fields.map(field => (
                <div key={field} className="mb-3">
                  <label className="block text-sm font-medium mb-1">
                    {field}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={measurements[field] || ''}
                      onChange={(e) => handleMeasurementChange(field, e.target.value)}
                      className="flex-1 border rounded-lg px-3 py-2"
                      placeholder="입력"
                    />
                    <span className="px-3 py-2 bg-gray-100 rounded-lg text-sm">
                      {selectedItem.unit}
                    </span>
                  </div>
                </div>
              ))}

              <div className="mb-3">
                <label className="block text-sm font-medium mb-1">
                  메모 (선택사항)
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  rows="3"
                  placeholder="특이사항을 입력하세요..."
                />
              </div>

              {/* 사진 업로드 */}
              <div className="mb-3">
                <label className="block text-sm font-medium mb-2">
                  📸 사진 업로드 ({photos.length}/4)
                </label>
                
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {/* 앨범 선택 */}
                  <label className="flex items-center justify-center p-3 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:bg-blue-50">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleAddPhoto}
                      className="hidden"
                      disabled={photos.length >= 4}
                    />
                    <div className="text-center">
                      <div className="text-lg">🖼️</div>
                      <div className="text-xs font-medium">앨범</div>
                    </div>
                  </label>

                  {/* 카메라 촬영 */}
                  <label className="flex items-center justify-center p-3 border-2 border-dashed border-green-300 rounded-lg cursor-pointer hover:bg-green-50">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleAddPhoto}
                      className="hidden"
                      disabled={photos.length >= 4}
                    />
                    <div className="text-center">
                      <div className="text-lg">📷</div>
                      <div className="text-xs font-medium">카메라</div>
                    </div>
                  </label>
                </div>

                {/* 업로드된 사진 미리보기 */}
                {photos.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {photos.map(photo => (
                      <div key={photo.id} className="relative">
                        <img
                          src={photo.src}
                          alt="업로드된 사진"
                          className="w-full h-24 object-cover rounded-lg"
                        />
                        <button
                          onClick={() => handleRemovePhoto(photo.id)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleSave}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700"
              >
                💾 저장
              </button>
            </div>
          )}

          {/* 저장된 데이터 목록 */}
          {savedReports.length > 0 && (
            <div className="p-4 border-t bg-gray-50">
              <h3 className="font-bold mb-2">저장된 항목 ({savedReports.length})</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {savedReports.slice(0, 5).map(report => (
                  <div key={report.id} className="bg-white p-2 rounded text-xs">
                    <p className="font-medium">{report.category} - {report.item}</p>
                    <p className="text-gray-500">{new Date(report.timestamp).toLocaleTimeString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 지회 정보 (App.jsx에서 가져올 것)
const BRANCHES = [
  "포항시","경주시","김천시","안동시","구미시","영주시","영천시","상주시","문경시","경산시",
  "청송군","영양군","영덕군","청도군","고령군","성주군","칠곡군","예천군","봉화군","울진군"
].map((n,i)=>({ id: i+1, name: `한국교통장애인협회 ${n}지회` }));
