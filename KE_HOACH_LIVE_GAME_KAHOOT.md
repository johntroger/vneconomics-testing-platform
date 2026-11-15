# KẾ HOẠCH TRIỂN KHAI TÍNH NĂNG LIVE GAME (KAHOOT-STYLE)
## Tích hợp vào VNEconomics Testing Platform

> **Phạm vi tài liệu:** Bản đặc tả kiến trúc, thiết kế cơ sở dữ liệu, API PHP, cơ chế Game Design, UI/UX và lộ trình triển khai tính năng **Live Quiz Game (giống Kahoot)** trên nền tảng hiện có (`React 18 + TypeScript + Vite + Tailwind CSS` & `PHP + SQLite WAL / MySQL 8+` trên Plesk shared hosting).
> **Trạng thái:** Đã rà soát & nâng cấp theo góc nhìn **Game Design · Senior Software Architecture · UI/UX** — Sẵn sàng triển khai Phase 1 (Core MVP).

---

## 1. MỤC TIÊU & TÙY CHỌN CẤU HÌNH CỦA GIẢNG VIÊN

Tính năng **Live Game** cho phép giảng viên tổ chức trò chơi trắc nghiệm tương tác trực tiếp ngay trong giờ học (offline trên lớp hoặc online qua Zoom/Meet), tái sử dụng trực tiếp **Ngân hàng câu hỏi** và **Đề thi** sẵn có của hệ thống.

### Tùy chọn linh hoạt khi Giảng viên tạo phòng Game
1. **Chế độ hiển thị trên thiết bị Sinh viên (`showQuestionOnPlayer`):**
   - **Tắt (`false` — Mặc định cho lớp học Offline / Chiếu máy chiếu):** Màn hình điện thoại sinh viên chỉ hiển thị **4 nút màu & hình khối lớn** (Đỏ ▲, Xanh dương ◆, Vàng ●, Xanh lá ■) để bấm cực nhanh theo đề bài đang chiếu trên máy chiếu.
   - **Bật (`true` — Dành cho lớp học Online hoặc phòng học rộng):** Màn hình điện thoại sinh viên hiển thị **đầy đủ nội dung câu hỏi + text của 4 đáp án** ngay trên từng nút bấm.
2. **Chế độ định danh Sinh viên (`requireStudentCode`):**
   - **Tắt (`false` — Chơi tự do / Warm-up):** Sinh viên chỉ cần nhập **Nickname** để vào phòng nhanh.
   - **Bật (`true` — Điểm danh / Cộng điểm học phần):** Sinh viên bắt buộc nhập **MSSV (`studentCode`)** kèm Tên hiển thị; kết quả cuối game xuất ra Excel (`.xlsx`) có cột MSSV để giảng viên cộng điểm chuyên cần hoặc nhập điểm nhanh.
3. **Cấu hình nhịp độ & kịch tính (Game Pacing):**
   - **Thời gian thông minh theo loại câu hỏi (`timeLimitSec` từng câu):** Thay vì dùng cứng 1 mức thời gian cho cả phòng, mỗi câu trong `questions_snapshot_json` có `timeLimitSec` riêng, tự động gợi ý theo loại câu hỏi (`TRUE_FALSE` đơn: `12s`, `SINGLE_CHOICE`: `20s`, `MULTI_CHOICE`: `25s`, `NUMERICAL`/`TRUE_FALSE` cụm: `35–45s`) và cho phép giảng viên chỉnh nhanh trước khi mở phòng.
   - **Điểm x2 câu cuối (`doubleFinalQuestion`):** Tùy chọn nhân đôi điểm ở câu hỏi cuối cùng để tạo cơ hội "lật kèo" kịch tính, giữ chân sinh viên ở nhóm giữa bảng xếp hạng.

---

## 2. KIẾN TRÚC REAL-TIME & TỐI ƯU HIỆU NĂNG TRÊN PLESK

Hệ thống hiện tại vận hành trên **Plesk shared hosting** (`PHP + MySQL 8+ / SQLite WAL`), không chạy daemon Node.js/WebSocket dài hạn và cần tránh giữ kết nối SSE mở lâu gây nghẽn PHP-FPM workers khi có 100+ sinh viên tham gia cùng lúc.

### 2.1. Adaptive Short Polling + File State Cache (Zero-DB Poll)
* **Vấn đề Thundering Herd:** Nếu 100–150 sinh viên poll mỗi `900ms` và mỗi request đều khởi tạo PDO + chạy `ensureExamSchema()`, server shared hosting có thể bị quá tải CPU/DB lock.
* **Giải pháp tối ưu:**
  1. **Poll Fast-Path bằng File Cache siêu nhẹ:** Mỗi khi Host chuyển trạng thái (`next_state`) hoặc có người trả lời (`answer`), PHP ghi đè 1 file JSON nhỏ (~120 bytes) tại `sys_get_temp_dir()/vne_game_{pin}.json`. Endpoint `GET /api/game.php?action=poll&pin=XXXXXX` **chỉ đọc file này (không mở PDO, không chạy `ensureExamSchema()`)**, phản hồi `< 2ms` với payload:
     ```json
     {
       "ok": true,
       "s": "QUESTION_ACTIVE",
       "q": 2,
       "v": 7,
       "end": 1763194425000,
       "now": 1763194412340,
       "pc": 42,
       "ac": 18
     }
     ```
     *(Fallback về truy vấn DB nhẹ nếu file cache chưa tồn tại).*
  2. **Poll Jitter (Dàn đều tải):** Client cộng thêm nhiễu ngẫu nhiên `±150ms` vào `setInterval` để tránh 100 máy bắn request cùng 1 mili-giây.
  3. **Tần suất thích ứng:**
     * `LOBBY`, `QUESTION_RESULT`, `LEADERBOARD`: Poll mỗi `900ms ± 150ms`.
     * `QUESTION_ACTIVE`: Nếu chưa bấm → poll thưa `2000ms` (chỉ để bắt lệnh Skip từ Host); nếu đã bấm → poll `1200ms` để chờ chuyển kết quả.
     * Chỉ khi `v` (`state_version`) thay đổi, client mới gọi API lấy dữ liệu câu hỏi hoặc bảng xếp hạng.

### 2.2. Đồng bộ đồng hồ, Grace Window & Reconnect
* **Clock Offset:** Client tính `clockOffset = serverNow - Date.now()` từ mỗi response `poll` để thanh đếm ngược khớp tuyệt đối với màn hình Host.
* **Network Grace Window (`1500ms`):** Nếu sinh viên bấm ở giây `19.8s` nhưng mạng lag khiến request tới server ở giây `20.3s`, server vẫn chấp nhận đáp án trong cửa sổ ân hạn `1.5s` (clamp `responseTimeMs <= timeLimitMs`) để tránh gây ức chế cho người chơi mạng yếu.
* **Idempotent Reconnect:** Nếu sinh viên lỡ F5 hoặc rớt mạng, gọi lại `join` với cùng `deviceToken` (tái sử dụng `getOrCreateDeviceToken()`) hoặc cùng `studentCode` sẽ **khôi phục đúng `playerId`, `score`, `streak`** thay vì tạo người chơi mới.
* **Chế độ Demo / Local (Không cần PHP server):** Tận dụng `BroadcastChannel` (`SYNC_CHANNEL_NAME` trong `src/services/apiClient.ts`) + `localStorage` để giảng viên mở 2 tab (Host + Player) test toàn bộ luồng game ngay trên trình duyệt.

*(Mở rộng Phase 3: Nếu quy mô sự kiện > 250–300 người/phòng, có thể cắm thêm WebSocket relay ngoài như Pusher/Ably/Soketi mà không cần đổi cấu trúc database).*

---

## 3. TÁI SỬ DỤNG ĐA DẠNG CÁC LOẠI CÂU HỎI TRONG NGÂN HÀNG ĐỀ

Thay vì giới hạn chỉ câu hỏi 4 đáp án, hệ thống Live Game được thiết kế **hỗ trợ đa dạng 5 loại `QuestionType` sẵn có** trong `src/types/exam.ts`, ánh xạ tương ứng sang giao diện chơi nhanh trên di động:

| Loại câu hỏi (`QuestionType`) | Cách hiển thị & Thao tác trên Player | Cơ chế chấm điểm trong Game | Giai đoạn |
| :--- | :--- | :--- | :--- |
| **`SINGLE_CHOICE`** *(2–6 đáp án)* | Lưới nút màu + hình khối + chữ cái (`A–F`) tự động co giãn theo số lượng đáp án (2 nút ngang, 2×2, hoặc 2×3). | Đúng/Sai tuyệt đối + Tốc độ + Streak. | **Phase 1** |
| **`TRUE_FALSE`** *(1 hoặc nhiều mệnh đề)* | • **1 mệnh đề:** 2 nút lớn **ĐÚNG (`◆`) / SAI (`▲`)**.<br>• **Nhiều mệnh đề (a, b, c, d):** Giảng viên chọn **Tách thành từng câu Đúng/Sai lẻ** *(khuyên dùng)* hoặc giữ nguyên cụm 4 công tắc gạt `[Đúng\|Sai]` + nút Gửi. | Theo tỷ lệ đúng (`0.1 / 0.25 / 0.5 / 1.0` cho cụm 4 ý như `gradeAnswer`); giữ Streak khi đúng 100%. | **Phase 1** |
| **`MULTI_CHOICE`** *(Chọn nhiều)* | Các ô màu dạng Toggle Checkbox (chọn nhiều đáp án) + nút **"Gửi đáp án"** cố định ở dưới. | Hỗ trợ điểm thành phần (`earnedRatio` từ 0–1.0 theo `gradeAnswer`); chỉ cộng/giữ Streak khi chọn đúng 100%. | **Phase 1** |
| **`NUMERICAL`** *(Tính toán số — đặc trưng Kinh tế)* | Ô nhập số tối ưu di động (`inputMode="decimal"`) kèm đơn vị (`numericalUnit`) + nút **"Gửi"**. Tự động gợi ý thời gian dài hơn (`30s–45s`). | Kiểm tra sai số `\|ans - expected\| <= tolerance` + Tốc độ + Streak. | **Phase 2** |
| **`ESSAY`** *(Có `gradingRubric`)* | Dạng **"Gõ từ khóa nhanh" (Type Answer)**: ô nhập ngắn + nút Gửi. *(Các câu tự luận dài không có `gradingRubric` sẽ tự động được lọc bỏ khi tạo Game).* | Chấm tự động tức thì bằng `gradeMicroEssayRubric()` theo tỷ lệ khớp rubric + tốc độ. | **Phase 2** |

### Quy tắc đồng bộ dữ liệu câu hỏi khi tạo Game
* **Nguồn tạo Game:** Chọn từ một Đề thi (`Exam`) có sẵn ở tab `EXAMS`, hoặc lọc từ Ngân hàng câu hỏi (`BANK`) theo Học phần, Chương, Độ khó, Loại câu hỏi.
* **Câu hỏi có biến động (`dynamicVars`):** Tại thời điểm tạo Game (`create`), hệ thống chạy `dynamicQuestionEngine` **sinh 1 bộ biến cố định duy nhất** (và tính sẵn `expectedValue` nếu là `NUMERICAL`) lưu vào `questions_snapshot_json` để cả lớp cùng giải chung một đề bài trên màn hình chiếu.
* **Quy tắc thứ tự đáp án:** Với `SINGLE_CHOICE` và `MULTI_CHOICE`, **tuyệt đối giữ cố định thứ tự đáp án** trong `questions_snapshot_json` cho tất cả người chơi (không tráo riêng từng máy) để vị trí nút màu trên điện thoại luôn khớp 100% với màn hình máy chiếu.

---

## 4. THIẾT KẾ CƠ SỞ DỮ LIỆU (`api/schema.php`)

Bổ sung 3 bảng mới vào `ensureExamSchema()` (tương thích cả **MySQL 8+ InnoDB utf8mb4** và **SQLite WAL**):

### 4.1. Bảng `game_sessions`
| Cột | Kiểu (MySQL / SQLite) | Mô tả |
| :--- | :--- | :--- |
| `id` | `VARCHAR(64) PK` | ID phiên game (`game_...`) |
| `owner_id` | `VARCHAR(64)` | ID giảng viên tạo phòng |
| `course_id` | `VARCHAR(64)` | Học phần liên quan (tùy chọn) |
| `title` | `VARCHAR(255)` | Tên trò chơi / buổi ôn tập |
| `game_pin` | `VARCHAR(16) INDEX` | Mã PIN 6 chữ số để sinh viên vào phòng |
| `show_question_on_player` | `TINYINT(1)` | `0`: Chỉ hiện 4 nút màu; `1`: Hiện cả đề trên điện thoại |
| `require_student_code` | `TINYINT(1)` | `0`: Chỉ nhập Nickname; `1`: Bắt buộc nhập MSSV |
| `is_locked` | `TINYINT(1) DEFAULT 0` | `1`: Khóa phòng không cho người mới vào giữa chừng |
| `double_final_question` | `TINYINT(1) DEFAULT 1` | `1`: Nhân đôi điểm câu hỏi cuối cùng |
| `default_time_sec` | `INT` | Thời gian mặc định mỗi câu (VD: `20` giây) |
| `questions_snapshot_json` | `LONGTEXT` | Mảng câu hỏi đã chốt (gồm `correctOptionIds` chỉ giữ ở server) |
| `state` | `VARCHAR(32)` | `LOBBY`, `QUESTION_INTRO`, `QUESTION_ACTIVE`, `QUESTION_RESULT`, `LEADERBOARD`, `ENDED` |
| `current_q_index` | `INT` | Chỉ số câu hỏi hiện tại (`0..N-1`) |
| `question_started_at_ms` | `BIGINT` | Timestamp (ms) bắt đầu mở khóa bấm đáp án |
| `question_ends_at_ms` | `BIGINT` | Timestamp (ms) kết thúc câu hỏi |
| `state_version` | `INT` | Số phiên bản tăng dần mỗi lần đổi state |
| `created_at` | `VARCHAR(40)` | Thời điểm tạo (ISO-8601) |

### 4.2. Bảng `game_players`
| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | `VARCHAR(64) PK` | ID người chơi (`gpl_...`) |
| `session_id` | `VARCHAR(64) INDEX` | Khóa ngoại tới `game_sessions.id` |
| `nickname` | `VARCHAR(100)` | Tên hiển thị trong game |
| `student_code` | `VARCHAR(64)` | MSSV (bắt buộc nếu `require_student_code = 1`) |
| `device_token` | `VARCHAR(128)` | Tái sử dụng `getOrCreateDeviceToken()` để reconnect khi F5 |
| `score` | `INT DEFAULT 0` | Tổng điểm tích lũy |
| `prev_rank` | `INT DEFAULT 0` | Thứ hạng ở câu trước (để tính "Vượt X bậc!") |
| `streak` | `INT DEFAULT 0` | Chuỗi câu trả lời đúng liên tiếp |
| `correct_count` | `INT DEFAULT 0` | Tổng số câu trả lời đúng |
| `is_kicked` | `TINYINT(1) DEFAULT 0` | Cờ bị Host mời ra khỏi phòng |
| `joined_at` | `VARCHAR(40)` | Thời điểm tham gia |

### 4.3. Bảng `game_answers`
| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | `VARCHAR(64) PK` | ID lượt trả lời |
| `session_id` | `VARCHAR(64)` | ID phiên game |
| `player_id` | `VARCHAR(64)` | ID người chơi |
| `question_index` | `INT` | Thứ tự câu hỏi |
| `answer_payload_json` | `TEXT` | Payload đồng nhất với `AttemptAnswer` (`string \| string[] \| Record<string, boolean>`) |
| `is_correct` | `TINYINT(1)` | `1` nếu đúng hoàn toàn (`earned_ratio = 1`), `0` nếu sai/thiếu |
| `earned_ratio` | `DOUBLE DEFAULT 0` | Tỷ lệ điểm đạt được (`0.0` đến `1.0`, hỗ trợ điểm thành phần cho `MULTI_CHOICE`, `TRUE_FALSE`, `ESSAY`) |
| `response_time_ms` | `INT` | Thời gian phản hồi tính từ `question_started_at_ms` |
| `points_earned` | `INT` | Điểm nhận được ở câu này |
| `answered_at` | `VARCHAR(40)` | Thời điểm server ghi nhận |
* **Unique Index:** `UNIQUE (session_id, player_id, question_index)` — chống gửi đáp án trùng lặp.
* **Dọn dẹp dữ liệu:** Khi tạo game mới, dọn nhẹ các phiên `ENDED` quá 30 ngày (hoặc giữ theo cấu hình) để tránh phình DB.

---

## 5. LUỒNG GAME (STATE MACHINE) & CƠ CHẾ GAME DESIGN

### 5.1. Vòng đời trạng thái
```
LOBBY ──▶ QUESTION_INTRO (3s) ──▶ QUESTION_ACTIVE (15-45s) ──▶ QUESTION_RESULT
  ▲                                                                   │
  └──────── (Next Question) ◀──── LEADERBOARD (Top 5) ◀───────────────┘
                                        │
                                  (Last Question)
                                        ▼
                                  ENDED (Podium Top 3)
```
* **Bảo mật đáp án:** Khi `state` là `QUESTION_INTRO` hoặc `QUESTION_ACTIVE`, API trả về câu hỏi cho Player **tuyệt đối loại bỏ `correctOptionIds`**. Chỉ khi `state` chuyển sang `QUESTION_RESULT`, server mới trả về đáp án đúng và thống kê.
* **Trạng thái chờ trên điện thoại:** Khi sinh viên bấm xong sớm, màn hình chuyển ngay sang trạng thái *"Đã ghi nhận đáp án! Đang chờ các bạn khác..."* để tránh tâm lý bấm lại nhiều lần hoặc tưởng lag.

### 5.2. Công thức tính điểm & Động lực giữ chân người chơi
* Hệ thống chấm trả về `earnedRatio` trong khoảng `[0.0, 1.0]` (tương thích cả câu 1 đáp án và câu nhiều đáp án/mệnh đề/rubric):
* Nếu `earnedRatio <= 0`: `pointsEarned = 0`, `streak = 0`.
* Nếu `earnedRatio > 0`:
  * `multiplier = (isFinalQuestion && doubleFinalQuestion) ? 2 : 1`
  * `basePoints = 1000 * multiplier`
  * `timeRatio = clamp(responseTimeMs / (timeLimitSec * 1000), 0, 1)`
  * `speedScore = Math.round(basePoints * earnedRatio * (1 - timeRatio / 2))` *(từ 500–1000 điểm khi đúng 100%, hoặc 1000–2000 ở câu cuối)*
  * **Quy tắc Streak công bằng cho câu điểm thành phần:**
    * Nếu `earnedRatio === 1`: Tăng chuỗi (`newStreak = currentStreak + 1`), cộng `streakBonus = Math.min((newStreak - 1) * 100, 300)`.
    * Nếu `0.5 <= earnedRatio < 1` (đúng từ 50% trở lên ở câu `MULTI_CHOICE` / `TRUE_FALSE` cụm / `ESSAY`): **Bảo toàn `streak` hiện tại** (không tăng, không mất chuỗi) để tránh gây ức chế cho người chơi.
    * Nếu `earnedRatio < 0.5`: Reset `streak = 0`.
  * `pointsEarned = speedScore + streakBonus`
* **Micro-feedback cá nhân hóa (ở `QUESTION_RESULT`):**
  * Hiển thị rõ: `+890 điểm`, `Chuỗi 3 câu đúng 🔥`, `Hạng #6 (Cách #5 đúng 120 điểm)` hoặc `Bạn vừa tăng 4 bậc!`.

---

## 6. THIẾT KẾ API (`api/game.php`) & CHUẨN UI/UX

### 6.1. API Endpoints (`api/game.php`)
* **Nhóm Host (Yêu cầu Bearer HMAC từ `admin_auth.php`):**
  * `POST ?action=create`: Tạo phòng từ `questionIds` hoặc `examId`, lưu cấu hình `showQuestionOnPlayer`, `requireStudentCode`, `defaultTimeSec`, `doubleFinalQuestion`.
  * `POST ?action=next_state`: Chuyển trạng thái (`LOBBY` → `QUESTION_INTRO` → `QUESTION_ACTIVE` → `QUESTION_RESULT` → `LEADERBOARD` → `ENDED`) và cập nhật File State Cache.
  * `POST ?action=toggle_lock`: Khóa / mở khóa phòng ở Lobby.
  * `POST ?action=kick_player`: Xóa người chơi đặt tên không phù hợp.
  * `GET ?action=host_view&sessionId=...`: Lấy dữ liệu cho màn hình chiếu (danh sách người chơi, biểu đồ cột A–F cho trắc nghiệm, hoặc **Top 5 giá trị/từ khóa phổ biến + % đúng** cho câu `NUMERICAL`/`ESSAY` nhằm giữ payload gọn nhẹ, Top 5, Podium Top 3).
  * `GET ?action=export&sessionId=...`: Xuất dữ liệu toàn bộ người chơi (kèm MSSV, điểm, số câu đúng) để tải file Excel (`.xlsx`).
* **Nhóm Player (Public):**
  * `POST ?action=join`: Nhập `gamePin`, `nickname`, `studentCode` (nếu bắt buộc), `deviceToken`. Hỗ trợ reconnect giữ nguyên điểm.
  * `GET ?action=poll&pin=...`: Polling siêu nhẹ qua File Cache (`< 150 bytes`).
  * `GET ?action=player_state&sessionId=...&playerId=...`: Lấy câu hỏi hiện tại (ẩn đáp án đúng) hoặc kết quả câu vừa xong + thứ hạng cá nhân + khoảng cách tới người xếp trên.
  * `POST ?action=answer`: Nộp `answerPayload` (áp dụng Grace Window `1500ms`, sanitize & giới hạn tối đa `500` ký tự cho text/số), cập nhật `game_players` và `ac` trong File Cache.
* **Tái sử dụng Grading Engine (`api/essay_grader.php`):** `api/game.php` gọi `require_once __DIR__ . '/essay_grader.php'` để dùng chung bộ chuẩn hóa tiếng Việt & chấm rubric sẵn có của hệ thống, tránh viết lặp logic giữa bài thi và Live Game.

### 6.2. Chuẩn UI/UX cho Máy chiếu (Host) & Điện thoại (Player)
* **Nguyên tắc Tiếp cận & Máy chiếu (`GameHostPage.tsx`):**
  * **Tương phản cao & Font lớn:** Thiết kế tối ưu cho máy chiếu lớp học (thường bị mờ/chói đèn), dùng thanh tiến trình thời gian thu hẹp + đổi màu cảnh báo (Xanh → Vàng → Đỏ ở 5s cuối).
  * **Auto-scale chữ đáp án:** Câu hỏi Kinh tế học thường có đáp án dài 1–2 dòng; tự động điều chỉnh cỡ chữ trong 4 ô đáp án để không bị cắt chữ (`truncate`).
* **Nguyên tắc Mobile Ergonomics (`GamePlayPage.tsx`):**
  * **Color + Shape + Letter (Chống mù màu & lệch màu máy chiếu):** 4 nút luôn đi kèm đủ 3 dấu hiệu:
    * Đỏ + Tam giác `▲` + `A`
    * Xanh dương + Hình thoi `◆` + `B`
    * Vàng + Hình tròn `●` + `C`
    * Xanh lá + Hình vuông `■` + `D`
  * **Vùng chạm ngón cái:** 4 nút chiếm ~75% diện tích màn hình dưới, có `gap` rộng và `touch-action: manipulation` (tránh double-tap zoom trên iOS/Android).
  * **Badge nhận diện loại câu hỏi ở `QUESTION_INTRO` (3s):** Hiển thị nhãn nổi bật (*"CHỌN 1 ĐÁP ÁN"*, *"CHỌN NHIỀU ĐÁP ÁN"*, *"ĐÚNG HAY SAI"*, *"NHẬP ĐÁP ÁN SỐ"*) trên cả Host và Player để người chơi chuyển trạng thái tư duy kịp thời trước khi đồng hồ chạy.
  * **Ngoại lệ thông minh ở chế độ Máy chiếu (`showQuestionOnPlayer = false`):**
    * Với `NUMERICAL`, luôn hiển thị kèm **đơn vị tính (`numericalUnit`)** ngay cạnh ô nhập số để sinh viên không nhập nhầm đơn vị (VD: `5` vs `0.05`).
    * Với `TRUE_FALSE` cụm 4 ý, khuyến nghị tự động **tách thành 4 câu Đúng/Sai lẻ** khi chơi chế độ máy chiếu (tránh việc sinh viên phải ngước lên xuống đối chiếu từng dòng a, b, c, d).
  * **Chống bàn phím ảo che nút Gửi (`NUMERICAL` / `ESSAY`):** Dùng layout `100dvh` đặt ô nhập liệu + nút **"Gửi"** ở nửa trên màn hình (inline) để không bị bàn phím ảo iOS/Android che khuất.
  * Khi `showQuestionOnPlayer = true`: Phần trên hiển thị câu hỏi gọn gàng, bên dưới hiển thị các nút đáp án kèm đầy đủ nội dung text dễ đọc.
* **Tích hợp Routing & Trang hiện có:**
  * `src/App.tsx`: Thêm `/play`, `/play/:pin`, `/game/host/:sessionId`, `/game/play/:sessionId`.
  * `src/pages/HomePortalPage.tsx`: Thêm nút/tab **"Vào Game Live (Kahoot)"** tách biệt rõ ràng với khu vực Phòng thi nghiêm túc.
  * `src/pages/AdminDashboardPage.tsx`: Thêm nút **"Mở Live Game"** trên từng Đề thi ở tab `EXAMS` và modal tạo nhanh từ Ngân hàng câu hỏi (`BANK`) với đầy đủ các công tắc tùy chọn của giảng viên.

---

## 7. LỘ TRÌNH TRIỂN KHAI

| Giai đoạn | Hạng mục triển khai | Tiêu chí hoàn thành |
| :--- | :--- | :--- |
| **Phase 1: Core MVP** | 1. Cập nhật `api/schema.php` (3 bảng `game_*` với `answer_payload_json` & `earned_ratio`).<br>2. Xây dựng `api/game.php` (create, join/reconnect, poll qua File Cache, next_state, answer + grace window, host_view, kick/lock).<br>3. Tạo types `src/types/game.ts` & service `src/services/gameApi.ts` (có fallback `BroadcastChannel` cho Demo).<br>4. Xây dựng `GameHostPage.tsx` (Lobby, Intro, Active, Result Bar Chart, Leaderboard, Podium Top 3).<br>5. Xây dựng `GameJoinPage.tsx` & `GamePlayPage.tsx` hỗ trợ **`SINGLE_CHOICE` (2–6 đáp án), `TRUE_FALSE` (1 hoặc tách mệnh đề) & `MULTI_CHOICE`**, cả 2 chế độ hiển thị & MSSV.<br>6. Tích hợp vào `AdminDashboardPage.tsx` & `HomePortalPage.tsx`. | `npm run typecheck` và `npm run build` sạch; test thành công 1 Host + nhiều Player trên cả PHP API và Local Demo. |
| **Phase 2: Câu hỏi tính toán/từ khóa & Xuất báo cáo** | 1. Hỗ trợ **`NUMERICAL`** (nhập số + dung sai + biến động `dynamicVars`) & **`ESSAY`** có `gradingRubric` (chế độ Type Answer).<br>2. Sinh **QR Code** tại Lobby Host để sinh viên quét vào `/play/:pin` trong 2 giây.<br>3. Nút **Xuất Excel (`.xlsx`)** bảng điểm Game (kèm MSSV, số câu đúng, tổng điểm) bằng thư viện `xlsx` có sẵn.<br>4. Âm thanh phản hồi nhẹ bằng **Web Audio API** (nhạc nền/đếm ngược 5s/đúng-sai) + nút Mute/Unmute. | Giảng viên dùng trực tiếp trên lớp cho mọi dạng câu hỏi Kinh tế và lấy điểm cộng chuyên cần. |
| **Phase 3: Mở rộng nâng cao** | 1. Chế độ thi đấu theo Nhóm (`TEAM` mode).<br>2. Tùy chọn tích hợp WebSocket relay (Pusher/Soketi) cho hội thảo > 250 người. | Mở rộng quy mô sự kiện lớn và tương tác đội nhóm. |
