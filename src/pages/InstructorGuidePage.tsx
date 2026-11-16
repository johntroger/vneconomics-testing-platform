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

interface StepGuide {
  stepNumber: number;
  id: string;
  tabName: string;
  title: string;
  frequency: string;
  summary: string;
  actions: string[];
  exampleTitle: string;
  exampleLines: string[];
  tip?: string;
  warning?: string;
}

const STEP_GUIDES: StepGuide[] = [
  {
    stepNumber: 1,
    id: 'buoc-1',
    tabName: '1. Học phần',
    title: 'Tạo tên Học phần (Môn học)',
    frequency: 'Làm 1 lần đầu học kỳ',
    summary:
      'Mỗi môn học chỉ cần tạo một lần. Ngân hàng câu hỏi và đề thi của môn đó sẽ được gom gọn vào đây để thầy/cô dùng lại cho nhiều học kỳ sau.',
    actions: [
      'Bấm vào thẻ "1. Học phần" ở hàng menu trên cùng.',
      'Bấm nút "+ Thêm Học phần mới".',
      'Nhập Mã học phần (ngắn gọn, viết hoa) và Tên học phần đầy đủ.',
      'Bấm "Lưu / Tạo học phần". Tên môn học sẽ hiện sẵn ở ô chọn Học phần phía trên màn hình.',
    ],
    exampleTitle: 'Ví dụ minh họa — Môn Kinh tế Vi mô',
    exampleLines: [
      '• Mã học phần: ECO101',
      '• Tên học phần: Kinh tế Vi mô',
      '→ Sau khi lưu, ô chọn góc trên sẽ hiện: "ECO101 — Kinh tế Vi mô".',
    ],
  },
  {
    stepNumber: 2,
    id: 'buoc-2',
    tabName: '2. Ngân hàng câu hỏi',
    title: 'Nhập câu hỏi bằng Excel (hoặc gõ trực tiếp)',
    frequency: 'Làm 1 lần, tái sử dụng nhiều kỳ',
    summary:
      'Thầy/cô có thể nhập hàng chục câu hỏi chỉ trong 1 phút bằng file Excel mẫu, hoặc bấm thêm từng câu trực tiếp trên web.',
    actions: [
      'Bấm vào thẻ "2. Ngân hàng câu hỏi" (kiểm tra phía trên đang chọn đúng môn học của mình).',
      'Bấm nút "Nhập / Xuất Excel" (màu xanh lá).',
      'Bấm "Tải file Excel mẫu (.xlsx)" về máy tính và mở bằng Microsoft Excel.',
      'Điền câu hỏi theo các cột có sẵn (Chương, Loại câu, Nội dung, Phương án A/B/C/D, Đáp án đúng) rồi lưu file.',
      'Quay lại trang web, bấm chọn file Excel vừa lưu → xem trước danh sách hợp lệ → bấm "Xác nhận nhập câu hỏi".',
    ],
    exampleTitle: 'Ví dụ minh họa — Bảng nhập 3 câu hỏi mẫu trong Excel',
    exampleLines: [
      '• Dòng 1: Chương 1: Tổng quan | SINGLE_CHOICE | Quy luật khan hiếm là gì? | A: Nguồn lực có hạn | ... | Đáp án: A',
      '• Dòng 2: Chương 2: Cung - Cầu | SINGLE_CHOICE | Khi giá tăng, lượng cầu sẽ: | A: Giảm xuống | ... | Đáp án: A',
      '• Dòng 3 (Điền khuyết): Chương 2: Cung - Cầu | FILL_IN_BLANK | Điểm cân bằng là nơi cung ___ cầu. | Đáp án: bằng',
    ],
    tip: 'Với câu điền vào chỗ trống (FILL_IN_BLANK), thầy/cô chỉ cần gõ 3 dấu gạch dưới trở lên (___) tại vị trí muốn sinh viên tự gõ đáp án.',
  },
  {
    stepNumber: 3,
    id: 'buoc-3',
    tabName: '3. Tạo & Cấu hình Đề thi',
    title: 'Chọn Ma trận Chương, Thời gian & Bảo mật',
    frequency: 'Làm 1 lần cho mỗi bài kiểm tra',
    summary:
      'Hệ thống tự động bốc ngẫu nhiên câu hỏi từ Ngân hàng theo số lượng thầy/cô quy định cho từng Chương, giúp mỗi sinh viên có một mã đề khác nhau.',
    actions: [
      'Bấm vào thẻ "3. Tạo & Cấu hình Đề thi" → bấm "+ Tạo Đề thi mới".',
      'Đặt tên đề thi (ví dụ: Kiểm tra Giữa kỳ — Kinh tế Vi mô). Hệ thống tự cấp Mã PIN 6 số (thầy/cô có thể sửa lại cho dễ nhớ).',
      'Ở bảng Ma trận Chương, nhập số lượng câu cần lấy từ mỗi chương.',
      'Cài đặt Thời gian làm bài (phút), bật "Trộn A/B/C/D", và đặt mức Chống gian lận (khuyến nghị: Số lần rời màn hình tối đa = 3, Tổng giây vắng mặt = 30).',
      'BẮT BUỘC: Kéo xuống cuối bảng và bấm nút "Lưu cấu hình ca thi" để lưu lên máy chủ.',
    ],
    exampleTitle: 'Ví dụ minh họa — Đề kiểm tra 15 phút gồm 10 câu',
    exampleLines: [
      '• Chương 1: Tổng quan → lấy 5 câu',
      '• Chương 2: Cung - Cầu → lấy 5 câu',
      '• Thời gian làm bài: 15 phút | Số lần rời màn hình tối đa: 3 lần | Tổng giây vắng mặt tối đa: 30 giây.',
    ],
    warning:
      'Rất hay quên: Sau khi sửa số phút, mã PIN hoặc cấu hình bảo mật ở Tab 3, thầy/cô nhớ bấm nút xanh "Lưu cấu hình ca thi" ở cuối khung thì thay đổi mới có hiệu lực!',
  },
  {
    stepNumber: 4,
    id: 'buoc-4',
    tabName: '4. Giám sát Live & Duyệt',
    title: 'Mở Ca thi lấy Mã PIN cho từng lớp & Coi thi trực tiếp',
    frequency: 'Làm mỗi buổi thi',
    summary:
      'Dạy nhiều lớp cùng một môn? Thầy/cô giữ nguyên 1 Đề thi gốc nhưng mở nhiều Ca thi riêng (Ca Thứ 2, Ca Thứ 4...). Mỗi Ca thi có Mã PIN và bảng điểm riêng, không bao giờ bị trộn lẫn.',
    actions: [
      'Bấm vào thẻ "4. Giám sát Live & Duyệt".',
      'Bấm nút "+ Tạo Ca thi mới", đặt tên lớp/ca (ví dụ: Giữa kỳ — Lớp Thứ 2). Hệ thống tạo ngay Mã PIN 6 số ở trạng thái "OPEN" (Đang mở).',
      'Đọc hoặc chiếu Mã PIN 6 số lên bảng. Sinh viên vào trang chủ, nhập PIN, Họ tên, MSSV, Email là vào thi ngay (không cần tạo tài khoản).',
      'Theo dõi tiến độ làm bài trực tiếp trên màn hình. Nếu sinh viên bị khóa đỏ do lỡ thoát app, thầy/cô bấm nút "Mở khóa" cạnh tên sinh viên nếu đồng ý cho thi tiếp.',
    ],
    exampleTitle: 'Ví dụ minh họa — Dạy 2 lớp dùng chung 1 đề gốc',
    exampleLines: [
      '• Sáng Thứ 2: Bấm "+ Tạo Ca thi mới" → đặt tên "Giữa kỳ — Ca Thứ 2" → nhận PIN 550123 cho lớp Thứ 2.',
      '• Chiều Thứ 4: Bấm "+ Tạo Ca thi mới" → đặt tên "Giữa kỳ — Ca Thứ 4" → nhận PIN 778456 cho lớp Thứ 4.',
      '• Nếu tạo nhầm ca thi thử: Bấm biểu tượng Thùng rác cạnh tên Ca thi để xóa — Đề thi gốc ở Tab 3 vẫn còn nguyên!',
    ],
    tip: 'Khi sinh viên dùng điện thoại bấm nút hạ bàn phím để đọc lại đề, hệ thống đã tự động bỏ qua nên không báo gian lận oan.',
  },
  {
    stepNumber: 5,
    id: 'buoc-5',
    tabName: '5. Thống kê & Tự luận',
    title: 'Xem đúng/sai từng câu, Chấm tự luận & Xuất Excel',
    frequency: 'Làm sau khi kết thúc ca thi',
    summary:
      'Xem ngay biểu đồ điểm của cả lớp, kiểm tra từng sinh viên làm đúng/sai câu nào, và tải bảng điểm Excel đầy đủ chỉ với 1 cú bấm.',
    actions: [
      'Bấm vào thẻ "5. Thống kê & Tự luận".',
      'Chọn đúng Ca thi cần xem ở thanh trên cùng.',
      'Xem Biểu đồ phổ điểm, Bảng kết quả từng câu hỏi (Đúng/Sai) của từng thí sinh, và bấm "Chấm tự luận" (nếu đề có câu tự luận).',
      'Bấm "Xuất Excel (.xlsx)" để tải file về máy, hoặc bấm "Gửi kết quả ca thi về Email" để nhận file Excel thống kê chi tiết qua hộp thư.',
    ],
    exampleTitle: 'Ví dụ minh họa — Nội dung trong file Excel tải về',
    exampleLines: [
      '• Sheet 1 (Tổng hợp Ca thi): MSSV, Họ tên, Lớp, Điểm số, Thời gian nộp, Số lần vi phạm.',
      '• Sheet 2 (Chi tiết từng câu hỏi): Ma trận từng thí sinh ở mỗi câu (Đúng / Sai / Điểm câu đó) giúp thầy/cô đánh giá năng lực từng bạn.',
    ],
  },
];

const CHECKLIST_ITEMS = [
  'Đã đăng nhập đúng tài khoản Giảng viên (góc trên bên phải hiện tên/email của thầy/cô, không phải chế độ Demo).',
  'Đã bấm nút "Lưu cấu hình ca thi" ở Tab 3 sau khi chỉnh thời gian, ma trận câu hỏi và mức chống gian lận.',
  'Ca thi ở Tab 4 đang có trạng thái Đang mở (OPEN) và đã ghi lại đúng Mã PIN 6 số để đọc cho lớp.',
  'Đã dặn sinh viên mở link thi bằng Chrome (Android) hoặc Safari (iPhone), KHÔNG bấm thi trực tiếp bên trong cửa sổ chat Zalo / Messenger.',
];

const FAQ_ITEMS = [
  {
    q: 'Sinh viên báo nhập đúng Mã PIN 6 số nhưng không vào được phòng thi?',
    a: 'Thầy/cô vào Tab 4 (Giám sát Live & Duyệt), kiểm tra xem Ca thi đó đang ở trạng thái OPEN (Đang mở) hay đang ở Nháp (DRAFT) / Đã đóng (CLOSED). Nếu chưa mở, bấm nút "Mở phòng thi ngay".',
  },
  {
    q: 'Sinh viên bị khóa màn hình báo đỏ giữa chừng thì xử lý thế nào?',
    a: 'Nguyên nhân do sinh viên chuyển sang ứng dụng khác (Zalo, Google...) vượt quá số lần/số giây tối đa hoặc chụp ảnh màn hình. Thầy/cô hỏi nhanh lý do tại lớp: nếu hợp lệ, bấm nút "Mở khóa" ngay cạnh tên sinh viên ở Tab 4 để các bạn làm tiếp.',
  },
  {
    q: 'Nếu tôi bấm biểu tượng thùng rác xóa hết các Ca thi cũ, Đề thi gốc có bị mất không?',
    a: 'Không. Đề thi gốc ở Tab 3 và Ngân hàng câu hỏi ở Tab 2 được lưu tách biệt hoàn toàn với Ca thi. Thầy/cô có thể xóa thoải mái các Ca thi thử nghiệm hoặc Ca thi đã cũ mà không ảnh hưởng tới Đề thi gốc.',
  },
  {
    q: 'Tôi sửa thời gian từ 15 phút lên 30 phút ở Tab 3 nhưng sinh viên vẫn thấy 15 phút?',
    a: 'Do thầy/cô chưa bấm nút "Lưu cấu hình ca thi" ở cuối phần cài đặt Tab 3. Hãy bấm lưu lại và nhắc sinh viên tải lại trang.',
  },
  {
    q: 'Sinh viên thi xong có xem được điểm luôn không?',
    a: 'Có (nếu thầy/cô bật tùy chọn cho xem điểm/đáp án ở Tab 3). Điểm sẽ hiển thị ngay trên màn hình sau khi nộp bài và hệ thống tự động gửi bản tổng hợp về Email sinh viên đã nhập.',
  },
];

export const InstructorGuidePage: React.FC = () => {
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleCheck = (index: number) => {
    setCheckedItems((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const checkedCount = CHECKLIST_ITEMS.filter((_, idx) => checkedItems[idx]).length;

  return (
    <div className="min-h-screen bg-slate-50 text-ink-900 flex flex-col">
      {/* Top sticky navigation */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-3 print:hidden">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1 shadow-2xs shrink-0 overflow-hidden">
              <img src="/logo.png" alt="VNEconomics Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-ink-900 truncate">
                Cẩm nang Hướng dẫn Giảng viên
              </p>
              <p className="text-[11px] text-ink-500 truncate">
                Từng bước thực hiện kèm ví dụ minh họa — Dễ đọc, dễ làm theo
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

      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Hero Intro Card */}
        <section className="bg-gradient-to-br from-brand-50 via-white to-support-50 rounded-2xl border border-brand-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-700 bg-brand-100 px-3 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5" />
              Dành cho Giảng viên — Làm theo 5 bước là chạy ngay
            </span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-ink-900">
              Hướng dẫn Tổ chức Kiểm tra &amp; Coi thi Trực tuyến VNEconomics
            </h1>
            <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">
              Thầy/cô không cần rành kỹ thuật: chỉ cần đi lần lượt từ trái sang phải theo đúng thứ tự{' '}
              <strong className="text-ink-900">Tab 1 → Tab 2 → Tab 3 → Tab 4 → Tab 5</strong> trên màn hình{' '}
              <Link to="/admin" className="text-brand-700 font-bold underline">
                Cổng Giảng viên (/admin)
              </Link>
              . Toàn bộ tài liệu dưới đây dùng một ví dụ thực tế (môn <strong>Kinh tế Vi mô — ECO101</strong>) để thầy/cô đối chiếu trực tiếp.
            </p>
          </div>

          {/* Quick jump pills */}
          <div className="flex flex-wrap gap-1.5 pt-1 print:hidden">
            <a
              href="#dang-nhap"
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-brand-300 text-xs font-bold text-ink-700"
            >
              0. Đăng nhập
            </a>
            {STEP_GUIDES.map((step) => (
              <a
                key={step.id}
                href={`#${step.id}`}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-brand-300 text-xs font-bold text-ink-700"
              >
                {step.tabName}
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

        {/* Overview Table */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <h2 className="text-base font-extrabold text-ink-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-brand-600" />
            Tóm tắt nhanh quy trình 5 bước
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 text-ink-600">
                  <th className="py-2 pr-3 font-bold">Bước</th>
                  <th className="py-2 pr-3 font-bold">Tên Tab trên màn hình</th>
                  <th className="py-2 pr-3 font-bold">Việc thầy/cô làm</th>
                  <th className="py-2 font-bold">Tần suất</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {STEP_GUIDES.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-3 font-extrabold text-brand-700 whitespace-nowrap">
                      Bước {s.stepNumber}
                    </td>
                    <td className="py-2.5 pr-3 font-bold text-ink-900 whitespace-nowrap">
                      {s.tabName}
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

        {/* Detailed Steps 1 -> 5 */}
        {STEP_GUIDES.map((step) => (
          <section
            key={step.id}
            id={step.id}
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-4 scroll-mt-20"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-brand-600 text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                  {step.stepNumber}
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">
                    Tab: {step.tabName}
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
              Đã kiểm tra: {checkedCount}/{CHECKLIST_ITEMS.length}
            </span>
          </div>
          <p className="text-xs text-ink-500">
            Thầy/cô có thể bấm đánh dấu trực tiếp vào từng ô dưới đây trước khi đọc Mã PIN cho lớp:
          </p>
          <div className="space-y-2">
            {CHECKLIST_ITEMS.map((item, idx) => {
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
            {FAQ_ITEMS.map((faq, idx) => {
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
