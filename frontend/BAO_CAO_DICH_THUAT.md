# Báo cáo sửa dịch thuật VI/EN — 25/11/2026

Đầu vào: `frontend(9).zip`. Giữ thư mục gốc `frontend/`, bố cục phân hệ và hợp đồng API. Bản sửa tập trung vào nội dung giao diện, bộ dịch, định dạng hiển thị và các lỗi phát hiện khi xác minh.

## Thay đổi

- Bổ sung **408 khóa dịch** so với bộ từ điển cũ đã chuẩn hóa; chỉnh cách diễn đạt của **57 khóa cũ**. Bộ từ điển hiện có 2.044 khóa.
- Chuẩn hóa khóa và khoảng trắng, bỏ 58 mục trùng hoặc chỉ khác khoảng trắng; hỗ trợ Unicode tiếng Việt dạng tổ hợp mà API có thể trả về.
- Hoàn thiện thông báo đăng nhập, OTP, khôi phục phiên, giới hạn tần suất, kiểm tra dữ liệu, chuyển giao đơn hàng, giao việc, nhắc việc và nghiệp vụ thu/chi.
- Ưu tiên mẫu câu cụ thể; dịch được thông báo lồng nhau. Giới hạn mẫu đếm bằng số để không nhận nhầm câu trạng thái thành số lượng chứng từ. Ví dụ: `Chưa xác định hạn · Cần tách chứng từ` hiển thị đầy đủ thành `No due date · Document split required`.
- Sửa số ít/số nhiều ở các thông báo đếm; bổ sung dịch cho nhãn ghép, trạng thái thu, chú giải biểu đồ, tiêu đề cửa sổ, tên phòng ban và các nhãn trợ năng.
- Bộ lọc tài khoản và ô chọn có tìm kiếm hiển thị theo ngôn ngữ hiện tại; dữ liệu lựa chọn vẫn dùng giá trị gốc. Nội dung hộp xác nhận và thông báo nhập liệu không bị giữ ở ngôn ngữ cũ.
- Sửa định dạng tiền và cách đọc nghìn/triệu/tỷ theo ngôn ngữ. Giữ quy ước phân tích số đầu vào hiện có; bản tiếng Anh giải thích đúng dấu phân cách mà hệ thống chấp nhận.
- Nội dung mặc định do các biểu mẫu tài chính tạo ra được dịch; nội dung đã được người dùng sửa được giữ nguyên khi đổi ngôn ngữ.
- Nội dung mặc định trong email báo lỗi theo ngôn ngữ đang chọn. Mẫu biểu đổi mật khẩu cá nhân hiển thị và kiểm tra tối thiểu 12 ký tự, khớp quy tắc sẵn có của dịch vụ đổi mật khẩu.
- Tệp Excel mẫu dịch đầy đủ tiêu đề, ghi chú cột, mô tả kiểu dữ liệu, ví dụ, thông báo kiểm tra ô và trang hướng dẫn. Ngôn ngữ xuất được sử dụng độc lập với ngôn ngữ giao diện.
- Dọn biến/import không dùng và sửa các dependency của hook để kiểm tra mã không còn lỗi hoặc cảnh báo. Không thay cơ chế phân quyền, endpoint hoặc cấu trúc lưu dữ liệu.
- Thêm `scripts/check-translations.mjs`, lệnh `npm run check:i18n` và 9 bài kiểm tra hồi quy dịch thuật.

## Kết quả xác minh

| Kiểm tra | Kết quả |
|---|---|
| Quét mã nguồn | 117 tệp JS/JSX; 2.590 chuỗi/mẫu câu tiếng Việt được đối chiếu; không còn chuỗi hệ thống thiếu bản dịch hoặc nội dung JSX tiếng Việt viết trực tiếp trong phạm vi kiểm tra |
| Kiểm tra tự động | **114/114 đạt**, bao gồm 9 bài mới về dịch thuật, thông báo lồng nhau, dữ liệu tham chiếu, Excel và kiểm tra biểu mẫu |
| ESLint | **0 lỗi, 0 cảnh báo** |
| Build production | **Thành công**; có `dist/` trong gói |
| Kiểm tra trình duyệt | 48 trạng thái màn hình/hộp thoại với dữ liệu mẫu và API giả lập: Admin 23, CEO 11, Sale 6, Kế toán 8; không có lỗi JavaScript được ghi nhận |
| Excel | Tạo tệp XLSX rồi đọc lại để xác minh tiêu đề, ghi chú, quy tắc kiểm tra ô và trang hướng dẫn tiếng Anh; kiểm tra mô tả cột của mọi bảng ở cả VI/EN |

Trong trình duyệt đã kiểm tra các tab được phép theo vai trò, đổi VI/EN qua lại, giữ lựa chọn ngôn ngữ sau tải lại, thông tin tài khoản, đổi mật khẩu, ô lọc tài khoản, tạo tài khoản, ba biểu mẫu nhập đơn hàng và các biểu mẫu tạo doanh thu/phải thu/phải trả. Việc đổi ngôn ngữ khi đã nhập ghi chú được kiểm tra để tránh thay đổi nội dung người dùng.

Các tên người, tên công ty chưa có bản tên tiếng Anh được định nghĩa và ghi chú tự do có thể giữ tiếng Việt trong giao diện EN. Đây là dữ liệu nghiệp vụ được bảo toàn, không phải nhãn giao diện chưa dịch. Mã PO, số chứng từ, email và giá trị định danh không bị đổi trong dữ liệu lưu hoặc gửi API.

## Giới hạn của kết quả

Gói được cung cấp chỉ có frontend. Kiểm tra trình duyệt dùng API giả lập và dữ liệu mẫu của dự án, không kết nối backend hay dữ liệu vận hành thực tế. Chưa xác minh việc gửi OTP/email thật, thu hồi phiên phía máy chủ, ghi dữ liệu thật, cấu hình HTTPS hoặc nội dung thông báo mới chỉ có trong backend.

Kết quả này xác nhận bản sửa dịch thuật và khả năng build của frontend. Trước khi công khai hệ thống cần chạy lại các luồng đăng nhập, OTP, phân quyền và ghi dữ liệu trên backend triển khai thực tế. Chưa thực hiện triển khai công khai.

## Chạy lại kiểm tra

```sh
npm ci
npm run check:i18n
npm test
npm run lint
npm run build
npm run dev
```

Không kèm `node_modules` để tránh dùng nhầm binary Windows/Linux. `package-lock.json` được giữ và cập nhật cùng dependency kiểm tra mã nguồn; `dist/` được tạo từ bản mã nguồn cuối.
