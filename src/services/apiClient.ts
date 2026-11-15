import type {
  Course,
  EmailLogEntry,
  Exam,
  ExamAttempt,
  Question,
} from '../types/exam';

export interface PlatformSnapshot {
  courses: Course[];
  questions: Question[];
  exams: Exam[];
  attempts: ExamAttempt[];
  emailLogs: EmailLogEntry[];
}

export const STORAGE_KEY = 'vne_testing_platform_v1';
export const ADMIN_TOKEN_KEY = 'vne_admin_bearer_token';
export const DEVICE_TOKEN_KEY = 'vne_student_device_token';
export const BROWSER_ID_KEY = 'vne_browser_id';
export const DEMO_MAILER_QUOTA_KEY = 'vne_demo_mailer_quota_v1';
export const SYNC_CHANNEL_NAME = 'vne_exam_sync_channel';

export function getOrCreateDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    token = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}

export function getOrCreateBrowserId(): string {
  const cookieMatch = document.cookie.match(/(?:^|;\s*)vne_browser_id=([^;]+)/);
  const fromCookie = cookieMatch?.[1] ? decodeURIComponent(cookieMatch[1]) : '';
  const fromStorage = localStorage.getItem(BROWSER_ID_KEY) || '';
  let id =
    (fromStorage && /^[a-zA-Z0-9_-]{8,80}$/.test(fromStorage) && fromStorage) ||
    (fromCookie && /^[a-zA-Z0-9_-]{8,80}$/.test(fromCookie) && fromCookie) ||
    '';
  if (!id) {
    id = `brw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
  localStorage.setItem(BROWSER_ID_KEY, id);
  document.cookie = `vne_browser_id=${encodeURIComponent(id)}; max-age=31536000; path=/; SameSite=Lax`;
  return id;
}

export function getTodayVnDateKey(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export interface LocalDemoMailerQuota {
  date: string;
  recipient: string;
  sentAt: string;
}

export function readLocalDemoMailerQuota(): LocalDemoMailerQuota | null {
  try {
    const raw = localStorage.getItem(DEMO_MAILER_QUOTA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDemoMailerQuota;
    if (!parsed || parsed.date !== getTodayVnDateKey()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalDemoMailerQuota(recipient: string): void {
  try {
    const payload: LocalDemoMailerQuota = {
      date: getTodayVnDateKey(),
      recipient: recipient.trim(),
      sentAt: new Date().toISOString(),
    };
    localStorage.setItem(DEMO_MAILER_QUOTA_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors
  }
}

export async function pingPhpApi(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1200);
    const res = await fetch('/api/exams.php?action=health', {
      method: 'GET',
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    return ct.includes('application/json');
  } catch {
    return false;
  }
}

export interface ApiDetailedResponse<T> {
  reachedJson: boolean;
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export async function apiRequestDetailed<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiDetailedResponse<T>> {
  try {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) ?? {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(path, {
      ...options,
      headers,
    });
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      return {
        reachedJson: false,
        ok: false,
        status: res.status,
        data: null,
        error: `Máy chủ phản hồi lỗi HTTP ${res.status} (không phải JSON).`,
      };
    }
    const json = (await res.json()) as T & { error?: string };
    return {
      reachedJson: true,
      ok: res.ok,
      status: res.status,
      data: json,
      error: typeof json?.error === 'string' ? json.error : undefined,
    };
  } catch {
    return { reachedJson: false, ok: false, status: 0, data: null };
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  const res = await apiRequestDetailed<T>(path, options);
  return res.ok ? res.data : null;
}

export function generateClientReceiptId(attemptId: string): string {
  return `VNE-${attemptId.slice(-6).toUpperCase()}`;
}
