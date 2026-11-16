export type AdminTabId =
  | 'COURSES'
  | 'BANK'
  | 'EXAMS'
  | 'LIVE'
  | 'ANALYTICS_ESSAY'
  | 'EMAILS'
  | 'LIVE_GAME';

export interface AdminTabGuideSpec {
  id: AdminTabId;
  stepNumber: number;
  guideAnchor: string;
  baseLabel: string;
  title: string;
  frequency: string;
  summary: string;
  actions: string[];
  exampleTitle: string;
  exampleLines: string[];
  tip?: string;
  warning?: string;
}

export interface GuideReleaseNote {
  date: string;
  title: string;
  highlights: string[];
}

export const GUIDE_VERSION = '2026.11.16';

export const GUIDE_RELEASE_NOTES: GuideReleaseNote[] = [
  {
    date: '16/11/2026',
    title: 'Cập nhật mới nhất trên hệ thống VNEconomics Testing',
    highlights: [
      'Tách độc lập Đề thi gốc và Ca thi: bấm biểu tượng Thùng rác xóa hết Ca thi cũ/thử nghiệm mà Đề thi gốc vẫn còn nguyên.',
      'Thêm nút "Lưu cấu hình ca thi" rõ ràng ở Tab 3 để lưu toàn bộ cài đặt thời gian, ma trận và chống gian lận.',
      'Sinh viên được tự chọn chế độ hiển thị: Từng câu, 10 câu/lượt, hoặc Xem tất cả câu trên 1 màn hình.',
      'Hạ bàn phím trên điện thoại (iPhone/Android) không bị báo gian lận oan; bổ sung cảnh báo & làm mờ khi chụp màn hình.',
      'Thống kê & file Excel xuất về hiển thị thêm ma trận Đúng/Sai từng câu hỏi của từng thí sinh.',
    ],
  },
];

export const ADMIN_TAB_REGISTRY: AdminTabGuideSpec[] = [
  {
    id: 'COURSES',
    stepNumber: 1,
    guideAnchor: 'buoc-1',
    baseLabel: '1. Học phần',
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
    id: 'BANK',
    stepNumber: 2,
    guideAnchor: 'buoc-2',
    baseLabel: '2. Ngân hàng câu hỏi',
    title: 'Nhập câu hỏi bằng Excel (hoặc dán bảng / gõ trực tiếp)',
    frequency: 'Làm 1 lần, tái sử dụng nhiều kỳ',
    summary:
      'Hỗ trợ 6 dạng câu hỏi: Trắc nghiệm 1 đáp án, Nhiều đáp án, Đúng/Sai, Điền khuyết (___), Tính toán số biến động ({a}) và Tự luận ngắn. Thầy/cô có thể tải Excel mẫu để nhập hàng loạt hoặc dán trực tiếp từ Excel.',
    actions: [
      'Bấm vào thẻ "2. Ngân hàng câu hỏi" (kiểm tra phía trên đang chọn đúng môn học của mình).',
      'Bấm nút "Nhập / Xuất Excel" (hoặc bấm "+ Thêm Chương" / "+ Thêm Câu hỏi" nếu muốn nhập tay từng câu).',
      'Bấm "Tải file Excel mẫu (.xlsx)" về máy tính, điền câu hỏi theo các cột có sẵn rồi lưu lại (hoặc copy vùng bảng Excel và dán vào thẻ Dán bảng).',
      'Tải file Excel lên → hệ thống tự kiểm tra dòng hợp lệ / dòng lỗi → bấm "Xác nhận nhập câu hỏi".',
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
    id: 'EXAMS',
    stepNumber: 3,
    guideAnchor: 'buoc-3',
    baseLabel: '3. Tạo & Cấu hình Đề thi',
    title: 'Chọn Ma trận Chương, Thời gian & Bảo mật',
    frequency: 'Làm 1 lần cho mỗi bài kiểm tra',
    summary:
      'Hệ thống tự động bốc ngẫu nhiên câu hỏi từ Ngân hàng theo số lượng thầy/cô quy định cho từng Chương, giúp mỗi sinh viên có một mã đề riêng. Hỗ trợ "Nhân bản đề" nếu cần tạo biến thể đề khác.',
    actions: [
      'Bấm vào thẻ "3. Tạo & Cấu hình Đề thi" → bấm "Tạo Đề thi mới".',
      'Đặt tên đề thi (ví dụ: Kiểm tra Giữa kỳ — Kinh tế Vi mô). Hệ thống tự cấp Mã PIN 6 số (thầy/cô có thể sửa lại cho dễ nhớ).',
      'Ở bảng Ma trận Chương, nhập số lượng câu cần lấy từ mỗi chương.',
      'Cài đặt Thời gian làm bài (phút), bật "Trộn A/B/C/D", bật xác minh danh sách lớp (nếu cần), và đặt mức Chống gian lận (khuyến nghị: Số lần rời màn hình tối đa = 3, Tổng giây vắng mặt = 30).',
      'BẮT BUỘC: Kéo xuống cuối bảng và bấm nút "Lưu cấu hình ca thi" để lưu toàn bộ thay đổi lên máy chủ.',
    ],
    exampleTitle: 'Ví dụ minh họa — Đề kiểm tra 15 phút gồm 10 câu',
    exampleLines: [
      '• Chương 1: Tổng quan → lấy 5 câu',
      '• Chương 2: Cung - Cầu → lấy 5 câu',
      '• Thời gian làm bài: 15 phút | Số lần rời màn hình tối đa: 3 lần | Tổng giây vắng mặt tối đa: 30 giây.',
    ],
    warning:
      'Rất hay quên: Sau khi sửa số phút, mã PIN hoặc cấu hình bảo mật ở Tab 3, thầy/cô nhớ bấm nút "Lưu cấu hình ca thi" ở cuối khung thì thay đổi mới có hiệu lực!',
  },
  {
    id: 'LIVE',
    stepNumber: 4,
    guideAnchor: 'buoc-4',
    baseLabel: '4. Giám sát Live & Duyệt',
    title: 'Mở Ca thi lấy Mã PIN cho từng lớp & Coi thi trực tiếp',
    frequency: 'Làm mỗi buổi thi',
    summary:
      'Dạy nhiều lớp cùng một môn? Thầy/cô giữ nguyên 1 Đề thi gốc nhưng mở nhiều Ca thi riêng (Ca Thứ 2, Ca Thứ 4...). Mỗi Ca thi có Mã PIN, danh sách sinh viên (Roster) và bảng điểm riêng.',
    actions: [
      'Bấm vào thẻ "4. Giám sát Live & Duyệt".',
      'Bấm nút "+ Tạo Ca thi mới", đặt tên lớp/ca (ví dụ: Giữa kỳ — Lớp Thứ 2). Hệ thống tạo ngay Mã PIN 6 số ở trạng thái "OPEN" (Đang mở).',
      'Đọc hoặc chiếu Mã PIN 6 số lên bảng. Sinh viên vào trang chủ, nhập PIN, Họ tên, MSSV, Email là vào thi ngay (có thể chọn xem từng câu, 10 câu/lượt hoặc tất cả câu).',
      'Theo dõi tiến độ làm bài trực tiếp. Nếu sinh viên bị khóa đỏ do lỡ thoát app hoặc đổi máy giữa chừng, thầy/cô bấm mở khóa / giải phóng Device Lock hoặc cộng thêm giờ ngay tại bảng.',
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
    id: 'ANALYTICS_ESSAY',
    stepNumber: 5,
    guideAnchor: 'buoc-5',
    baseLabel: '5. Thống kê & Tự luận',
    title: 'Xem đúng/sai từng câu, Chấm tự luận & Xuất Excel',
    frequency: 'Làm sau khi kết thúc ca thi',
    summary:
      'Xem biểu đồ phổ điểm của cả lớp, kiểm tra năng lực theo từng Chương, xem ma trận Đúng/Sai từng câu của từng thí sinh, chấm lại tự luận và tải file Excel.',
    actions: [
      'Bấm vào thẻ "5. Thống kê & Tự luận".',
      'Chọn đúng Ca thi cần xem ở thanh trên cùng.',
      'Xem Biểu đồ phổ điểm, Bảng kết quả từng câu hỏi (Đúng/Sai) của từng thí sinh, và bấm "Mở Highlight & Chấm lại" (nếu đề có câu tự luận).',
      'Bấm "Xuất Excel (.xlsx)" để tải file về máy, hoặc dùng tính năng gửi kết quả ca thi về Email giảng viên.',
    ],
    exampleTitle: 'Ví dụ minh họa — Nội dung trong file Excel tải về',
    exampleLines: [
      '• Sheet Tổng hợp Ca thi: MSSV, Họ tên, Lớp, Điểm số, Thời gian nộp, Số lần vi phạm.',
      '• Sheet Chi tiết từng câu hỏi: Thống kê từng thí sinh làm đúng hay sai từng câu để giảng viên nắm năng lực của từng bạn.',
    ],
  },
  {
    id: 'EMAILS',
    stepNumber: 6,
    guideAnchor: 'buoc-6',
    baseLabel: '6. Nhật ký Email',
    title: 'Kiểm tra lịch sử gửi Email điểm & báo cáo',
    frequency: 'Kiểm tra khi cần đối soát',
    summary:
      'Theo dõi toàn bộ Email báo điểm đã gửi cho sinh viên và Email báo cáo kèm file Excel gửi cho giảng viên (trạng thái thành công, thời gian gửi, địa chỉ nhận).',
    actions: [
      'Bấm vào thẻ "6. Nhật ký Email".',
      'Kiểm tra danh sách các Email hệ thống vừa gửi sau khi sinh viên nộp bài hoặc khi giảng viên gửi báo cáo ca thi.',
      'Nếu muốn kiểm tra thử hộp thư có nhận được mail từ hệ thống không, bấm nút gửi Email thử nghiệm ngay trong màn hình này.',
    ],
    exampleTitle: 'Ví dụ minh họa — Khi sinh viên báo chưa thấy email điểm',
    exampleLines: [
      '• Thầy/cô mở Tab "6. Nhật ký Email", tìm tên hoặc email sinh viên.',
      '• Kiểm tra xem sinh viên có gõ sai chính tả email (ví dụ @gmai.com thay vì @gmail.com) hay thư đã gửi thành công và đang nằm trong mục Quảng cáo / Spam.',
    ],
  },
  {
    id: 'LIVE_GAME',
    stepNumber: 7,
    guideAnchor: 'buoc-7',
    baseLabel: '7. Live Game (Kahoot)',
    title: 'Tổ chức trò chơi ôn tập trực tiếp trên lớp',
    frequency: 'Dùng khi ôn tập / khuấy động lớp',
    summary:
      'Biến ngay Ngân hàng câu hỏi của môn học thành trò chơi thi đua trực tiếp kiểu Kahoot! Sinh viên vào trang /play trên điện thoại, nhập mã phòng và đua bảng xếp hạng theo thời gian thực.',
    actions: [
      'Bấm vào thẻ "7. Live Game (Kahoot)" (hoặc bấm nút "Mở Live Game" ngay trong Tab 2 Ngân hàng câu hỏi).',
      'Chọn bộ câu hỏi cần ôn tập và khởi tạo phòng chơi để lấy Mã PIN Game.',
      'Chiếu màn hình Host lên máy chiếu và cho sinh viên vào mục "Vào Game Live" (/play) trên điện thoại để nhập PIN.',
      'Kết thúc game, hệ thống tự vinh danh Top 3 (Podium) và cho phép thầy/cô bấm "Xem Podium & Xuất Excel" lưu điểm cộng chuyên cần.',
    ],
    exampleTitle: 'Ví dụ minh họa — Ôn tập 10 phút cuối giờ môn Kinh tế Vi mô',
    exampleLines: [
      '• Thầy/cô vào Tab 2 → lọc Chương 2: Cung - Cầu → bấm "Mở Live Game".',
      '• Cả lớp mở điện thoại vào trang /play nhập mã PIN 6 số → thi đua trả lời nhanh 5 câu trắc nghiệm và xuất Excel cộng điểm cho Top 5.',
    ],
  },
];

export const PRE_EXAM_CHECKLIST: string[] = [
  'Đã đăng nhập đúng tài khoản Giảng viên (góc trên bên phải hiện tên/email của thầy/cô, không phải chế độ Demo).',
  'Đã bấm nút "Lưu cấu hình ca thi" ở Tab 3 sau khi chỉnh thời gian, ma trận câu hỏi và mức chống gian lận.',
  'Ca thi ở Tab 4 đang có trạng thái Đang mở (OPEN) và đã ghi lại đúng Mã PIN 6 số để đọc cho lớp.',
  'Đã dặn sinh viên mở link thi bằng Chrome (Android) hoặc Safari (iPhone), KHÔNG bấm thi trực tiếp bên trong cửa sổ chat Zalo / Messenger.',
];

export const INSTRUCTOR_FAQ_ITEMS: { q: string; a: string }[] = [
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
