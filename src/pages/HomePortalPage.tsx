import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Lock,
  Mail,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { RoomMatchOption, useExamPlatform } from '../context/ExamContext';

const DOMAIN_CHIPS = ['@gmail.com', '@st.ueh.edu.vn', '@edu.vn', '@icloud.com'];
const COMMON_EMAIL_TYPOS = ['@gmai.com', '@gmial.com', '@gnail.com', '@yaho.com', '@gamil.com'];

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

function requestStudentLocation(): Promise<
  { ok: true; lat: number; lng: number; accuracy: number } | { ok: false; error: string }
> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({
      ok: false,
      error: 'Trình duyệt hoặc thiết bị này không hỗ trợ định vị Vị trí (GPS). Vui lòng dùng Chrome/Safari mới nhất.',
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
              'Bắt buộc bật & cấp quyền Vị trí (Location) để vào phòng thi (chống thi hộ). Vui lòng bấm Cho phép truy cập vị trí trên trình duyệt rồi thử lại.',
          });
        } else {
          resolve({
            ok: false,
            error:
              'Không thể lấy tọa độ Vị trí (GPS/Wi-Fi). Hãy bật Dịch vụ định vị (Location) trên thiết bị và thử lại.',
          });
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export const HomePortalPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { exams, courses, attempts, startOrResumeAttempt } = useExamPlatform();

  const initialPin = searchParams.get('pin') ?? '';
  const [pin, setPin] = useState(initialPin);
  const [studentCode, setStudentCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [gender, setGender] = useState('Nam');
  const [dob, setDob] = useState('');
  const [className, setClassName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [pinMatches, setPinMatches] = useState<RoomMatchOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isInAppWebView = useMemo(() => {
    const ua = navigator.userAgent || '';
    return /(Zalo|FBAN|FBAV|Instagram|Line\/)/i.test(ua);
  }, []);

  const [bypassWebViewNotice, setBypassWebViewNotice] = useState(false);

  const matchedExam = useMemo(
    () =>
      (selectedExamId ? exams.find((e) => e.id === selectedExamId) : undefined) ??
      exams.find((e) => e.roomPin === pin.trim()),
    [exams, pin, selectedExamId],
  );
  const matchedCourse = useMemo(
    () => courses.find((c) => c.id === matchedExam?.courseId),
    [courses, matchedExam],
  );
  const requiresRosterVerification = Boolean(
    matchedExam?.requiresRosterVerification ||
      (matchedExam?.rosterEntries && matchedExam.rosterEntries.length > 0),
  );

  const typoWarning = useMemo(() => {
    const lower = studentEmail.toLowerCase();
    return COMMON_EMAIL_TYPOS.find((bad) => lower.includes(bad)) ?? null;
  }, [studentEmail]);

  const applyDomainChip = (domain: string) => {
    const localPart = studentEmail.split('@')[0]?.trim() || studentCode.trim().toLowerCase() || 'sinhvien';
    setStudentEmail(`${localPart}${domain}`);
  };

  const isDefaultDemoEmail = (email: string) => {
    const lower = email.trim().toLowerCase();
    return (
      !lower ||
      lower === 'sinhvien.demo@vneconomics.com' ||
      lower === 'tranthanhtung37@gmail.com'
    );
  };

  const buildDemoProfile = (targetPin?: string) => {
    const activePin = (targetPin ?? pin).trim() || '101202';
    const targetExam = exams.find((e) => e.roomPin === activePin);
    const usedCodes = new Set(
      targetExam
        ? attempts
            .filter((a) => a.examId === targetExam.id)
            .map((a) => a.studentCode.toUpperCase())
        : [],
    );

    let demoCode = '';
    for (let i = 0; i < 20; i += 1) {
      const rand = Math.floor(100000 + Math.random() * 900000);
      const candidate = `DEMO${rand}`;
      if (!usedCodes.has(candidate)) {
        demoCode = candidate;
        break;
      }
    }
    if (!demoCode) {
      demoCode = `DEMO${Date.now().toString().slice(-6)}`;
    }

    const suffix = demoCode.slice(-4);
    const chosenClass =
      !className.trim() || className === 'K48-KT01' || className === 'K48-DEMO'
        ? 'K48-DEMO'
        : className.trim();
    const chosenName =
      !studentName.trim() ||
      studentName === 'Trần Thanh Tùng' ||
      studentName.startsWith('Sinh viên ')
        ? `Sinh viên Trải nghiệm #${suffix}`
        : studentName.trim();
    const chosenEmail = isDefaultDemoEmail(studentEmail)
      ? 'sinhvien.demo@vneconomics.com'
      : studentEmail.trim();

    return {
      activePin,
      demoCode,
      chosenClass,
      chosenName,
      chosenEmail,
    };
  };

  const fillDemoStudent = (targetPin?: string, forceFreshCode = true) => {
    const profile = buildDemoProfile(targetPin);
    if (targetPin || !pin.trim()) {
      setPin(profile.activePin);
    }
    const currentCode = studentCode.trim().toUpperCase();
    if (
      forceFreshCode ||
      !currentCode ||
      currentCode.startsWith('DEMO') ||
      currentCode.startsWith('31221028')
    ) {
      setStudentCode(profile.demoCode);
      setStudentName(profile.chosenName);
    }
    setClassName(profile.chosenClass);
    setStudentEmail(profile.chosenEmail);
    setError('');
  };

  const selectDemoRoomPin = (roomPin: string) => {
    setPin(roomPin);
    fillDemoStudent(roomPin, true);
  };

  const startQuickDemoStudent = async (targetPin = '101202') => {
    const profile = buildDemoProfile(targetPin);
    setPin(profile.activePin);
    setStudentCode(profile.demoCode);
    setClassName(profile.chosenClass);
    setStudentName(profile.chosenName);
    setStudentEmail(profile.chosenEmail);
    setError('');
    setLoading(true);

    const res = await startOrResumeAttempt({
      pin: profile.activePin,
      studentCode: profile.demoCode,
      studentName: profile.chosenName,
      className: profile.chosenClass,
      studentEmail: profile.chosenEmail,
    });
    setLoading(false);

    if (!res.ok || !res.attemptId || !res.examId) {
      setError(res.error ?? 'Không thể khởi tạo phiên thi thử Demo.');
      return;
    }

    if (res.alreadySubmitted) {
      navigate(`/exam/${res.examId}/result?attempt=${res.attemptId}`);
      return;
    }

    navigate(`/exam/${res.examId}/lobby?attempt=${res.attemptId}`);
  };

  const handleOpenExternalBrowser = () => {
    const url = window.location.href;
    if (/Android/i.test(navigator.userAgent)) {
      const noProto = url.replace(/^https?:\/\//, '');
      window.location.href = `intent://${noProto}#Intent;scheme=https;package=com.android.chrome;end`;
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
      alert('Đã sao chép đường dẫn! Vui lòng mở Safari / Chrome và dán liên kết để thi an toàn.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!/^\d{6}$/.test(pin.trim())) {
      setError('Vui lòng nhập đúng Mã phòng thi 6 chữ số.');
      return;
    }
    if (studentCode.trim().length < 4) {
      setError('Vui lòng nhập Mã số sinh viên (MSSV) hợp lệ.');
      return;
    }
    if (requiresRosterVerification) {
      if (!lastName.trim() || !firstName.trim()) {
        setError('Vui lòng điền đầy đủ Họ đệm và Tên theo danh sách ca thi.');
        return;
      }
      if (!gender.trim() || !dob.trim()) {
        setError('Vui lòng điền đầy đủ Giới tính và Ngày sinh (DD-MM-YYYY).');
        return;
      }
    } else if (studentName.trim().length < 2 || className.trim().length < 2) {
      setError('Vui lòng điền đầy đủ Họ tên và Lớp học phần.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail.trim())) {
      setError('Địa chỉ Email nhận kết quả chưa đúng định dạng.');
      return;
    }

    const effectiveFullName = requiresRosterVerification
      ? `${lastName.trim()} ${firstName.trim()}`
      : studentName.trim();

    setLoading(true);
    const loc = await requestStudentLocation();
    if (!loc.ok) {
      setLoading(false);
      setError(loc.error);
      return;
    }

    const res = await startOrResumeAttempt({
      pin,
      examId: selectedExamId || undefined,
      studentCode,
      studentName: effectiveFullName,
      lastName: requiresRosterVerification ? lastName : undefined,
      firstName: requiresRosterVerification ? firstName : undefined,
      gender: requiresRosterVerification ? gender : undefined,
      dob: requiresRosterVerification ? dob : undefined,
      className: className.trim() || (requiresRosterVerification ? 'K48' : ''),
      studentEmail,
      deviceLabel: getDeviceLabel(),
      locationLat: loc.lat,
      locationLng: loc.lng,
      locationAccuracy: loc.accuracy,
    });
    setLoading(false);

    if (res.needsExamChoice && res.matches && res.matches.length > 1) {
      setPinMatches(res.matches);
      setError('Mã PIN này có nhiều bài thi. Hãy chọn đúng học phần & bài kiểm tra bên dưới rồi bấm vào thi.');
      return;
    }

    if (!res.ok || !res.attemptId || !res.examId) {
      setError(res.error ?? 'Không thể vào phòng thi.');
      return;
    }

    if (res.alreadySubmitted) {
      navigate(`/exam/${res.examId}/result?attempt=${res.attemptId}`);
      return;
    }

    navigate(`/exam/${res.examId}/lobby?attempt=${res.attemptId}`);
  };

  return (
    <div className="min-h-screen bg-surface-100 flex flex-col">
      {/* Top Minimal Header */}
      <header className="bg-white border-b border-slate-200 px-3 sm:px-4 py-3 safe-top flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-ink-900 leading-none truncate">
              VNEconomics Testing
            </p>
            <p className="text-[11px] text-ink-500 mt-0.5 truncate">
              Khảo thí Trực tuyến Mobile-First
            </p>
          </div>
        </div>
        <Link
          to="/admin"
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-ink-700 hover:border-brand-400 hover:text-brand-700 flex items-center gap-1.5 transition shrink-0 whitespace-nowrap"
        >
          <Lock className="w-3.5 h-3.5" />
          Giảng viên
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-3 sm:px-4 pt-5 pb-10 safe-bottom">
        <div className="w-full max-w-xl space-y-4">
          {/* Public Demo Sandbox Quick-Access Banner (Student & Instructor) */}
          <div className="bg-gradient-to-br from-brand-50 via-white to-support-50 rounded-2xl border border-brand-200 shadow-sm p-4 sm:p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-brand-700 bg-brand-100/80 px-2.5 py-0.5 rounded-full">
                  <Sparkles className="w-3 h-3" /> Trải nghiệm Công khai (Demo 1-Chạm)
                </span>
                <h2 className="text-sm sm:text-base font-extrabold text-ink-900 mt-1.5">
                  Dùng thử Hệ thống cho Sinh viên &amp; Giảng viên bất kỳ
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Student Demo Card */}
              <div className="bg-white/95 rounded-xl border border-brand-200/80 p-3.5 flex flex-col justify-between gap-2.5">
                <div>
                  <p className="text-xs font-extrabold text-brand-900 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-brand-600 shrink-0" />
                    Tài khoản Sinh viên Demo
                  </p>
                  <p className="text-[11px] text-ink-600 mt-1 leading-relaxed">
                    Tự động cấp MSSV <span className="font-mono font-bold text-brand-700">DEMOxxxxxx</span> mới tinh không trùng người thi khác để bạn vào thi thử nhiều lần trên mọi thiết bị.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void startQuickDemoStudent('101202')}
                    className="w-full py-2 px-3 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    {loading ? 'Đang tạo phiên thi Demo...' : 'Thi thử ngay (SV Demo • 101202)'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemoStudent('101202', true)}
                    className="text-[11px] font-semibold text-brand-700 hover:underline text-center"
                  >
                    Chỉ điền sẵn SV Demo (để tự đổi Email nhận điểm)
                  </button>
                </div>
              </div>

              {/* Instructor Demo Card */}
              <div className="bg-white/95 rounded-xl border border-support-200/90 p-3.5 flex flex-col justify-between gap-2.5">
                <div>
                  <p className="text-xs font-extrabold text-ink-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-support-600 shrink-0" />
                    Tài khoản Giảng viên Demo
                  </p>
                  <p className="text-[11px] text-ink-600 mt-1 leading-relaxed">
                    Vào ngay Cổng Quản trị (<span className="font-mono font-bold">vne2026</span>) để test Tạo đề Ma trận, Ngân hàng câu hỏi, Giám sát Live &amp; Chấm Rubric.
                  </p>
                </div>
                <Link
                  to="/admin?demo=1"
                  className="w-full py-2 px-3 rounded-lg bg-support-600 hover:bg-support-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Vào Quản trị Giảng viên Demo
                </Link>
              </div>
            </div>
          </div>

          {/* Zalo/Messenger In-App Browser Guard */}
          {isInAppWebView && !bypassWebViewNotice && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-rose-900">
                    Đang mở trong trình duyệt Zalo / Messenger
                  </h2>
                  <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                    Trình duyệt nội bộ dễ bị tin nhắn bay tới làm văng bài và mất focus oan. Hãy mở bằng <strong>Chrome hoặc Safari</strong> trước khi làm bài.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleOpenExternalBrowser}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  Mở sang Chrome / Safari để thi an toàn
                </button>
                <button
                  type="button"
                  onClick={() => setBypassWebViewNotice(true)}
                  className="text-[11px] text-rose-700 underline text-center"
                >
                  Tôi chỉ đang xem thử trên trình duyệt này
                </button>
              </div>
            </div>
          )}

          {/* Main Student Entry Card (No Account Needed) */}
          <div className="bg-white rounded-2xl shadow-card border border-slate-200 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-support-600 bg-support-50 px-2.5 py-1 rounded-full">
                  <Smartphone className="w-3 h-3" /> Không cần tạo tài khoản
                </span>
                <h1 className="text-xl font-extrabold text-ink-900 mt-2">
                  Vào phòng kiểm tra
                </h1>
              </div>
              <ShieldCheck className="w-8 h-8 text-brand-600 shrink-0 opacity-85" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Room PIN */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">
                  Mã phòng thi (6 số)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, ''));
                    setPinMatches([]);
                    setSelectedExamId('');
                  }}
                  placeholder="Ví dụ: 101202"
                  className="w-full h-12 px-3.5 rounded-xl border border-slate-300 font-mono text-lg font-bold tracking-[0.2em] text-ink-900 placeholder:text-slate-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {/* Quick Demo PIN pills for rapid testing */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-ink-500">Phòng thi mở mẫu:</span>
                  {exams
                    .filter((ex) => ex.status === 'OPEN')
                    .map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => selectDemoRoomPin(ex.roomPin)}
                        className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md border transition ${
                          pin === ex.roomPin
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-slate-50 text-brand-700 border-slate-200 hover:border-brand-300'
                        }`}
                      >
                        {ex.roomPin}
                      </button>
                    ))}
                </div>
                {pinMatches.length > 1 && (
                  <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
                    <div className="text-[11px] font-bold text-amber-900">
                      Chọn đúng Học phần &amp; Bài kiểm tra cho mã PIN {pin}:
                    </div>
                    <div className="space-y-1">
                      {pinMatches.map((m) => (
                        <button
                          key={m.examId}
                          type="button"
                          onClick={() => {
                            setSelectedExamId(m.examId);
                            setError('');
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs transition ${
                            selectedExamId === m.examId
                              ? 'bg-brand-600 text-white border-brand-600 font-bold'
                              : 'bg-white text-ink-800 border-amber-200 hover:border-brand-400'
                          }`}
                        >
                          <div className="font-bold">
                            {m.courseCode ? `${m.courseCode} — ${m.courseName}` : m.courseId}
                          </div>
                          <div className="text-[11px] opacity-90">
                            {m.examTitle} ({m.durationMinutes} phút • {m.status === 'OPEN' ? 'Đang mở' : m.status})
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {matchedExam && pinMatches.length <= 1 && (
                  <div className="mt-2 px-3 py-2 rounded-xl bg-brand-50 border border-brand-200 text-xs text-brand-900">
                    <span className="font-bold">{matchedCourse?.code}:</span> {matchedExam.title} ({matchedExam.durationMinutes} phút)
                  </div>
                )}
              </div>

              {/* MSSV + Class */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => fillDemoStudent(undefined, true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Cấp MSSV Demo mới ngẫu nhiên
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-ink-700 mb-1">
                      Mã số SV (MSSV)
                    </label>
                    <input
                      type="text"
                      value={studentCode}
                      onChange={(e) => setStudentCode(e.target.value)}
                      placeholder="3122102..."
                      className="w-full min-w-0 h-11 px-3 rounded-xl border border-slate-300 font-mono text-sm font-semibold text-ink-900 placeholder:text-slate-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-semibold text-ink-700 mb-1">
                      {requiresRosterVerification ? 'Lớp học phần (tùy chọn)' : 'Lớp học phần'}
                    </label>
                    <input
                      type="text"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      placeholder="K48-KT01"
                      className="w-full min-w-0 h-11 px-3 rounded-xl border border-slate-300 text-sm text-ink-900 placeholder:text-slate-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              {requiresRosterVerification ? (
                <div className="p-3.5 rounded-xl bg-brand-50/70 border border-brand-200 space-y-3">
                  <div className="text-[11px] font-bold text-brand-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0" />
                    Ca thi yêu cầu xác thực đúng thông tin theo danh sách sinh viên
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-ink-700 mb-1">
                        Họ đệm
                      </label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Đặng Quốc"
                        className="w-full min-w-0 h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-ink-700 mb-1">
                        Tên
                      </label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="An"
                        className="w-full min-w-0 h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-ink-700 mb-1">
                        Giới tính
                      </label>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="w-full min-w-0 h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                        <option value="Khác">Khác</option>
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-ink-700 mb-1">
                        Ngày sinh (DD-MM-YYYY)
                      </label>
                      <input
                        type="text"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        placeholder="08-02-2005"
                        className="w-full min-w-0 h-11 px-3 rounded-xl border border-slate-300 bg-white font-mono text-sm text-ink-900 placeholder:text-slate-300 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-ink-700 mb-1">
                    Họ và tên sinh viên
                  </label>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Nguyễn Văn An"
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-ink-900 placeholder:text-slate-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              )}

              {/* Email + 1-Tap Domain Chips */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-brand-600" />
                  Email nhận kết quả bài thi
                </label>
                <input
                  type="email"
                  inputMode="email"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  placeholder="sinhvien@gmail.com"
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-ink-900 placeholder:text-slate-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {DOMAIN_CHIPS.map((dom) => (
                    <button
                      key={dom}
                      type="button"
                      onClick={() => applyDomainChip(dom)}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-ink-700 border border-slate-200 transition"
                    >
                      {dom}
                    </button>
                  ))}
                </div>
                {typoWarning && (
                  <p className="text-[11px] text-amber-700 font-semibold mt-1.5">
                    Cảnh báo: Địa chỉ có chứa "{typoWarning}" — có thể bạn gõ nhầm "@gmail.com" hoặc "@yahoo.com"?
                  </p>
                )}
                {studentEmail.trim().toLowerCase() === 'sinhvien.demo@vneconomics.com' && (
                  <p className="text-[11px] text-ink-500 mt-1.5">
                    Mẹo: Có thể thay bằng Email thật của bạn để nhận thử biên nhận bảng điểm tự động sau khi nộp bài.
                  </p>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-ink-600 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                <span>
                  Bắt buộc <strong>mở Vị trí (Location)</strong> trên trình duyệt/điện thoại khi vào thi để xác thực phòng thi.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.99]"
              >
                {loading ? 'Đang kết nối phòng thi...' : 'Kiểm tra thiết bị & Vào phòng chờ'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          <div className="bg-white/80 rounded-xl border border-slate-200 px-4 py-3 text-[11px] text-ink-600 flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-support-600 shrink-0" />
            <span>
              Điểm số & biên nhận sẽ được gửi tự động về Email bạn cung cấp ngay sau khi hoàn thành (cho phép tự sửa lại email trong 5 phút nếu gõ nhầm).
            </span>
          </div>
        </div>
      </main>
    </div>
  );
};
