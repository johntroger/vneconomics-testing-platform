# Hướng dẫn Diễn hoạt Sprite 2D trên Canvas 60fps (`canvas-animation-guide.md`)

Tài liệu kỹ thuật bắt buộc tuân thủ khi lập trình React + `<canvas>` cho các trò chơi sử dụng asset từ skill `viet-game-art`.

---

## 1. Bộ Tải Trước Ảnh An toàn (`useSpriteSheetLoader`)

Không bao giờ gọi `new Image()` bên trong vòng lặp `requestAnimationFrame`. Hãy tải toàn bộ ảnh một lần trong `useEffect`:

```ts
function loadImages(manifest: Record<string, string>): Promise<Record<string, HTMLImageElement>> {
  const entries = Object.entries(manifest);
  return Promise.all(
    entries.map(
      ([key, src]) =>
        new Promise<[string, HTMLImageElement]>((resolve, reject) => {
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => resolve([key, img]);
          img.onerror = () => reject(new Error(`Failed to load ${src}`));
          img.src = src;
        }),
    ),
  ).then((loaded) => Object.fromEntries(loaded));
}
```

- Với phong cách **`PIXEL_RETRO_VN`**, luôn bật `ctx.imageSmoothingEnabled = false` để điểm ảnh sắc cạnh.
- Với **`CHIBI_CEL`** và **`STORYBOOK_WATERCOLOR`**, bật `ctx.imageSmoothingEnabled = true` và `ctx.imageSmoothingQuality = 'high'`.

---

## 2. Diễn hoạt Sống động với Ít Frame ("2D Game Juice")

Ngay cả khi mỗi nhân vật chỉ có 2–3 frame sprite tách nền (`idle`, `run`, `caught/dance`), nhân vật vẫn trông cực kỳ mượt nếu áp dụng **4 lớp chuyển động vật lý** quanh điểm neo dưới chân `(actor.x, actor.y)`:

1. **Bóng đổ mềm dưới mặt đất (vẽ TRƯỚC sprite):**
   - Vẽ hình elip đen mờ `rgba(15, 23, 42, 0.26)` ngay tại `(x, groundY)`. Khi nhân vật nảy lên cao `bounceY`, thu nhỏ bán kính bóng `1 - bounceY * 0.012` để tạo cảm giác rời mặt đất thật.
2. **Nén & Giãn (Squash & Stretch) quanh điểm đặt chân:**
   ```ts
   const phase = tSec * 16 + actor.phaseOffset;
   const bounceY = Math.abs(Math.sin(phase)) * 11;
   const stretch = Math.sin(phase * 2) * 0.07; // nén khi chạm đất, giãn khi bật lên
   const scaleX = (facingLeft ? -1 : 1) * (1 - stretch);
   const scaleY = 1 + stretch;
   const tiltRad = isRunning ? Math.sin(phase) * 0.06 + 0.05 : 0;

   ctx.save();
   ctx.translate(actor.x, actor.y - bounceY);
   ctx.rotate(tiltRad);
   ctx.scale(scaleX, scaleY);
   // Vẽ ảnh với điểm neo ở giữa-đáy (bottom-center anchor):
   ctx.drawImage(spriteImg, -drawW / 2, -drawH, drawW, drawH);
   ctx.restore();
   ```
3. **Đa dạng hóa Đám đông Học sinh (Crowd Variety):**
   - Xen kẽ sprite Nam (`hs-nam-*`) và Nữ (`hs-nu-*`) dựa trên giới tính (`student.gender`) hoặc mã băm `hashCode(student.id)`.
   - Biến thiên nhẹ chiều cao (`0.94` – `1.06`) và lệch pha bước chạy (`phaseOffset`) để 20 học sinh không dậm chân đồng loạt như robot.
4. **Hiệu ứng Hạt Hoạt hình (Stylized Particles):**
   - Thay vì chấm tròn đơn điệu, vẽ **giọt nước mắt/mồ hôi hình giọt nước** màu xanh ngọc có đốm sáng trắng khi chạy trốn, **đám mây bụi trắng tròn xốp** dưới gót giày, và **rung nhẹ camera (Screen Shake 4–6px giảm dần trong 250ms)** đúng khoảnh khắc tiếng sủa `"GÂU!!"` vang lên.

---

## 3. Cuộn Nền Liền mạch (Seamless Horizontal Scroll)

Nếu ảnh nền `bg-street.png` không đối xứng hoàn hảo 100% ở hai mép trái–phải, dùng kỹ thuật **Mirror-Tile Alternation** (lát chẵn vẽ xuôi, lát lẻ lật ngang `ctx.scale(-1, 1)`) khi nền không chứa chữ cứng — hai mép nối sẽ khớp màu và đường chân trời tuyệt đối 100% không bao giờ lộ vệt cắt!

---

## 4. Chống Chồng chéo Bảng tên Học sinh trên Màn chiếu

- Chỉ hiển thị tối đa `20–24` nhân vật đại diện trên sân khấu (luôn bao gồm người được chọn `winner`).
- Phân bố học sinh trên 3–4 làn độ sâu `Y` trên mặt đường/sân; sắp xếp `actors.sort((a, b) => a.y - b.y)` trước khi vẽ.
- Nhãn tên đặt tại `actor.y - drawH - 18`, nền trắng ngà `rgba(255, 255, 255, 0.95)`, viền đậm `2px #0f172a`, font `800 13px` để học sinh ngồi bàn cuối vẫn đọc rõ tên mình.
