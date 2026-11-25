# Frontend Uyên Vũ International

Bản sửa dịch thuật VI/EN ngày 25/11/2026. Giữ cấu trúc dự án `frontend/`, các phân hệ và hợp đồng API đang sử dụng. Chi tiết thay đổi, phạm vi kiểm tra và giới hạn xác minh nằm trong [BAO_CAO_DICH_THUAT.md](BAO_CAO_DICH_THUAT.md).

## Chạy trên máy

Yêu cầu Node.js theo `package.json`: `^20.19.0 || >=22.12.0`.

```sh
npm ci
npm run dev
```

Frontend chạy tại `http://127.0.0.1:3000`. Backend cần chạy riêng; địa chỉ proxy mặc định là `http://127.0.0.1:4000`. Nếu cần thay đổi, sao chép `.env.example` thành `.env`, rồi cấu hình `VITE_API_BASE_URL` và `VITE_BACKEND_PROXY_TARGET`. Khởi động lại dev server sau khi sửa biến môi trường.

Gói ZIP không kèm `node_modules`; chạy `npm ci` để cài đúng dependency cho Windows/Linux của máy đang dùng.

## Kiểm tra trước khi phát hành

```sh
npm run check:i18n
npm test
npm run lint
npm run build
```

`check:i18n` kiểm tra khóa dịch trùng, bản dịch thiếu, bản dịch còn tiếng Việt, nội dung JSX và thuộc tính trợ năng chưa đi qua bộ dịch. Cần kiểm tra riêng nội dung mới do backend cung cấp hoặc người dùng nhập.

## Đưa bản build lên máy chủ

`dist/` trong ZIP đã được build từ mã nguồn sửa lần này. Có thể tạo lại bằng `npm run build`.

Phục vụ nội dung thư mục `dist/` qua web server, cấu hình SPA fallback về `index.html` và chuyển tiếp `/api/` đến backend thực tế. Dự án có sẵn `nginx.conf` cho container và `nginx.vps.conf` làm cấu hình tham khảo cho VPS; cần dùng đúng hostname, chứng chỉ HTTPS và đường dẫn thực tế của máy chủ.

Chỉ chép bản build vào thư mục web được phục vụ. Backend, cơ sở dữ liệu, email OTP và phiên đăng nhập phải được kiểm tra trên môi trường triển khai thực tế. Bản frontend này chưa được triển khai lên máy chủ công khai.
