import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinned, TrainFront } from 'lucide-react';
import {
  AREA_COLOR,
  AREA_ORDER,
  EXAM_VENUES,
  formatMrtDistance,
  MRT_LINE_META,
  type ExamVenue,
} from '../data/examVenues';

// 純網址，不需任何金鑰、不花錢；點下去在 Google 地圖以座標落點，方便拿路線。
function gmapsLink(v: ExamVenue): string {
  return `https://www.google.com/maps/search/?api=1&query=${v.lat}%2C${v.lng}`;
}

// 每個考場一個淚滴形 marker，顏色依分區。用 divIcon（純 HTML/CSS）避免 bundler
// 對 Leaflet 預設圖檔路徑的處理問題，也方便標上編號。
function pinIcon(color: string, label: number): L.DivIcon {
  return L.divIcon({
    className: 'venue-pin-wrap',
    html: `<div class="venue-pin" style="--pin:${color}"><span>${label}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });
}

export function VenueMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  // 手機版用分頁籤切換「地圖 / 清單」（≤768px 才看得到頁籤）；桌機兩欄一起顯示，
  // 這個 state 在桌機沒有視覺作用。預設停在地圖，地圖初始化時容器是可見的。
  const [view, setView] = useState<'map' | 'list'>('map');

  // 側欄分組：依 AREA_ORDER 排，每組記住每個考場在 EXAM_VENUES 的原始 index，
  // 這個 index 同時是 marker 編號，側欄與地圖才對得起來。
  const groups = useMemo(
    () =>
      AREA_ORDER.map((area) => ({
        area,
        items: EXAM_VENUES.map((v, i) => ({ v, i })).filter(({ v }) => v.area === area),
      })).filter((g) => g.items.length > 0),
    [],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false, // 不搶頁面捲動；用 +/- 或雙指縮放
      zoomControl: true,
    });
    mapRef.current = map;

    // CARTO Voyager 圖磚：免費、清爽、不需金鑰；標註版權即可。
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    markersRef.current = EXAM_VENUES.map((v, i) => {
      const marker = L.marker([v.lat, v.lng], { icon: pinIcon(AREA_COLOR[v.area], i + 1) })
        .addTo(map)
        .bindPopup(
          `<div class="venue-popup">
             <strong>${i + 1}. ${v.name}</strong>
             <span class="venue-popup-area">${v.area}</span>
             <span class="venue-popup-addr">${v.address}</span>
             <span class="venue-popup-mrt">🚇 最近捷運：${v.mrt.station}站（${formatMrtDistance(v.mrt.meters)}）</span>
             <span class="venue-popup-lines">${v.mrt.lines
               .map(
                 (l) =>
                   `<span class="venue-line"><i style="background:${MRT_LINE_META[l].color}"></i>${MRT_LINE_META[l].name}</span>`,
               )
               .join('')}</span>
             <a class="venue-popup-link" href="${gmapsLink(v)}" target="_blank" rel="noreferrer">在 Google 地圖開啟 ›</a>
           </div>`,
        );
      marker.on('popupopen', () => setSelected(i));
      return marker;
    });

    map.fitBounds(L.latLngBounds(EXAM_VENUES.map((v) => [v.lat, v.lng])), {
      padding: [40, 40],
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
  }, []);

  // 切回地圖頁籤時，容器剛從 display:none 變回可見，Leaflet 需要重新量尺寸。
  useEffect(() => {
    if (view !== 'map') return;
    const id = requestAnimationFrame(() => mapRef.current?.invalidateSize());
    return () => cancelAnimationFrame(id);
  }, [view]);

  // 點側欄某個考場：先切到地圖頁籤（手機版清單在另一頁），等容器顯示後再飛過去
  // 並打開該 marker 的彈出視窗。桌機兩欄都在，切頁籤沒有視覺差異。
  const focusVenue = (i: number) => {
    setSelected(i);
    setView('map');
    // 雙 rAF 確保 display 切換已套用，flyTo 動畫才畫得出來。
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const map = mapRef.current;
        const marker = markersRef.current[i];
        if (!map || !marker) return;
        map.invalidateSize();
        map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 15), { duration: 0.6 });
        marker.openPopup();
      }),
    );
  };

  return (
    <section className="venue-map-section">
      <h2 className="venue-map-title">
        <MapPinned size={18} />
        試場地圖
      </h2>
      <p className="venue-map-hint">
        標出台北市與新北市（板橋、中和、永和）各家公股銀行招考常用的考場。點地圖上的標記或右側清單，可看地址並一鍵在 Google 地圖開啟導航。
      </p>

      {/* 手機版頁籤（桌機以 CSS 隱藏）。 */}
      <div className="venue-map-tabs" role="tablist" aria-label="地圖 / 清單切換">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'map'}
          className={`venue-map-tab ${view === 'map' ? 'is-active' : ''}`}
          onClick={() => setView('map')}
        >
          地圖
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'list'}
          className={`venue-map-tab ${view === 'list' ? 'is-active' : ''}`}
          onClick={() => setView('list')}
        >
          清單
        </button>
      </div>

      <div className={`venue-map-layout view-${view}`}>
        <div ref={containerRef} className="venue-map-canvas" aria-label="試場地圖" />

        <aside className="venue-map-list">
          {groups.map(({ area, items }) => (
            <div key={area} className="venue-map-group">
              <div className="venue-map-group-head">
                <span className="venue-map-dot" style={{ background: AREA_COLOR[area] }} />
                {area === '台北市' ? '台北市' : `新北市・${area}`}
                <span className="venue-map-group-count">{items.length}</span>
              </div>
              {items.map(({ v, i }) => (
                <button
                  key={v.name}
                  type="button"
                  className={`venue-map-item ${selected === i ? 'is-active' : ''}`}
                  onClick={() => focusVenue(i)}
                >
                  <span className="venue-map-num" style={{ background: AREA_COLOR[area] }}>
                    {i + 1}
                  </span>
                  <span className="venue-map-item-body">
                    <span className="venue-map-item-name">{v.name}</span>
                    <span className="venue-map-item-addr">{v.address}</span>
                    <span className="venue-map-item-mrt">
                      <TrainFront size={12} />
                      <span className="venue-line-dots">
                        {v.mrt.lines.map((l) => (
                          <i key={l} style={{ background: MRT_LINE_META[l].color }} />
                        ))}
                      </span>
                      捷運{v.mrt.station}站 · {formatMrtDistance(v.mrt.meters)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </aside>
      </div>

      <p className="venue-map-credit">
        位置與最近捷運站（直線距離估算，實際步行略長）僅供大致參考，實際試場地點與教室請以各銀行招考准考證 / 簡章公告為準。
      </p>
    </section>
  );
}
