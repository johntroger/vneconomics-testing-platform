---
name: viet-game-art
description: >-
  Thiết kế đồ họa 2D chuyên nghiệp (nhân vật sprite tách nền, bối cảnh parallax
  cuộn ngang/tĩnh, đạo cụ và diễn hoạt Canvas 60fps) chuyên sâu cho dòng trò chơi
  Học đường & Dân gian Việt Nam (tab Game Việt). BẮT BUỘC kích hoạt skill này bất
  cứ khi nào người dùng yêu cầu làm mới, nâng cấp hình ảnh, sửa đồ họa xấu, hoặc
  tạo minigame mới thuộc chủ đề học sinh / trường học / trò chơi dân gian Việt Nam
  (như Chó rượt kiểm tra bài, Rồng rắn lên mây, Kéo co, Mèo đuổi chuột, Bịt mắt
  bắt dê, Cô giáo gọi bài, Nhảy bao bố, Ô ăn quan, Đua thuyền/xe đạp học trò...).
---

# Thiết kế Đồ họa Game Học đường & Dân gian Việt Nam (`viet-game-art`)

Skill này cấm tuyệt đối việc vẽ nhân vật và bối cảnh bằng các hàm hình học thô sơ trong code (`ctx.arc`, `ctx.fillRect` kiểu que diêm/ghép khối). Mọi trò chơi trong nhóm **Game Việt** phải sử dụng **asset minh họa 2D thực thụ** được sinh qua `image-generator`, tách nền sạch viền bằng script chuyên dụng, và diễn hoạt mượt trên `<canvas>` 60fps.

---

## Bước 1: Tư vấn & Chốt Phong cách Mỹ thuật (BẮT BUỘC HỎI TRƯỚC KHI VẼ)

Hệ thống hỗ trợ **3 phong cách mỹ thuật** để chuỗi Game Việt luôn tươi mới, không nhàm chán.
**Quy tắc bắt buộc:** Trừ khi người dùng đã chỉ định rõ phong cách trong câu lệnh, trước khi gọi `image-generator`, bạn **PHẢI gợi ý phong cách hợp nhất với cơ chế game đó và hỏi người dùng chọn 1 trong 3 phong cách**:

| Mã phong cách | Tên hiển thị | Đặc trưng thị giác | Hợp nhất với loại game |
| :--- | :--- | :--- | :--- |
| **`CHIBI_CEL`** | **2D Chibi Hoạt hình Viền đậm** | Nét mực nâu/đen rõ nét, tô mảng cel-shading rực rỡ, đầu to mắt long lanh, biểu cảm hài hước cường điệu (kiểu clip hoạt hình học đường viral). | Game rượt đuổi, kịch tính vui nhộn, bất ngờ (*Chó rượt kiểm tra bài, Cô giáo gọi bài, Trốn tìm, Sao đỏ đi tuần*). |
| **`STORYBOOK_WATERCOLOR`** | **Màu nước Sách tranh Đồng dao** | Nét cọ chì/mực ấm, loang màu nước trong trẻo trên nền giấy mỹ thuật ngà nhẹ, giàu chất thơ tuổi thơ & tranh truyện thiếu nhi Việt Nam. | Trò chơi dân gian truyền thống, sân đình, lũy tre, đồng quê (*Rồng rắn lên mây, Bịt mắt bắt dê, Ô ăn quan, Dung dăng dung dẻ*). |
| **`PIXEL_RETRO_VN`** | **Pixel Art 16-bit Học đường Việt** | Điểm ảnh sắc nét hiện đại (tỉ lệ pixel đồng nhất, bảng màu 24–32 màu ấm), chuyển động frame-by-frame giòn giã kiểu game thùng/indie. | Game đối kháng lực, đua nhịp độ, vượt chướng ngại (*Kéo co, Nhảy bao bố, Đua xe đạp chậm, Mèo đuổi chuột*). |

👉 Sau khi người dùng chọn phong cách, đọc ngay:
- [style-catalog.md](./references/style-catalog.md) để lấy **Prompt khóa phong cách (Style Lock Prompt)** chuẩn.
- [vietnam-motifs.md](./references/vietnam-motifs.md) để lấy chi tiết **trang phục học sinh & bối cảnh Việt Nam** đúng chuẩn.

---

## Bước 2: Quy hoạch Bộ Asset Tối ưu (Asset Manifest)

Mỗi game chỉ tạo bộ file `.png` gọn nhẹ đặt tại `public/assets/minigames/<game-slug>/`:

1. **Bối cảnh (1–2 lớp):**
   - Game cuộn ngang (như *Chó rượt*): `bg-street.png` (tỉ lệ ngang rộng 16:9 hoặc 21:9, thiết kế mép trái và mép phải có tông màu/đường chân trời khớp nhau để lặp ngang mượt).
   - Game sân bãi tĩnh (như *Kéo co, Bịt mắt bắt dê, Rồng rắn lên mây*): `bg-arena.png` (góc nhìn 3/4 từ trên chếch xuống tạo mặt sân rộng cho đám đông đứng).
2. **Nhân vật Học sinh (tái sử dụng hoặc theo game):**
   - Cần tối thiểu 2 biến thể (Nam & Nữ) ở các tư thế chính của game (ví dụ: `hs-nam-idle.png`, `hs-nam-run.png`, `hs-nu-idle.png`, `hs-nu-run.png`, `hs-caught.png`).
3. **Nhân vật Trung tâm / Đạo cụ chính:**
   - Ví dụ: Chú chó (`dog-bark.png`, `dog-run.png`, `dog-dance.png`), Cô giáo/Sao đỏ, Dây thừng kéo co, Khăn bịt mắt...

> **Quy tắc bảo toàn Áo trắng Học sinh khi sinh Sprite:**
> Học sinh Việt Nam mặc **áo sơ mi trắng** và có **tròng mắt trắng**. Khi gọi `image-generator` tạo sprite nhân vật:
> - **TUYỆT ĐỐI KHÔNG** dùng nền trắng (`#FFFFFF`).
> - **LUÔN LUÔN** yêu cầu nền đơn sắc phẳng màu **Xanh lá studio (`solid flat #00D964 chroma green background`)** không đổ bóng xuống nền (hoặc bóng tách rời), và nhân vật có **viền ngoài khép kín rõ nét (`clean closed dark outline around the entire character`)** để thuật toán tách nền không bao giờ ăn lẹm vào áo trắng.

---

## Bước 3: Sinh Ảnh & Tách nền Sạch viền Tự động

1. Gọi subagent `image-generator` theo từng asset trong Manifest (kèm trọn vẹn tiền tố + hậu tố từ [style-catalog.md](./references/style-catalog.md)).
2. Với **mọi sprite nhân vật/đạo cụ**, chạy script tách nền C#/.NET tích hợp sẵn (không cần cài Python hay thư viện ngoài):

```powershell
powershell -ExecutionPolicy Bypass -File ".agents/skills/viet-game-art/scripts/prepare-sprite.ps1" `
  -InputPath "<duong-dan-anh-goc.png>" `
  -OutputPath "public/assets/minigames/<game-slug>/<ten-sprite>.png" `
  -MaxHeight 260 `
  -Tolerance 58
```

- Nếu là `PIXEL_RETRO_VN`, thêm cờ `-PixelArt` để giữ nguyên cạnh sắc nét (`NearestNeighbor`), không làm nhòe điểm ảnh.
- Với ảnh nền `bg-*.png` (không tách nền), dùng cờ `-KeepBackground -MaxWidth 1600` để nén kích thước vừa khít màn chiếu lớp học.
3. **Kiểm chứng bắt buộc:** Dùng `read_file` mở trực tiếp ít nhất 2 file sprite vừa xuất ở `public/assets/minigames/<game-slug>/` để kiểm tra bằng mắt:
   - Nền xung quanh đã trong suốt hoàn toàn chưa?
   - Áo sơ mi trắng và mắt nhân vật còn nguyên vẹn, không bị thủng lỗ hay viền xanh không?
   - Nếu còn viền xanh nhẹ, chạy lại script với `-Tolerance 68 -Despill 1`.
4. Xóa ngay ảnh nháp gốc nếu nằm trong thư mục tạm theo quy tắc dọn dẹp dung lượng.

---

## Bước 4: Diễn hoạt Canvas 60fps & Hoàn thiện Trải nghiệm Lớp học

Đọc [canvas-animation-guide.md](./references/canvas-animation-guide.md) trước khi viết code component React cho game:
- **Preload toàn bộ ảnh** trước khi cho bấm bắt đầu; hiển thị trạng thái tải gọn đẹp nếu mạng chậm.
- **Không trượt cứng (No Sliding Statues):** Kết hợp lật luân phiên 2 frame chạy (`run1` / `run2` hoặc biến thiên pha nhún) với phép biến hình **Squash & Stretch** (`scaleX`, `scaleY`), độ nghiêng thân (`rotation`) và bóng elip mờ co giãn dưới chân.
- **Phân làn chiều sâu (Y-Sorting):** Luôn `sort((a, b) => a.y - b.y)` trước khi vẽ đám đông học sinh; bảng tên bo tròn đặt cao trên đầu kèm viền tương phản để đọc rõ từ cuối lớp học.
- **Tích hợp chuẩn Stage:** Đồng bộ đầy đủ `paceMode` (`3s / 9s / 17s / 26s`), `muted` (`gameAudio.ts`), và dọn sạch `requestAnimationFrame` / `setTimeout` khi unmount.
