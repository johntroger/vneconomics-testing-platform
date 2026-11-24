# Danh mục 3 Phong cách Mỹ thuật (`style-catalog.md`)

Sử dụng đúng công thức Prompt tiếng Anh dưới đây khi giao việc cho subagent `image-generator` để đảm bảo tính đồng nhất tuyệt đối giữa bối cảnh và mọi nhân vật trong cùng một trò chơi.

---

## 1. `CHIBI_CEL` — 2D Chibi Hoạt hình Viền đậm (Mặc định cho game rượt đuổi, hài hước)

- **Cảm hứng:** Hoạt hình học đường Việt Nam viral, nét vẽ Chibi đầu to 2.5–3 đầu, mắt to biểu cảm cực mạnh, viền mực nâu đen (`#2B1B17`) dày dặn khép kín, đổ bóng cel-shading 2 sắc độ tươi tắn.
- **Prompt cho Bối cảnh (`bg-*.png`):**
  > `Vibrant 2D cel-shaded cartoon background illustration of a lively Vietnamese schoolyard / street scene, [MÔ TẢ BỐI CẢNH CỤ THỂ], bold clean dark-brown ink outlines, warm sunny tropical lighting, lush red flamboyant flowers (hoa phượng đỏ), nostalgic yellow walls and red clay roof tiles, rich hand-painted cel shading, horizontal wide game stage view, clear flat walkable road/ground area in the lower third for 2D characters to run on, NO characters in the scene, high quality 2D game background art.`
- **Prompt cho Sprite Nhân vật (`*.png`):**
  > `Single full-body 2D chibi cartoon character sprite of [MÔ TẢ NHÂN VẬT & TƯ THẾ], side-three-quarter view facing right, 2.5-head chibi proportion, expressive oversized eyes, bold clean closed dark ink outline around the entire silhouette, vibrant cel-shading, [CHI TIẾT ĐỒNG PHỤC VIỆT NAM], isolated centered on a completely flat solid #00D964 chroma green background, NO ground shadow, NO props detached from body, NO text, crisp 2D game asset.`

---

## 2. `STORYBOOK_WATERCOLOR` — Màu nước Sách tranh Đồng dao (Hợp trò chơi dân gian)

- **Cảm hứng:** Tranh minh họa sách thiếu nhi Việt Nam & đồng dao hiện đại (Kim Đồng / Nhã Nam), nét bút chì than nâu ấm kết hợp mảng màu nước loang nhẹ trong trẻo, ấm áp và giàu chất thơ.
- **Prompt cho Bối cảnh (`bg-*.png`):**
  > `Charming Vietnamese children's storybook watercolor illustration of [MÔ TẢ BỐI CẢNH DÂN GIAN / SÂN TRƯỜNG], warm expressive colored-pencil and ink linework with soft sunlit watercolor washes, nostalgic Vietnamese village banyan tree / courtyard / bamboo grove / schoolyard atmosphere, clear open playable ground space in the lower half, NO people or animals in background, whimsical high-craft 2D game backdrop.`
- **Prompt cho Sprite Nhân vật (`*.png`):**
  > `Single full-body Vietnamese children's storybook illustration sprite of [MÔ TẢ NHÂN VẬT & TƯ THẾ], cute rounded proportions, warm dark-sepia ink closed outer contour with hand-painted watercolor shading inside the silhouette, [CHI TIẾT TRANG PHỤC], completely isolated on a flat solid #00D964 chroma green background with crisp outer edges, NO floor shadow, NO floating particles, NO text.`

---

## 3. `PIXEL_RETRO_VN` — Pixel Art 16-bit Học đường Việt Nam (Hợp đối kháng, đua tốc độ)

- **Cảm hứng:** Game 2D Pixel Art 16-bit/32-bit hiện đại (cỡ Stardeus / Eastward / River City Ransom) nhưng mang linh hồn phố phường & sân trường Việt Nam rực nắng.
- **Prompt cho Bối cảnh (`bg-*.png`):**
  > `Crisp 16-bit modern pixel art side-view / three-quarter game background of a sunny Vietnamese school gate and street, [MÔ TẢ CHI TIẾT], clean pixel clusters, cohesive 32-color warm tropical palette, red flamboyant tree pixels, Vietnamese shophouses, clear wide road/courtyard in the bottom third for sprites, NO characters, authentic indie game pixel art.`
  *(Lưu ý: Trên biển hiệu chỉ dùng biểu tượng như ly trà sữa, ổ bánh mì, quyển vở hoặc chữ cực ngắn như `SÁCH`, `KEM` để tránh lỗi chữ AI trong pixel art).*
- **Prompt cho Sprite Nhân vật (`*.png`):**
  > `Single full-body 16-bit pixel art game character sprite of [MÔ TẢ NHÂN VẬT & TƯ THẾ], facing right, cute expressive chibi pixel proportions, crisp 1px dark outline fully enclosing the sprite, clean pixel clusters without blurry anti-aliasing, [CHI TIẾT TRANG PHỤC], isolated on a completely flat solid #00D964 chroma green background, NO shadow on ground, NO text.`

---

## Quy tắc Chữ Tiếng Việt trong Ảnh AI

Các mô hình tạo ảnh đôi khi viết sai dấu tiếng Việt phức tạp trên biển hiệu nhỏ. Do đó:
1. **Ưu tiên biển hiệu bằng hình vẽ (Iconic Signage):** Vẽ ly trà sữa trân châu, ổ bánh mì, xe kem ốc quế, chồng sách vở, lá cờ Tổ quốc đỏ sao vàng — học sinh nhìn nhận ra ngay lập tức mà không sợ sai chính tả.
2. **Chữ quan trọng (như biển tên trường, bong bóng thoại `"GÂU!"`, `"Ơ... không phải đứa này!"`, bảng tên học sinh):** Vẽ bằng **Canvas/UI code với font hệ thống hỗ trợ tiếng Việt sắc nét** đè lên đúng vị trí khung biển hoặc trên đầu nhân vật!
