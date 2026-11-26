---
trigger: always_on
---

# Quy tắc Tự động Đồng bộ Git & Deploy Plesk

Sau khi hoàn thành tác vụ lập trình và đã xác minh đạt (`npm run typecheck`, `npm run build`, `npm test` — và dọn thư mục tạm `dist/`):
1. Kiểm tra `git status` để chắc chắn không đưa nhầm file tạm, file bí mật (`.env`, `api/config.php`) hoặc thay đổi ngoài phạm vi tác vụ.
2. Stage các tệp thuộc tác vụ hiện tại, tạo commit rõ ràng theo chuẩn Conventional Commits (ví dụ `feat(...)`, `fix(...)`), và chạy `git push origin main` để kích hoạt workflow `.github/workflows/deploy-plesk.yml` tự động đồng bộ lên Plesk.
3. Chỉ bỏ qua bước push nếu người dùng yêu cầu rõ là chỉ sửa thử nghiệm ở local hoặc nếu kiểm thử/build đang thất bại.
