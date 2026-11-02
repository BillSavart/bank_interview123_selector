export interface BotDailyMetricRow {
  date_local: string;
  branch_id: string;
  branch_name: string | null;
  city: string | null;
  service_name: string | null;
  first_observed_at: string | null;
  last_observed_at: string | null;
  avg_waiting_count: number | null;
  min_waiting_count: number | null;
  max_waiting_count: number | null;
  max_waiting_at: string | null;
  peak_hour_local: string | null;
  total_called_count: number | null;
  updated_at?: string;
}

export interface BotBranchItem {
  branch_id: string;
  branch_name: string;
  city: string;
  phone: string;
  address: string;
  is_disabled_on_site: number;
}

export interface BotQueueSummaryResponse {
  available_dates: string[];
  selected_date: string;
  branch_counts: {
    total: number;
    enabled: number;
    disabled: number;
  };
  cities: string[];
  services: string[];
  daily_metrics: BotDailyMetricRow[];
  branches: BotBranchItem[];
  last_run: {
    started_at: string;
    finished_at: string | null;
    mode: string;
    total_targets: number;
    success_count: number;
  } | null;
}

export interface BotBranchHistoryResponse {
  branch: BotBranchItem;
  history: BotDailyMetricRow[];
}

export async function fetchBotQueueSummary(params: {
  date?: string;
  city?: string;
  branchId?: string;
  serviceName?: string;
} = {}): Promise<BotQueueSummaryResponse> {
  const qs = new URLSearchParams();
  if (params.date) qs.set('date', params.date);
  if (params.city) qs.set('city', params.city);
  if (params.branchId) qs.set('branch_id', params.branchId);
  if (params.serviceName) qs.set('service_name', params.serviceName);
  const query = qs.toString();
  const res = await fetch(`/api/bot-queue/summary${query ? `?${query}` : ''}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchBotBranchHistory(branchId: string): Promise<BotBranchHistoryResponse> {
  const res = await fetch(`/api/bot-queue/branch/${encodeURIComponent(branchId)}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}
