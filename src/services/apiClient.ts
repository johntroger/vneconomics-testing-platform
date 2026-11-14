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
export const SYNC_CHANNEL_NAME = 'vne_exam_sync_channel';

export function getOrCreateDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    token = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
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

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
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
    if (!ct.includes('application/json')) return null;
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function generateClientReceiptId(attemptId: string): string {
  return `VNE-${attemptId.slice(-6).toUpperCase()}`;
}
