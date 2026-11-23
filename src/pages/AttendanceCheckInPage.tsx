import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  KeyRound,
  MapPin,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserCheck,
} from 'lucide-react';
import { getOrCreateBrowserId, getOrCreateDeviceToken } from '../services/apiClient';
import {
  computeHardwareFingerprint,
  lookupAttendancePin,
  submitAttendanceCheckIn,
} from '../services/attendanceApi';
import type { AttendanceLookupResult, AttendanceRecord } from '../types/attendance';

function getDeviceLabel(): string {
  const ua = navigator.userAgent || '';
  let browser = 'Trình duyệt khác';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';

  let os = 'Desktop';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  return `${browser} / ${os}`;
}

function requestGpsLocation(): Promise<
  { ok: true; lat: number; lng: number; accuracy: number } | { ok: false; error: string }
> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({
      ok: false,
      error: 'Trình duyệt không hỗ trợ định vị GPS. Vui lòng mở bằng Chrome hoặc Safari.',
    });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          resolve({
            ok: false,
            error:
              'Bạn cần bấm "Cho phép" quyền Vị trí (GPS) trên trình duyệt để xác nhận đang có mặt tại lớp.',
          });
        } else {
          resolve({
            ok: false,
            error: 'Không thể lấy tọa độ GPS. Vui lòng bật Dịch vụ định vị trên điện thoại và thử lại.',
          });
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}

interface StoredReceipt {
  record: AttendanceRecord;
  sessionTitle: string;
  classTitle: string;
}

export const AttendanceCheckInPage: React.FC = () => {
  const { pin: paramPin } = useParams<{ pin?: string }>();
  const [searchParams] = useSearchParams();
  const qrToken = searchParams.get('t') ?? '';

  const [pinInput, setPinInput] = useState(
    (paramPin ?? searchParams.get('pin') ?? '').replace(/\D/g, ''),
  );
  const [lookup, setLookup] = useState<AttendanceLookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const [studentCode, setStudentCode] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [className, setClassName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [locationDenied, setLocationDenied] = useState(false);
  const [receipt, setReceipt] = useState<StoredReceipt | null>(null);
  const [nowClock, setNowClock] = useState(() => new Date().toLocaleTimeString('vi-VN'));

  const isInAppWebView = useMemo(
    () => /(Zalo|FBAN|FBAV|Instagram|Line\/)/i.test(navigator.userAgent || ''),
    [],
  );
  const isIOSDevice = useMemo(
    () => /iPhone|iPad|iPod/i.test(navigator.userAgent || ''),
    [],
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowClock(new Date().toLocaleTimeString('vi-VN'));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleLookupPin = async (targetPin: string) => {
    const clean = targetPin.replace(/\D/g, '');
    if (clean.length < 4) {
      setLookupError('Vui lòng nhập Mã PIN buổi điểm danh (6 chữ số).');
      return;
    }
    setLookupLoading(true);
    setLookupError('');
    const res = await lookupAttendancePin(clean);
    setLookupLoading(false);
    if (!res.ok || !res.lookup) {
      setLookup(null);
      setLookupError(res.error ?? 'Không tìm thấy buổi điểm danh.');
      return;
    }
    setLookup(res.lookup);
    try {
      const savedRaw = localStorage.getItem(`vne_att_receipt_${res.lookup.sessionId}`);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as StoredReceipt;
        if (parsed?.record?.studentCode) {
          setReceipt(parsed);
        }
      }
    } catch {
      // Ignore storage error
    }
  };

  useEffect(() => {
    if (paramPin && paramPin.replace(/\D/g, '').length >= 4) {
      void handleLookupPin(paramPin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramPin]);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookup) return;
    setSubmitError('');
    setLocationDenied(false);

    const cleanCode = studentCode.trim().toUpperCase();
    if (!cleanCode) {
      setSubmitError('Vui lòng nhập Mã số sinh viên (MSSV).');
      return;
    }
    if (lookup.requirePasscode && !passcode.trim()) {
      setSubmitError('Vui lòng nhập Mật khẩu điểm danh do giảng viên cung cấp.');
      return;
    }
    if (!lookup.requireRosterMatch && (!lastName.trim() || !firstName.trim() || !className.trim())) {
      setSubmitError('Vui lòng nhập đầy đủ Họ đệm, Tên và Lớp học.');
      return;
    }

    setSubmitting(true);
    let lat: number | null = null;
    let lng: number | null = null;
    let acc: number | null = null;

    if (lookup.requireGps) {
      const loc = await requestGpsLocation();
      if (!loc.ok) {
        setSubmitting(false);
        setLocationDenied(true);
        setSubmitError(loc.error);
        return;
      }
      lat = loc.lat;
      lng = loc.lng;
      acc = loc.accuracy;
    }

    const res = await submitAttendanceCheckIn({
      pin: lookup.checkinPin,
      passcode: passcode.trim() || undefined,
      qrToken: qrToken || undefined,
      studentCode: cleanCode,
      lastName: lastName.trim() || undefined,
      firstName: firstName.trim() || undefined,
      className: className.trim() || undefined,
      deviceToken: getOrCreateDeviceToken(),
      browserId: getOrCreateBrowserId(),
      hardwareFingerprint: computeHardwareFingerprint(),
      deviceLabel: getDeviceLabel(),
      locationLat: lat,
      locationLng: lng,
      locationAccuracy: acc,
    });
    setSubmitting(false);

    if (!res.ok || !res.record) {
      setSubmitError(res.error ?? 'Điểm danh không thành công.');
      return;
    }

    const nextReceipt: StoredReceipt = {
      record: res.record,
      sessionTitle: res.sessionTitle ?? lookup.sessionTitle,
      classTitle: res.classTitle ?? lookup.classTitle,
    };
    setReceipt(nextReceipt);
    try {
      localStorage.setItem(
        `vne_att_receipt_${lookup.sessionId}`,
        JSON.stringify(nextReceipt),
      );
    } catch {
      // Ignore storage error
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-surface-100 to-slate-100 flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-700 hover:text-brand-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Trang chủ
          </Link>
          <div className="flex items-center gap-2 text-xs font-extrabold text-brand-700">
            <QrCode className="w-4 h-4" />
            <span>Điểm danh QR Thông minh</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 pb-10">
        <div className="w-full max-w-lg space-y-4">
          {isInAppWebView && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold">Đang mở trong trình duyệt Zalo / Messenger</p>
                <p className="mt-0.5 text-amber-800">
                  Vui lòng bấm dấu <strong>⋯</strong> góc trên và chọn{' '}
                  <strong>Mở bằng Safari / Chrome</strong> để hệ thống lấy GPS chính xác.
                </p>
              </div>
            </div>
          )}

          {receipt ? (
            <div className="bg-white rounded-3xl border-2 border-emerald-300 shadow-lg p-6 space-y-4 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold ${
                    receipt.record.attendanceStatus === 'LATE'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {receipt.record.attendanceStatus === 'LATE'
                    ? 'ĐIỂM DANH THÀNH CÔNG (ĐI MUỘN)'
                    : 'ĐIỂM DANH THÀNH CÔNG (CÓ MẶT)'}
                </span>
                <h1 className="text-xl font-extrabold text-ink-900 mt-2">
                  {receipt.record.studentName}
                </h1>
                <p className="text-sm font-mono font-bold text-brand-700">
                  MSSV: {receipt.record.studentCode}
                  {receipt.record.className ? ` • ${receipt.record.className}` : ''}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-left text-xs space-y-2">
                <div className="flex justify-between gap-2">
                  <span className="text-ink-500">Lớp học phần:</span>
                  <span className="font-bold text-ink-900 text-right">{receipt.classTitle}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-ink-500">Buổi học:</span>
                  <span className="font-bold text-ink-900 text-right">{receipt.sessionTitle}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-ink-500">Thời gian ghi nhận:</span>
                  <span className="font-mono font-bold text-ink-900">
                    {receipt.record.checkedInAt
                      ? new Date(receipt.record.checkedInAt).toLocaleString('vi-VN')
                      : nowClock}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-ink-500">Thiết bị:</span>
                  <span className="font-semibold text-ink-800">
                    {receipt.record.deviceLabel || getDeviceLabel()}
                  </span>
                </div>
                {receipt.record.distanceMeters !== null && (
                  <div className="flex justify-between gap-2">
                    <span className="text-ink-500">Vị trí GPS:</span>
                    <span
                      className={`font-bold ${
                        receipt.record.locationFlag === 'FAR_LOCATION'
                          ? 'text-rose-600'
                          : 'text-emerald-700'
                      }`}
                    >
                      Cách tâm lớp {receipt.record.distanceMeters}m
                    </span>
                  </div>
                )}
              </div>

              {(receipt.record.deviceFlag || receipt.record.locationFlag) && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 text-left">
                  <p className="font-bold">Lưu ý từ hệ thống:</p>
                  <p className="mt-0.5">
                    Lượt điểm danh này có gắn cờ kiểm tra ({receipt.record.deviceFlag || ''}{' '}
                    {receipt.record.locationFlag || ''}). Vui lòng giơ màn hình này nếu giảng viên kiểm tra tại lớp.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 text-xs font-mono text-ink-500 pt-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Đồng hồ xác thực trực tiếp: {nowClock}</span>
              </div>
            </div>
          ) : !lookup ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-lg p-6 space-y-4">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-[11px] font-extrabold">
                  <QrCode className="w-3.5 h-3.5" />
                  ĐIỂM DANH LỚP HỌC
                </span>
                <h1 className="text-xl font-extrabold text-ink-900 mt-2">
                  Nhập Mã PIN Điểm danh
                </h1>
                <p className="text-xs text-ink-600 mt-1">
                  Quét mã QR trên màn chiếu hoặc nhập mã PIN 6 chữ số do giảng viên cung cấp.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleLookupPin(pinInput);
                }}
                className="space-y-3"
              >
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="VD: 482910"
                  className="w-full h-12 px-4 rounded-2xl border border-slate-300 font-mono text-xl font-extrabold tracking-[0.2em] text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {lookupError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
                    {lookupError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={lookupLoading}
                  className="w-full h-11 rounded-2xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-extrabold transition"
                >
                  {lookupLoading ? 'Đang tìm buổi học...' : 'Tiếp tục điểm danh'}
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-lg p-6 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                      lookup.status === 'OPEN'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {lookup.status === 'OPEN' ? '● ĐANG MỞ ĐIỂM DANH' : 'ĐÃ ĐÓNG ĐIỂM DANH'}
                  </span>
                  <h1 className="text-lg font-extrabold text-ink-900 mt-1.5">
                    {lookup.classTitle}
                  </h1>
                  <p className="text-xs text-ink-600 font-semibold">
                    {lookup.sessionTitle}
                    {lookup.instructorName ? ` • GV: ${lookup.instructorName}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLookup(null);
                    setSubmitError('');
                  }}
                  className="text-xs font-bold text-ink-500 hover:text-ink-900 shrink-0"
                >
                  Đổi PIN
                </button>
              </div>

              {lookup.status !== 'OPEN' ? (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
                  Buổi điểm danh này đã kết thúc thời gian quét QR. Nếu bạn có mặt tại lớp, vui lòng báo trực tiếp với giảng viên để được cập nhật trong bảng quản trị.
                </div>
              ) : (
                <form onSubmit={handleCheckIn} className="space-y-3">
                  {(lookup.checkinPin === '888999' || searchParams.get('demo') === '1') && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-extrabold">Chế độ Demo:</span>{' '}
                        <span>MSSV mẫu <code className="font-mono font-bold">2026000006</code> • Pass <code className="font-mono font-bold">2026</code></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setStudentCode('2026000006');
                          setPasscode('2026');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]"
                      >
                        Điền nhanh SV Demo
                      </button>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-ink-700 mb-1">
                      Mã số sinh viên (MSSV) *
                    </label>
                    <input
                      type="text"
                      required
                      value={studentCode}
                      onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
                      placeholder="VD: 2026000001"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-300 font-mono text-sm font-bold uppercase focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  {!lookup.requireRosterMatch && (
                    <div className="space-y-3 p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200">
                      <p className="text-[11px] font-bold text-sky-900">
                        Buổi học mở tự ghi danh — Vui lòng nhập đúng thông tin theo mẫu lớp:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-bold text-ink-700 mb-1">
                            Họ đệm *
                          </label>
                          <input
                            type="text"
                            required
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="VD: Nguyễn Văn"
                            className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-ink-700 mb-1">
                            Tên *
                          </label>
                          <input
                            type="text"
                            required
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="VD: An"
                            className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-ink-700 mb-1">
                          Lớp học *
                        </label>
                        <input
                          type="text"
                          required
                          value={className}
                          onChange={(e) => setClassName(e.target.value.toUpperCase())}
                          placeholder="VD: DEMO101"
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-mono text-sm font-bold uppercase focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  )}

                  {lookup.requirePasscode && (
                    <div>
                      <label className="block text-xs font-bold text-ink-700 mb-1 flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5 text-brand-600" />
                        Mật khẩu buổi điểm danh (Passcode) *
                      </label>
                      <input
                        type="text"
                        required
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        placeholder="Nhập mật khẩu GV chiếu/đọc trên lớp"
                        className="w-full h-11 px-3.5 rounded-xl border border-slate-300 font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  )}

                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[11px] text-ink-600 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-ink-700">
                      <Smartphone className="w-3.5 h-3.5 text-brand-600" />
                      <span>Thiết bị: {getDeviceLabel()} (Khóa 1 SV / 1 máy)</span>
                    </div>
                    {lookup.requireGps && (
                      <div className="flex items-center gap-1.5 font-semibold text-ink-700">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Yêu cầu bật Định vị GPS (bán kính {lookup.maxDistanceMeters}m)</span>
                      </div>
                    )}
                  </div>

                  {submitError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold space-y-1.5">
                      <p>{submitError}</p>
                      {locationDenied && (
                        <p className="text-[11px] text-rose-600">
                          {isIOSDevice
                            ? 'iPhone: Cài đặt → Quyền riêng tư & Bảo mật → Dịch vụ định vị → Safari/Chrome → Khi dùng ứng dụng.'
                            : 'Android: Bấm biểu tượng ổ khóa cạnh thanh địa chỉ → Quyền → Vị trí → Cho phép.'}
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm transition"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Đang xác thực GPS & Thiết bị...</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-4 h-4" />
                        <span>Xác nhận Điểm danh</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-ink-500 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Hệ thống tự động kiểm tra thiết bị và vị trí chống điểm danh hộ</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
