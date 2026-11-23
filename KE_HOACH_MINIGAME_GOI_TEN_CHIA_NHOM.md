# KẾ HOẠCH NGHIÊN CỨU & TRIỂN KHAI HỆ SINH THÁI 36 MINIGAME LỚP HỌC
## Mở rộng Tab 7 — VNEconomics Testing Platform

> **Phạm vi tài liệu:** Thiết kế kiến trúc phần mềm ổn định (**Engine-Driven + `React.lazy` Code Splitting + Error Boundary**) cho hệ sinh thái **36 Minigame Gọi tên lên bảng & Chia nhóm ngẫu nhiên** thuộc **Tab 7 (`7. Live Game & Minigame`)**, kết hợp các cơ chế hay nhất từ **BeeClass, Wheel of Names, Online-Stopwatch, Wordwall, Blooket, Flippity**.
> **Trạng thái:** Bản kiến trúc 36 Game (5 Nhóm / 5 Lô) — Chờ xác nhận để bắt đầu code **Lô 1**.

---

## 1. TỔ CHỨC LẠI TAB 7 (`AdminDashboardPage.tsx`)

Đổi tên Tab 7 thành **`7. Live Game & Minigame`** gồm **2 Sub-tab** độc lập:
1. **Sub-tab 1: `Kahoot Live Arena`** — Giữ nguyên toàn bộ tính năng thi trắc nghiệm Live Game hiện có.
2. **Sub-tab 2: `Gọi tên & Chia nhóm (36 Minigame)`** — Gồm:
   * **Quản lý Danh sách Lớp (Unified Roster Manager):** Tải Excel/CSV (`studentRosterXlsx.ts`), Lấy từ Đề thi/Lớp sẵn có, hoặc Dán text nhanh; lưu Preset nhiều lớp; bật/tắt **Không gọi trùng**; bảng Lịch sử + **Xuất Excel (`.xlsx`)** điểm cộng.
   * **Thư viện 36 Game phân theo 5 Nhóm mục đích:** Tìm kiếm nhanh, lọc theo nhóm, bấm vào thẻ bất kỳ để mở sân khấu trình chiếu toàn màn hình tại URL riêng (`/minigame/:gameId`).

---

## 2. KIẾN TRÚC PHẦN MỀM ỔN ĐỊNH CHO 36+ GAME (SOFTWARE ARCHITECTURE)

Để vận hành 36 game mượt mà, không phình dung lượng tải trang (`bundle size`), không trùng lặp logic và không lỗi vặt khi chiếu trên lớp, hệ thống áp dụng **4 nguyên tắc kiến trúc cốt lõi**:

### 2.1. Code Splitting với `React.lazy` & `Suspense`
* Mọi game trong `MINIGAME_REGISTRY` đều được nạp động qua `React.lazy(() => import(...))`.
* Khi giảng viên mở Tab 7 hoặc mở `/minigame/wheel`, trình duyệt **chỉ tải đúng mã nguồn của game đó (~3–5KB)**, giữ trang chính nhẹ và khởi động tức thì.

### 2.2. Kiến trúc "Core Engines + Pluggable Skins/Mechanics" (Tránh lặp code)
Thay vì viết 36 file độc lập lặp lại logic Canvas, vật lý, animation và âm thanh, hệ thống xây dựng **4 Core Engines dùng chung** đã được kiểm thử kỹ:
```text
src/minigames/
├── types.ts                    # Interface chuẩn: RosterStudent, MinigamePlugin, StageTheme
├── registry.ts                 # MINIGAME_REGISTRY: Đăng ký 36 game, nhóm, URL slug & lazy loader
├── rosterStorage.ts            # Lưu/đọc ActiveRoster + Presets + History (có Schema Version)
├── MinigameErrorBoundary.tsx   # Chặn lỗi cục bộ, tự phục hồi không làm sập trang chiếu
├── MinigameStageLayout.tsx     # Khung chiếu chung: 3 Theme, Audio, Fullscreen, Ngân hàng câu hỏi, Điểm cộng
├── engines/                    # 4 Core Engines ổn định, dùng chung cho 36 game:
│   ├── WheelEngine.tsx         # Vật lý quay quán tính 60fps, kim gõ rung, đồng bộ tick âm thanh
│   ├── RaceEngine.tsx          # Đường đua đa làn 60fps, bứt tốc/hụt hơi ngẫu nhiên, chế độ Nhất/Chót
│   ├── GridPickEngine.tsx      # Lưới ô tương tác 3D (mở hộp, đập bóng/niêu/trứng, lật thẻ, hái lộc)
│   └── SpecialGames/           # Các cơ chế vật lý/đặc thù (Plinko, Gacha, Scratch, Elimination, Slot, Team)
```

### 2.3. An toàn Dữ liệu, Bảo mật & Công bằng Ngẫu nhiên
* **Random chuẩn mật mã (`crypto.getRandomValues`):** Đảm bảo mọi lượt quay/chia nhóm công bằng tuyệt đối, không bị thiên vị bởi `Math.random()` thông thường.
* **Tự động lấy mẫu thông minh khi lớp đông (`> 30` sinh viên):** Vòng quay giữ tối đa 28 lát cắt và Đường đua giữ tối đa 14 làn đua mỗi lượt (lấy ngẫu nhiên từ danh sách *chưa gọi*, có nút "Đổi lượt người" ngay trên sân khấu) để chữ luôn to, rõ trên máy chiếu.
* **Đồng bộ 2 chiều qua `BroadcastChannel`:** Khi mở `/minigame/:gameId` ở tab mới, mọi trạng thái (*Đã gọi / Vắng / Điểm cộng*) đồng bộ tức thì về Tab 7 trên `AdminDashboardPage`.
* **Bảo mật Ngân hàng câu hỏi:** Chỉ hiển thị tính năng *"Mở câu hỏi Ngân hàng đề"* khi phiên trình duyệt có token giảng viên hợp lệ (`ADMIN_TOKEN_KEY`), tránh lộ dữ liệu câu hỏi nếu người ngoài tự truy cập URL `/minigame/:gameId`. Khi mở câu hỏi trên máy chiếu, tự động nội suy biến số động (`dynamicVars`), ẩn đáp án mặc định và có nút **"Hiện đáp án"** riêng sau khi sinh viên trả lời miệng.
* **Phím tắt điều khiển từ bục giảng:** Hỗ trợ `Space` (Quay/Chạy game), `M` (Bật/Tắt âm thanh), `F` (Toàn màn hình máy chiếu).
* **Error Boundary & Guard:** Tự động xử lý các biên an toàn (danh sách 0 người, chỉ còn 1 người, sĩ số lẻ khi ghép cặp, tên quá dài) mà không bao giờ crash UI.
* **Schema Versioning & Giới hạn dung lượng `localStorage`:** Lưu kèm `version: 1`, giới hạn tối đa 20 Presets lớp và 500 dòng Lịch sử gần nhất để không bao giờ tràn bộ nhớ trình duyệt.

### 2.4. Tích hợp "BeeClass-style" Xuyên suốt Mọi Game
Trong `MinigameStageLayout` dùng chung, sau khi bất kỳ game nào gọi trúng tên sinh viên:
1. **Spotlight Winner Popup** bật lên kèm Avatar SVG Mascot (`GameAvatarBadge.tsx`) + Pháo giấy (`ConfettiBurst.tsx`).
2. **Nút "Mở câu hỏi Ngân hàng đề" (tùy chọn):** Bốc 1 câu hỏi từ học phần đang chọn để sinh viên trả lời ngay tại lớp (không cần điện thoại).
3. **Chấm điểm / Sao thi đua 1-chạm:** `⭐ +1 Điểm`, `🌟 +2 Điểm`, `🚫 Vắng (Quay lại)` — tự động lưu lịch sử và xuất Excel cuối buổi.

---

## 3. DANH MỤC 36 THỂ LOẠI GAME (PHÂN THEO 5 NHÓM)

### 🎯 Nhóm 1: Vòng quay & Nhắm bắn (8 Game)
| STT | ID (`/minigame/...`) | Tên Game | Hình ảnh / Đồ họa | Âm thanh | Hiệu ứng |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | `wheel` | **Vòng quay Kỳ diệu** | Đĩa tròn đa sắc 60fps, kim vàng đỉnh | Woodblock gõ theo lát + Fanfare | Quán tính giảm tốc, kim rung, Confetti |
| 2 | `neon-roulette` | **Bàn xoay Neon Casino** | Đĩa đen viền Neon + viên bi trắng | Tiếng bi lăn lách tách + Chime | Bi lăn **ngược chiều** rơi vào ô |
| 3 | `dartboard` | **Phóng Phi tiêu** | Bia tròn đỏ-trắng + phi tiêu SVG | Tiếng vút gió + "Phập!" trúng bia | Bia xoay liên tục, bấm phóng chủ động |
| 4 | `archery` | **Bắn Cung Vàng** | Cây cung vàng + bia trượt/xoay | Tiếng kéo dây cung + mũi tên bay | Kéo & thả dây cung ngắm hồng tâm |
| 5 | `dj-turntable` | **Đĩa than DJ** | Đĩa Vinyl đen bóng + cần gạt kim | Nhịp beat DJ + tiếng scratch đĩa | Đĩa xoay theo beat, hạ kim khóa tên |
| 6 | `pirate-compass` | **La bàn Hải tặc** | La bàn đồng cổ + bản đồ kho báu | Tiếng cót két tàu gỗ + chuông tàu | Kim la bàn dao động từ trường dừng chỉ tên |
| 7 | `radar-scan` | **Radar Quét Mục tiêu** | Màn hình radar xanh lá + lưới toàn lớp | Tiếng "Bíp... bíp" sonar quét | Tia radar xoay 360° khóa sáng thẻ tên |
| 8 | `spotlight-sweep` | **Đèn Sân khấu** | Sân khấu tối + chùm đèn rọi vàng | Tiếng trống rền + tiếng bật đèn "Tách!" | Đèn rọi nhảy qua lưới tên rồi khóa Spotlight |

### 🏎️ Nhóm 2: Đường đua Tốc độ (8 Game)
| STT | ID (`/minigame/...`) | Tên Game | Hình ảnh / Đồ họa | Âm thanh | Hiệu ứng |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 9 | `duck-race` | **Đường đua Vịt** | Vịt vàng SVG trên làn nước xanh | Tiếng còi xuất phát + "Quạc quạc!" | Gợn sóng nước, bứt tốc vượt mặt |
| 10 | `rocket-race` | **Đua Tên lửa Không gian** | Tên lửa SVG trên nền sao vũ trụ | Tiếng động cơ phản lực rền vang | Đuôi lửa bùng cháy, vệt sao trôi |
| 11 | `f1-race` | **Đua Xe Công thức 1** | Xe F1 trên đường nhựa + vạch kẻ | Tiếng gầm động cơ F1 + còi đích | Hiệu ứng `"⚡ NITRO!"`, khói lốp |
| 12 | `horse-race` | **Đua Ngựa Thảo nguyên** | Ngựa phi trên đồng cỏ + hàng rào | Tiếng vó ngựa phi dồn dập | Bụi cỏ bay phía sau, chọn Nhất/Chót |
| 13 | `dragon-boat` | **Đua Thuyền rồng** | Thuyền rồng rực rỡ trên sông | Tiếng trống chèo thuyền "Tùng... tùng" | Sóng rẽ 2 bên mũi thuyền |
| 14 | `mountain-climb` | **Leo núi Chinh phục** | Vách núi dốc đứng + cờ đỉnh núi | Tiếng gió núi + chuông cắm cờ | Nhân vật leo từng nhịp lên đỉnh |
| 15 | `swim-race` | **Bơi lội Olympic** | Bể bơi phân làn + phao nổi | Tiếng vỗ nước + còi trọng tài | Bọt nước tung tóe theo từng nhịp bơi |
| 16 | `frog-jump` | **Ếch Nhảy Lá sen** | Chú ếch xanh nhảy qua các lá sen | Tiếng "Ếch ộp" + tiếng tõm nước | Nhảy theo nhịp parabol từng bước |

### 🎁 Nhóm 3: Bí ẩn, Đập phá & Lật mở (10 Game)
| STT | ID (`/minigame/...`) | Tên Game | Hình ảnh / Đồ họa | Âm thanh | Hiệu ứng |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 17 | `mystery-box` | **Hộp quà Bí ẩn** | Lưới hộp quà thắt nơ đánh số | Trống dồn + tiếng mở hộp lấp lánh | Lắc lư mời gọi, bật nắp 3D + Spotlight |
| 18 | `balloon-pop` | **Đập Bóng bay** | Chùm bóng bay SVG nhiều màu | Tiếng nổ "BÙM!" (noise burst) | Bóng bay lơ lửng, vỡ mảnh + Screen Shake |
| 19 | `clay-pot` | **Đập Niêu đất** | Hàng niêu đất treo dây dân gian | Tiếng "Choang!" vỡ gốm chân thực | Niêu đung đưa, vỡ tan lộ dải tên |
| 20 | `treasure-chest` | **Mở Rương Kho báu** | Rương gỗ viền vàng có ổ khóa | Tiếng mở khóa "Cạch" + hợp âm vàng | Nắp rương bật mở, tia sáng vàng tỏa ra |
| 21 | `golden-egg` | **Đập Trứng Vàng** | Ổ trứng vàng lấp lánh trên bệ | Tiếng gõ vỏ "Cốc... cốc... Rắc!" | Nứt vỏ 2 nhịp rồi bung Avatar + Tên |
| 22 | `lucky-envelope` | **Hái Lộc Lì xì** | Cây mai/đào treo phong bao đỏ | Nhạc xuân nhẹ + tiếng xé bao | Bao lì xì rung nhẹ, rút thẻ tên từ trong bao |
| 23 | `fortune-cookie` | **Bẻ Bánh quy May mắn** | Đĩa bánh quy vàng giòn | Tiếng bẻ giòn "Rắc!" | Bánh tách đôi, dải giấy tên trượt ra |
| 24 | `memory-flip` | **Lật Thẻ bài 3D** | Bộ thẻ bài hoa văn học thuật | Tiếng lật bài "Xoẹt!" | Lật xoay 3D `rotateY(180deg)` mượt mà |
| 25 | `gold-miner` | **Đào Vàng Cổ điển** | Mỏ vàng + móc câu xoay lắc | Tiếng dây tời kéo + "Keng!" trúng vàng | Thả móc câu gắp cục vàng mang tên lên |
| 26 | `scratch-card` | **Thẻ cào Bạc** | Thẻ cào phủ lớp nhũ bạc | Tiếng cào thẻ sột soạt theo tay | Rê chuột/tay xóa lớp bạc dần lộ tên |

### ⚡ Nhóm 4: Vật lý, Xác suất & Sinh tồn (6 Game)
| STT | ID (`/minigame/...`) | Tên Game | Hình ảnh / Đồ họa | Âm thanh | Hiệu ứng |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 27 | `plinko` | **Bảng Đinh Plinko** | Bảng tam giác chốt đinh + ô đáy | Tiếng "Ting... ting" mỗi lần chạm đinh | Bóng rơi vật lý trọng lực nảy zíc-zắc |
| 28 | `gacha-capsule` | **Máy quay Bóng Gacha** | Lồng kính tròn chứa bóng 2 màu | Tiếng bóng va chạm + "Cạch" rớt bóng | Bóng nảy tưng bừng, lăn xuống máng và mở |
| 29 | `bamboo-sticks` | **Rút Thẻ Tre** | Ống xăm tre cổ điển + các thẻ gỗ | Tiếng thẻ tre xóc lách tách | Lắc ống mạnh rồi 1 thẻ vọt lên cao |
| 30 | `slot-machine` | **Máy Xèng 3 Cuộn** | Máy Slot 3 cửa sổ + cần gạt | Tiếng cuộn quay + "Ding! Ding! Ding!" | Dừng lần lượt từng cuộn (gọi 1–3 người) |
| 31 | `battle-royale` | **Loại trừ Sinh tồn** | Bảng lưới toàn bộ thẻ tên lớp | Tiếng tia sét "ZAP!" mỗi đợt loại | Gạch/nổ loại dần từng nhóm đến người cuối |
| 32 | `bomb-pass` | **Chuyền Bom Hẹn giờ** | Quả bom hoạt hình dây cháy sáng | Tiếng "Tích tắc" nhanh dần + "BÙM!" | Bom nhảy qua các thẻ tên, nổ trúng 1 người |

### 👥 Nhóm 5: Chia nhóm, Ghép cặp & Thứ tự (4 Game)
| STT | ID (`/minigame/...`) | Tên Game | Hình ảnh / Đồ họa | Âm thanh | Hiệu ứng |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 33 | `team-draft` | **Xếp đội Siêu tốc** | Các cột Đội sắc màu + Vương miện | Trống dồn + Fanfare hoàn tất | Thẻ bay `stagger` vào từng đội, Confetti |
| 34 | `turn-order` | **Thứ tự Thuyết trình** | Bảng số thứ tự `1..N` dạng thẻ | Tiếng lật từng lượt "Tách!" | Lật mở từng vị trí hoặc mở toàn bảng |
| 35 | `pair-match` | **Ghép cặp Ngẫu nhiên** | Các thẻ đôi kết nối bằng dây sáng | Tiếng ghép cặp "Ting!" vui tai | Thẻ 2 bạn bay lại gần ghép thành 1 cặp |
| 36 | `captain-draft` | **Bầu Đội trưởng & Chia quân** | Bục Đội trưởng + Danh sách quân | Tiếng còi + Fanfare công bố | Chọn N Đội trưởng trước, rồi chia quân |

---

## 4. THIẾT KẾ HÌNH ẢNH, HIỆU ỨNG & ÂM THANH CHUẨN GAME SHOW

Để tránh cảm giác "bíp điện tử chói tai" hay "giao diện form hành chính", toàn bộ 36 game dùng chung một **Audio-Visual Polish Engine** thiết kế riêng cho giảng đường:

### 4.1. Hình ảnh & Sân khấu Chuẩn Truyền hình
* **3 Theme Sân khấu có Hậu cảnh Động (GPU-accelerated):**
  1. `🌌 Đêm Gala (Neon)`: Đèn sân khấu quét nhẹ + hạt bokeh trôi chậm, tương phản cực cao khi tắt đèn máy chiếu.
  2. `☀️ Sáng Năng động`: Nền tươi sáng, dịu mắt cho phòng học mở hết đèn ban ngày.
  3. `🏆 VNE Gold`: Tông xanh Navy + Vàng Gold sang trọng cho thuyết trình/chung kết.
* **Đạo cụ & Nhân vật SVG Thiết kế Riêng:** Vịt bơi có gợn sóng, Tên lửa có đuôi lửa, Xe F1 có vạch đường, Hộp quà/Niêu đất/Rương kho báu có hiệu ứng **lắc lư mời gọi (`idle wobble`)** và **bung nắp/nứt vỡ 3D** khi chạm.
* **Spotlight Winner Cỡ đại:** Tên người được chọn hiển thị cỡ chữ đại (`clamp(2rem, 5vw, 4.5rem)`) kèm Avatar SVG, ánh sáng quét (`shimmer`) để sinh viên ngồi cuối giảng đường vẫn đọc rõ.

### 4.2. Âm thanh Ấm, Không Chói Tai & Đọc Tên Tiếng Việt
* **Bộ lọc Âm thanh Ấm (Low-pass + Soft Envelope):** Loại bỏ sóng `sawtooth` gắt tai; tiếng gõ vòng quay dùng âm **gỗ gõ (Woodblock)** êm tai; trống dồn dùng **Timpani/Snare** có độ vang.
* **Mixer Riêng biệt (Nhạc nền & SFX):** Giảng viên chọn được kiểu nhạc nền (`Sôi động`, `Nhẹ nhàng`, hoặc `Chỉ SFX - Tắt nhạc`) và chỉnh âm lượng độc lập để không át giọng giảng bài.
* **Tùy chọn Đọc Tên Tiếng Việt (`Web Speech API - vi-VN`):** Bật/tắt chế độ tự động đọc to *"Xin mời bạn [Họ tên]"* ngay khoảnh khắc Spotlight mở ra — tạo điểm nhấn cực thú vị trên giảng đường.
* **Nút "Thử Loa" (Sound Check):** Cho phép giảng viên test âm lượng loa lớp học trước khi vào game.

### 4.3. Nhịp điệu Cảm xúc ("Suspense Curve")
* **1 giây cuối hồi hộp:** Trước khi công bố kết quả, hiệu ứng chậm dần (slow-motion) rồi **bùng nổ đồng thời**: Kèn đồng `playWinnerFanfare()` + Pháo giấy `ConfettiBurst` 60fps + Spotlight + Đọc tên.
* **Screen Shake & Stagger:** Rung màn hình nhẹ `200ms` khi nổ bóng/bom; thẻ thành viên bay lần lượt vào từng đội khi chia nhóm.

---

## 5. LỘ TRÌNH TRIỂN KHAI CHIA THEO 5 LÔ (AN TOÀN & KIỂM THỬ TỪNG BƯỚC)

| Lô | Phạm vi triển khai | Số game hoàn thiện |
| :---: | :--- | :--- |
| **Lô 1: Kiến trúc Lõi & 2 Game Chủ lực** | • Tách Tab 7 thành 2 Sub-tab + Bộ lọc 5 Nhóm.<br>• `RosterManager` (Excel / Đề thi / Paste text + Preset + Chống gọi trùng + Lịch sử).<br>• `MINIGAME_REGISTRY` (`React.lazy`), `MinigameErrorBoundary`, `MinigameStageLayout` (3 Themes + Audio).<br>• Xây dựng `WheelEngine` + `TeamDraftGame`: **`wheel`**, **`team-draft`**. | **2 / 36** |
| **Lô 2: Bộ Engine Tương tác & Ngân hàng Câu hỏi** | • Tích hợp **"Mở câu hỏi Ngân hàng đề"** & **Chấm điểm/Sao 1-chạm** + **Xuất Excel**.<br>• Xây dựng `RaceEngine` & `GridPickEngine` → Xuất xưởng: **`duck-race`**, **`rocket-race`**, **`mystery-box`**, **`balloon-pop`**, **`memory-flip`**, **`clay-pot`**, **`treasure-chest`**, **`golden-egg`**, **`lucky-envelope`**, **`fortune-cookie`**. | **12 / 36** |
| **Lô 3: Mở rộng Vòng quay & Đường đua** | • Tận dụng `WheelEngine` & `RaceEngine` với đồ họa/SFX riêng → Xuất xưởng: **`neon-roulette`**, **`dartboard`**, **`archery`**, **`dj-turntable`**, **`pirate-compass`**, **`f1-race`**, **`horse-race`**, **`dragon-boat`**, **`mountain-climb`**, **`swim-race`**, **`frog-jump`**. | **23 / 36** |
| **Lô 4: Game Vật lý & Kịch tính cao** | • Xây dựng các cơ chế vật lý đặc thù: **`plinko`**, **`gacha-capsule`**, **`scratch-card`**, **`battle-royale`**, **`slot-machine`**, **`bomb-pass`**, **`bamboo-sticks`**, **`gold-miner`**. | **31 / 36** |
| **Lô 5: Hoàn thiện Nhắm mục tiêu & Chia nhóm** | • Hoàn tất 5 game còn lại: **`radar-scan`**, **`spotlight-sweep`**, **`turn-order`**, **`pair-match`**, **`captain-draft`**. | **36 / 36** |

---

## 6. CHECKLIST CHỐT CUỐI TRƯỚC KHI CODE

1. **Lọc sinh viên vắng mặt (`absent`):**
   * Nhóm game **Gọi tên** lọc `students = allStudents.filter(s => !s.absent && (!excludeCalled || !s.called))`.
   * Nhóm game **Chia nhóm / Thứ tự** luôn dùng `allStudents.filter(s => !s.absent)` để không bị thiếu thành viên dù bạn đó đã được gọi lên bảng ở đầu giờ.
2. **Trạng thái `ready` theo từng Lô trong `MINIGAME_REGISTRY`:** Các game thuộc Lô chưa triển khai được gắn cờ `ready: false` (hiển thị nhãn *"Sắp ra mắt"* trên Tab 7) để giảng viên chỉ bấm vào các game đã hoàn thiện và kiểm thử kỹ.
3. **Graceful Fallback cho Đọc tên Tiếng Việt (`speechSynthesis`):** Kiểm tra hỗ trợ giọng `vi-VN` trên trình duyệt giảng đường; nếu máy không có gói giọng tiếng Việt thì tự động bỏ qua êm ái, chỉ phát nhạc Fanfare.
4. **Hiệu năng & An toàn:** Mọi game dùng `React.lazy`, chạy trong `MinigameErrorBoundary`, sử dụng `crypto.getRandomValues` cho độ ngẫu nhiên công bằng tuyệt đối.
