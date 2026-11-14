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
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useExamPlatform } from '../context/ExamContext';

const DOMAIN_CHIPS = ['@gmail.com', '@st.ueh.edu.vn', '@edu.vn', '@icloud.com'];
const COMMON_EMAIL_TYPOS = ['@gmai.com', '@gmial.com', '@gnail.com', '@yaho.com', '@gamil.com'];

export const HomePortalPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { exams, courses, attempts, startOrResumeAttempt } = useExamPlatform();

  const initialPin = searchParams.get('pin') ?? '';
  const [pin, setPin] = useState(initialPin);
  const [studentCode, setStudentCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [className, setClassName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isInAppWebView = useMemo(() => {
    const ua = navigator.userAgent || '';
    return /(Zalo|FBAN|FBAV|Instagram|Line\/)/i.test(ua);
  }, []);

  const [bypassWebViewNotice, setBypassWebViewNotice] = useState(false);

  const matchedExam = useMemo(
    () => exams.find((e) => e.roomPin === pin.trim()),
    [exams, pin],
  );
  const matchedCourse = useMemo(
    () => courses.find((c) => c.id === matchedExam?.courseId),
    [courses, matchedExam],
  );

  const typoWarning = useMemo(() => {
    const lower = studentEmail.toLowerCase();
    return COMMON_EMAIL_TYPOS.find((bad) => lower.includes(bad)) ?? null;
  }, [studentEmail]);

  const applyDomainChip = (domain: string) => {
    const localPart = studentEmail.split('@')[0]?.trim() || studentCode.trim().toLowerCase() || 'sinhvien';
    setStudentEmail(`${localPart}${domain}`);
  };

  const fillDemoStudent = (targetPin?: string) => {
    const activePin = (targetPin ?? pin).trim();
    const targetExam = exams.find((e) => e.roomPin === activePin);
    const submittedCodes = new Set(
      targetExam
        ? attempts
            .filter(
              (a) =>
                a.examId === targetExam.id &&
                (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'),
            )
            .map((a) => a.studentCode.toUpperCase())
        : [],
    );

    const nextDemoCode = () => {
      let seq = 3122102888;
      while (submittedCodes.has(String(seq)) && seq < 3122102999) {
        seq += 1;
      }
      return String(seq);
    };

    const currentCode = studentCode.trim().toUpperCase();
    if (!currentCode || (currentCode.startsWith('31221028') && submittedCodes.has(currentCode))) {
      setStudentCode(nextDemoCode());
    }
    if (!className.trim()) setClassName('K48-KT01');
    if (!studentName.trim()) setStudentName('Trần Thanh Tùng');
    if (!studentEmail.trim()) setStudentEmail('tranthanhtung37@gmail.com');
    setError('');
  };

  const selectDemoRoomPin = (roomPin: string) => {
    setPin(roomPin);
    fillDemoStudent(roomPin);
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
    if (studentName.trim().length < 2 || className.trim().length < 2) {
      setError('Vui lòng điền đầy đủ Họ tên và Lớp học phần.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail.trim())) {
      setError('Địa chỉ Email nhận kết quả chưa đúng định dạng.');
      return;
    }

    setLoading(true);
    const res = await startOrResumeAttempt({
      pin,
      studentCode,
      studentName,
      className,
      studentEmail,
    });
    setLoading(false);

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
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold shadow-sm">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-ink-900 leading-none">
              VNEconomics Testing
            </p>
            <p className="text-[11px] text-ink-500 mt-0.5">
              Khảo thí Trực tuyến Mobile-First
            </p>
          </div>
        </div>
        <Link
          to="/admin"
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-ink-700 hover:border-brand-400 hover:text-brand-700 flex items-center gap-1.5 transition"
        >
          <Lock className="w-3.5 h-3.5" />
          Giảng viên
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 py-6">
        <div className="w-full max-w-md space-y-4">
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
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
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
                {matchedExam && (
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
                    onClick={() => fillDemoStudent()}
                    className="text-[11px] font-semibold text-brand-700 hover:text-brand-800 hover:underline"
                  >
                    Điền nhanh SV mẫu
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-700 mb-1">
                      Mã số SV (MSSV)
                    </label>
                    <input
                      type="text"
                      value={studentCode}
                      onChange={(e) => setStudentCode(e.target.value)}
                      placeholder="3122102..."
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 font-mono text-sm font-semibold text-ink-900 placeholder:text-slate-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-700 mb-1">
                      Lớp học phần
                    </label>
                    <input
                      type="text"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      placeholder="K48-KT01"
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm text-ink-900 placeholder:text-slate-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              {/* Student Full Name */}
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
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

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
