import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  HelpCircle,
  Lock,
  Printer,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  ADMIN_TAB_REGISTRY,
  GUIDE_RELEASE_NOTES,
  GUIDE_VERSION,
  INSTRUCTOR_FAQ_ITEMS,
  PRE_EXAM_CHECKLIST,
} from '../data/adminGuideRegistry';

export const InstructorGuidePage: React.FC = () => {
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleCheck = (index: number) => {
    setCheckedItems((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const checkedCount = PRE_EXAM_CHECKLIST.filter((_, idx) => checkedItems[idx]).length;

  return (
    <div className="min-h-screen bg-slate-50 text-ink-900 flex flex-col">
      {/* Top sticky navigation */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-3 print:hidden">
        <div className="w-full lg:px-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1 shadow-2xs shrink-0 overflow-hidden">
              <img src="/logo.png" alt="VNEconomics Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-ink-900 truncate">
                Cẩm nang Hướng dẫn Giảng viên
              </p>
              <p className="text-[11px] text-ink-500 truncate">
                Đồng bộ theo giao diện hiện hành (Phiên bản {GUIDE_VERSION})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-ink-700 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In / Lưu PDF</span>
            </button>
            <Link
              to="/"
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-ink-700 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Trang chủ</span>
            </Link>
            <Link
              to="/admin"
              className="h-9 px-3.5 rounded-xl bg-support-600 hover:bg-support-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Vào Cổng Giảng viên</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Hero Intro Card */}
        <section className="bg-gradient-to-br from-brand-50 via-white to-support-50 rounded-2xl border border-brand-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-700 bg-brand-100 px-3 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5" />
              Dành cho Giảng viên — Đủ 7 Tab từ trái sang phải
            </span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-ink-900">
              Hướng dẫn Tổ chức Kiểm tra &amp; Coi thi Trực tuyến VNEconomics
            </h1>
            <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">
              Thầy/cô không cần rành kỹ thuật: để tổ chức một buổi thi, chỉ cần đi lần lượt từ trái sang phải{' '}
              <strong className="text-ink-900">Tab 1 → Tab 2 → Tab 3 → Tab 4 → Tab 5</strong> trên{' '}
              <Link to="/admin" className="text-brand-700 font-bold underline">
                Cổng Giảng viên (/admin)
              </Link>
              . Hai thẻ bổ sung (<strong>Tab 6: Nhật ký Email</strong> &amp; <strong>Tab 7: Live Game</strong>) giúp đối soát thư báo điểm và tổ chức trò chơi ôn tập trên lớp.
            </p>
          </div>

          {/* Quick jump pills */}
          <div className="flex flex-wrap gap-1.5 pt-1 print:hidden">
            <a
              href="#cap-nhat-moi"
              className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 hover:border-emerald-400 text-xs font-bold text-emerald-800"
            >
              Có gì mới?
            </a>
            <a
              href="#dang-nhap"
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-brand-300 text-xs font-bold text-ink-700"
            >
              0. Đăng nhập
            </a>
            {ADMIN_TAB_REGISTRY.map((step) => (
              <a
                key={step.id}
                href={`#${step.guideAnchor}`}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-brand-300 text-xs font-bold text-ink-700"
              >
                {step.baseLabel}
              </a>
            ))}
            <a
              href="#checklist"
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-brand-300 text-xs font-bold text-ink-700"
            >
              Checklist trước giờ thi
            </a>
            <a
              href="#faq"
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-brand-300 text-xs font-bold text-ink-700"
            >
              Hỏi đáp (FAQ)
            </a>
          </div>
        </section>

        {/* What's New / Synced Updates */}
        {GUIDE_RELEASE_NOTES.map((note, idx) => (
          <section
            key={idx}
            id="cap-nhat-moi"
            className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-5 shadow-2xs space-y-2.5 scroll-mt-20"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-emerald-950 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                {note.title}
              </h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-200">
                Cập nhật: {note.date}
              </span>
            </div>
            <ul className="space-y-1.5 text-xs sm:text-sm text-emerald-950">
              {note.highlights.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* Overview Table */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <h2 className="text-base font-extrabold text-ink-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-brand-600" />
            Tóm tắt nhanh toàn bộ 7 thẻ (Tab) trong Cổng Giảng viên
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 text-ink-600">
                  <th className="py-2 pr-3 font-bold">Mục</th>
                  <th className="py-2 pr-3 font-bold">Tên Tab trên màn hình</th>
                  <th className="py-2 pr-3 font-bold">Chức năng chính</th>
                  <th className="py-2 font-bold">Khi nào dùng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ADMIN_TAB_REGISTRY.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-3 font-extrabold text-brand-700 whitespace-nowrap">
                      Bước {s.stepNumber}
                    </td>
                    <td className="py-2.5 pr-3 font-bold text-ink-900 whitespace-nowrap">
                      <a href={`#${s.guideAnchor}`} className="hover:underline text-brand-700">
                        {s.baseLabel}
                      </a>
                    </td>
                    <td className="py-2.5 pr-3 text-ink-700">{s.title}</td>
                    <td className="py-2.5 text-ink-500 whitespace-nowrap">{s.frequency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Step 0: Login */}
        <section
          id="dang-nhap"
          className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3 scroll-mt-20"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-base font-extrabold text-ink-900">
              Bước 0. Cách đăng nhập vào Cổng Giảng viên (/admin)
            </h2>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-ink-600">
              Chuẩn bị
            </span>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-ink-700 leading-relaxed">
            <li>
              Mở trình duyệt <strong>Google Chrome</strong> hoặc <strong>Microsoft Edge</strong> trên máy tính và bấm nút{' '}
              <strong>Giảng viên</strong> ở góc trên bên phải trang chủ.
            </li>
            <li>
              <strong>Cách nhanh nhất (khuyên dùng):</strong> Bấm <strong>Đăng nhập bằng Google</strong> rồi chọn tài khoản Gmail của thầy/cô — không cần nhớ thêm mật khẩu mới.
            </li>
            <li>
              Hoặc chọn thẻ <strong>Đăng ký tài khoản mới</strong> ở lần đầu để tạo tài khoản bằng Email &amp; Mật khẩu riêng.
            </li>
          </ol>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Lưu ý quan trọng:</strong> Nút <em>"Vào Quản trị Giảng viên Demo"</em> ngoài trang chủ chỉ dùng để xem thử. Khi tổ chức kiểm tra thật cho lớp, thầy/cô hãy đăng nhập bằng tài khoản Google hoặc Email cá nhân để lưu đề thi và bảng điểm lâu dài.
            </div>
          </div>
        </section>

        {/* Detailed Steps 1 -> 7 */}
        {ADMIN_TAB_REGISTRY.map((step) => (
          <section
            key={step.id}
            id={step.guideAnchor}
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-4 scroll-mt-20"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-brand-600 text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                  {step.stepNumber}
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">
                    Tab: {step.baseLabel}
                  </p>
                  <h2 className="text-base sm:text-lg font-extrabold text-ink-900">
                    {step.title}
                  </h2>
                </div>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-support-50 text-support-700 border border-support-200">
                {step.frequency}
              </span>
            </div>

            <p className="text-sm text-ink-600 leading-relaxed">{step.summary}</p>

            {/* Step-by-step instructions */}
            <div className="space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-wider text-ink-500">
                Các thao tác thực hiện:
              </p>
              <ol className="space-y-2">
                {step.actions.map((action, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-ink-800">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-ink-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{action}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Concrete Example Box */}
            <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4 space-y-1.5">
              <p className="text-xs font-extrabold text-brand-800 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-brand-600 shrink-0" />
                {step.exampleTitle}
              </p>
              <div className="space-y-1 text-xs sm:text-sm text-ink-800 leading-relaxed">
                {step.exampleLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>

            {step.tip && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs text-emerald-900 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Mẹo hay:</strong> {step.tip}
                </div>
              </div>
            )}

            {step.warning && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Chú ý tránh lỗi:</strong> {step.warning}
                </div>
              </div>
            )}
          </section>
        ))}

        {/* Interactive 5-minute Pre-Exam Checklist */}
        <section
          id="checklist"
          className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-3 scroll-mt-20"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-ink-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-support-600" />
              Checklist kiểm tra 5 phút trước giờ thi
            </h2>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-ink-700">
              Đã kiểm tra: {checkedCount}/{PRE_EXAM_CHECKLIST.length}
            </span>
          </div>
          <p className="text-xs text-ink-500">
            Thầy/cô có thể bấm đánh dấu trực tiếp vào từng ô dưới đây trước khi đọc Mã PIN cho lớp:
          </p>
          <div className="space-y-2">
            {PRE_EXAM_CHECKLIST.map((item, idx) => {
              const checked = Boolean(checkedItems[idx]);
              return (
                <label
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                    checked
                      ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                      : 'bg-slate-50/70 border-slate-200 hover:border-brand-300 text-ink-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCheck(idx)}
                    className="mt-0.5 w-4 h-4 rounded accent-support-600 shrink-0"
                  />
                  <span className={`text-sm leading-relaxed ${checked ? 'line-through opacity-80' : ''}`}>
                    {item}
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        {/* FAQ Accordion */}
        <section
          id="faq"
          className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-3 scroll-mt-20"
        >
          <h2 className="text-base font-extrabold text-ink-900 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-brand-600" />
            Giải đáp nhanh các tình huống thường gặp (FAQ)
          </h2>
          <div className="space-y-2">
            {INSTRUCTOR_FAQ_ITEMS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className="rounded-xl border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 bg-slate-50/80 hover:bg-slate-100/70 transition"
                  >
                    <span className="text-sm font-bold text-ink-900">{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-ink-500 shrink-0 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 py-3 text-sm text-ink-700 bg-white border-t border-slate-100 leading-relaxed">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Footer CTA */}
        <div className="bg-brand-600 text-white rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div>
            <p className="text-sm font-extrabold">Sẵn sàng tạo đề và mở phòng thi ngay?</p>
            <p className="text-xs text-white/85 mt-0.5">
              Thầy/cô có thể mở Cổng Giảng viên ở tab mới để vừa làm vừa đối chiếu hướng dẫn này.
            </p>
          </div>
          <Link
            to="/admin"
            className="h-10 px-4 rounded-xl bg-white text-brand-700 hover:bg-slate-100 text-xs font-extrabold inline-flex items-center gap-1.5 shadow-sm"
          >
            <Lock className="w-3.5 h-3.5" />
            Mở Cổng Giảng viên (/admin)
          </Link>
        </div>
      </main>
    </div>
  );
};
