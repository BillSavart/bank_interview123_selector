// 試場地圖的資料來源：各家公股銀行招考常用的考場座標。
//
// 座標以 OpenStreetMap / 校方公告比對過，誤差約在數十公尺內，地圖上是用來大致
// 定位；每個 marker 的彈出視窗都會附「在 Google 地圖開啟」連結（純網址、不需任何
// 金鑰、不花錢），點下去就能拿到精準位置與路線。
//
// ── 怎麼新增一個考場 ─────────────────────────────────────────────────────
//   { name: '某某高中', area: '台北市', address: '台北市…', lat: 25.0, lng: 121.5 }
// 取得座標：在 Google 地圖點該地點 → 右鍵「這是哪裡？」會顯示 lat, lng。
// area 用同一組字串就會自動分到同一群、共用同一個顏色。

/** 分區：用來在側欄分組，也決定 marker 顏色。 */
export type VenueArea = '台北市' | '板橋區' | '中和區' | '永和區';

/** 台北捷運六條路線（用顏色當 key）。轉乘站會同時屬於多條線。 */
export type MrtLine = 'red' | 'green' | 'orange' | 'blue' | 'brown' | 'yellow';

/** 各線的官方代表色與線名（顯示色點與線名用）。 */
export const MRT_LINE_META: Record<MrtLine, { color: string; name: string }> = {
  red: { color: '#e3002c', name: '淡水信義線' },
  green: { color: '#107547', name: '松山新店線' },
  orange: { color: '#f8b61c', name: '中和新蘆線' },
  blue: { color: '#0070bd', name: '板南線' },
  brown: { color: '#b57b41', name: '文湖線' },
  yellow: { color: '#ffdb00', name: '環狀線' },
};

export interface ExamVenue {
  /** 顯示名稱（考生熟悉的簡稱即可）。 */
  name: string;
  /** 分區。板橋 / 中和 / 永和皆屬新北市。 */
  area: VenueArea;
  /** 完整地址，顯示在彈出視窗。 */
  address: string;
  lat: number;
  lng: number;
  /**
   * 最近的捷運站。meters 是地圖「直線」距離（公尺），用 OpenStreetMap 全部捷運站
   * 座標逐一比對取最近者算出的；實際步行會略長一點。lines 是該站的路線（轉乘站多條）。
   */
  mrt: { station: string; meters: number; lines: MrtLine[] };
}

/** 把直線距離格式化成好讀的字串：≥1km 顯示公里，否則公尺。 */
export function formatMrtDistance(meters: number): string {
  return meters >= 1000 ? `約 ${(meters / 1000).toFixed(1)} 公里` : `約 ${meters} 公尺`;
}

// 顯示順序：台北市 → 新北（板橋 → 中和 → 永和）。
export const EXAM_VENUES: ExamVenue[] = [
  // ── 台北市 ──
  { name: '台科大', area: '台北市', address: '台北市大安區基隆路四段43號', lat: 25.013411, lng: 121.54162, mrt: { station: '公館', meters: 760, lines: ['green'] } },
  { name: '台師大', area: '台北市', address: '台北市大安區和平東路一段162號', lat: 25.025758, lng: 121.526617, mrt: { station: '古亭', meters: 380, lines: ['green', 'orange'] } },
  { name: '開南商工', area: '台北市', address: '台北市中正區濟南路一段6號', lat: 25.041898, lng: 121.521699, mrt: { station: '善導寺', meters: 360, lines: ['blue'] } },
  { name: '滬江高中', area: '台北市', address: '台北市文山區羅斯福路六段336號', lat: 24.989488, lng: 121.538885, mrt: { station: '景美', meters: 430, lines: ['green'] } },
  { name: '國家考場', area: '台北市', address: '台北市文山區試院路1-1號', lat: 24.986969, lng: 121.549473, mrt: { station: '大坪林', meters: 910, lines: ['green'] } },
  { name: '金甌女中', area: '台北市', address: '台北市中正區杭州南路二段1號', lat: 25.034739, lng: 121.52444, mrt: { station: '東門', meters: 500, lines: ['red', 'orange'] } },
  { name: '師大附中', area: '台北市', address: '台北市大安區信義路三段143號', lat: 25.035435, lng: 121.54073, mrt: { station: '大安', meters: 370, lines: ['red', 'brown'] } },
  { name: '台北大學', area: '台北市', address: '台北市中山區民生東路三段67號（台北校區）', lat: 25.058059, lng: 121.543033, mrt: { station: '中山國中', meters: 320, lines: ['brown'] } },
  { name: '育達高職', area: '台北市', address: '台北市松山區寧安街10號', lat: 25.050043, lng: 121.554102, mrt: { station: '台北小巨蛋', meters: 320, lines: ['green'] } },
  { name: '國北教大', area: '台北市', address: '台北市大安區和平東路二段134號', lat: 25.023446, lng: 121.545253, mrt: { station: '科技大樓', meters: 350, lines: ['brown'] } },
  { name: '臺北商業大學', area: '台北市', address: '台北市中正區濟南路一段321號', lat: 25.042352, lng: 121.525439, mrt: { station: '善導寺', meters: 340, lines: ['blue'] } },
  // ── 新北市・板橋區 ──
  { name: '江翠國中', area: '板橋區', address: '新北市板橋區松江街63號', lat: 25.028638, lng: 121.467319, mrt: { station: '新埔民生', meters: 290, lines: ['yellow'] } },
  { name: '板橋中山國中', area: '板橋區', address: '新北市板橋區文化路一段188巷56號', lat: 25.017409, lng: 121.468174, mrt: { station: '板橋', meters: 440, lines: ['blue', 'yellow'] } },
  { name: '中華電信學院', area: '板橋區', address: '新北市板橋區民族路168號', lat: 25.007721, lng: 121.466004, mrt: { station: '府中', meters: 690, lines: ['blue'] } },
  // ── 新北市・中和區 ──
  { name: '錦和高中', area: '中和區', address: '新北市中和區錦和路100號', lat: 24.992561, lng: 121.491606, mrt: { station: '中和', meters: 1170, lines: ['yellow'] } },
  // ── 新北市・永和區 ──
  { name: '智光商職', area: '永和區', address: '新北市永和區中正路100號', lat: 24.994625, lng: 121.514515, mrt: { station: '景平', meters: 320, lines: ['yellow'] } },
];

/** 各分區的代表色（marker 與側欄共用）。 */
export const AREA_COLOR: Record<VenueArea, string> = {
  台北市: '#0f7d72', // 品牌綠
  板橋區: '#e8821e', // 橘
  中和區: '#7c5cd6', // 紫
  永和區: '#2f7fd4', // 藍
};

/** 側欄分組顯示順序。 */
export const AREA_ORDER: VenueArea[] = ['台北市', '板橋區', '中和區', '永和區'];
