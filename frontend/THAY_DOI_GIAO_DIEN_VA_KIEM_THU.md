# Cập nhật giao diện và kiểm tra theo vai trò

Ngày thực hiện: 05/11/2026. Phạm vi: các chức năng đã có trong frontend được cung cấp.

## Phân bổ màu

| Thành phần | Màu | Cách dùng |
|---|---|---|
| Header và nền đăng nhập | #030407 | Tạo tương phản cho logo vàng, giữ khu vực điều hướng gọn |
| Thao tác chính, đường dẫn, sản xuất | #1558C9 | Nút lưu, xuất báo cáo, xem hồ sơ và cột sản xuất |
| Điểm nhấn | #D4FF24 | Điều hướng đang chọn, chi tiết trang đăng nhập, cột đóng gói có vân sọc |
| Đã thu | #9BBC12 | Biến thể lime dễ phân biệt với xanh dương trên biểu đồ |
| Cảnh báo đỏ | #CF263B | Quá hạn, đến hạn, thiếu lịch hoặc vấn đề cần xử lý theo nghiệp vụ |
| Cần theo dõi | #B54350 | Đỏ trầm, kèm nhãn rõ mức ưu tiên |
| Nền đọc dữ liệu | #FFFFFF / #F3F6FB | Bảng, biểu mẫu và thẻ số liệu; tránh nền neon toàn màn hình |

Đỏ đi cùng nhãn và biểu tượng, không dùng làm màu trang theo vai trò. Màu biểu đồ không thay thế trạng thái nghiệp vụ. Hàng về/giao một phần còn hạn dùng màu tiến độ bình thường; không tự coi tỷ lệ dưới 100% là báo động. Tooltip dùng chữ đậm màu để các chuỗi lime vẫn dễ đọc. Logo và dữ liệu nguồn được giữ nguyên.

## Những chỗ đã chỉnh để dễ thao tác

Cảnh báo mở đúng hồ sơ hoặc cửa sổ duyệt, không tự điền mã chứng từ vào tìm kiếm khiến KPI ở các phân hệ khác thành 0. Trong bảng công nợ có nút Chi tiết. Bảng giữ cột Thao tác khi cuộn ngang.

Hồ sơ phải trả có nhóm Chờ CEO duyệt, Đã duyệt chi, Cần lập đề nghị và Cần bổ sung. Nút tài chính hiển thị theo vai trò và trạng thái thực tế. Hồ sơ gộp nhiều nhà cung cấp có thông báo cần đối soát, không có nút ghi nhận chi cho nhóm chưa tách.

Ô nhập tiền nhận số có dấu phân cách và hiển thị VND. Giới hạn số tiền được kiểm tra trước khi gửi lưu. Lỗi nghiệp vụ nằm ngay trong cửa sổ, giữ nội dung người dùng đã nhập để sửa tiếp.

Biểu mẫu tiến độ chia nhóm số lượng, lịch giao, sản xuất và cảnh báo thủ công. Lý do cập nhật luôn ở bên ngoài nhóm thu gọn. Có nút Cập nhật tiến độ để đi thẳng đến biểu mẫu; nút Lưu được giữ dễ tìm khi cuộn. Kế toán xem bản thông tin chỉ đọc, không phải nhìn nhiều ô nhập bị khóa.

Khi đóng cửa sổ có nội dung chưa lưu, hệ thống cho chọn Tiếp tục chỉnh sửa hoặc Bỏ thay đổi. Nút Esc và Tab được xử lý trong cửa sổ đang mở. Tải lại trang khi chưa lưu dùng cảnh báo của trình duyệt. Bộ lọc đang áp dụng có nhãn bỏ từng điều kiện và nút Xóa lọc; bảng rỗng có đường quay lại danh sách.

## Các thao tác đã thử trên giao diện

| Vai trò / tình huống | Thao tác và kết quả |
|---|---|
| CEO | Mở đề nghị từ cảnh báo: vào ngay hồ sơ BILL-15089-02, giữ nguyên các KPI và ô tìm kiếm |
| CEO | Nhập ý kiến rồi Esc: hiện lựa chọn giữ/bỏ nội dung; tiếp tục chỉnh sửa vẫn còn ý kiến |
| CEO | Duyệt đề nghị: hồ sơ chuyển Đã duyệt, chưa tự ghi khoản chi; bộ lọc chờ duyệt cập nhật đúng |
| Kế toán | Đối soát khoản 25 triệu chưa rõ khách hàng, sau đó chỉ chọn được hóa đơn của cùng khách |
| Kế toán | Nhập phân bổ 26 triệu khi chỉ còn 25 triệu: bị chặn và báo rõ giới hạn; nhập 25 triệu thì lưu được |
| Kế toán | Phân bổ 25 triệu vào hóa đơn còn nợ 80 triệu: còn 55 triệu, thực thu tăng đúng 25 triệu |
| Kế toán | Ghi nhận chi 3 triệu: dư nợ 180 còn 177 triệu, đã trả 80 tăng lên 83 triệu |
| Kế toán | Dùng lại tham chiếu chi đã có: hiển thị lỗi ngay trong cửa sổ, không tạo lần chi thứ hai và không mất số đang nhập |
| Kế toán | Ghi nhận doanh thu 48 triệu: có đồng thời khoản phải thu 48 triệu, thực thu không tự tăng |
| Kế toán | Tải lại: các giao dịch đã lưu còn nguyên; xem tiến độ đơn hàng không có ô cập nhật |
| Sale | Tìm PO-2026-089, đặt 10.000 PCS, hàng về 9.000, giao 4.500: đúng 90% và 45%, có lịch sử |
| Sale | Nhập giao 11.000 trên đơn đặt 10.000: bị chặn, sửa tiếp mà không mất các ô còn lại |
| Sale | Không xuất hiện nút CEO duyệt chi hoặc nút kế toán ghi nhận chi |
| Bộ lọc | Tìm mã không tồn tại: hiển thị bảng rỗng có Xóa bộ lọc; xóa thì về dữ liệu phù hợp |
| Xuất Excel | Nút Xuất báo cáo phản hồi thành công; kiểm thử tự động đọc lại workbook, kiểm tra số và tiếng Việt |
| Màn hình nhỏ | Kiểm tra khung hiển thị 390 px và 768 px: sửa bộ lọc bị chật, không tràn ngang trang; bảng dài cuộn trong bảng |
| Cửa sổ điện thoại | Mở cảnh báo, đi đến phần cập nhật, ô nhập không tràn ngang và vẫn thấy nút lưu khi cuộn |
| Đăng nhập | Kiểm tra bố cục desktop/điện thoại; bản bàn giao mở màn hình đăng nhập bình thường |

Các giao dịch kiểm tra dùng vùng lưu riêng trong quá trình thử, không được thêm vào src/mock hay gói mã nguồn cuối. Bộ lưu trong bản bàn giao dùng đúng khóa gốc để giữ tương thích với dữ liệu người dùng đã lưu.

## Hướng dẫn nhanh theo vai trò

CEO: Tổng quan → bấm cảnh báo cần xử lý → xem hồ sơ; với đề nghị chi đang chờ, nhập ý kiến rồi chọn Duyệt đề nghị hoặc Yêu cầu bổ sung. Có thể vào Công nợ phải trả → Chờ CEO duyệt để duyệt lần lượt.

Sale: Tiến độ đơn hàng → tìm PO/mã hàng → Chi tiết → Cập nhật tiến độ → nhập số lũy kế, lịch, lý do → Lưu cập nhật. Muốn sửa sản xuất hoặc cảnh báo thủ công, mở nhóm tương ứng. Sale không tự hạ mức cảnh báo thủ công đã có.

Kế toán: Doanh thu → Ghi nhận doanh thu để tạo đồng thời hóa đơn và phải thu. Công nợ phải thu → Chi tiết → Thu tiền & phân bổ để chọn khoản thu, đối soát khách rồi phân bổ. Công nợ phải trả → lọc hồ sơ → lập đề nghị hoặc ghi nhận đã chi theo trạng thái; chỉ ghi khoản chi sau khi có chứng từ thực tế.

## Kiểm tra mã nguồn

Chạy npm run lint, npm test và npm run build. Bộ kiểm thử gồm 53 ca; có 5 nhóm mới về mở đúng hồ sơ, thao tác theo vai trò/trạng thái, nhập tiền VND và không cảnh báo sai khi đang giao một phần còn hạn. Các kiểm thử nghiệp vụ, dữ liệu và Excel kế thừa được giữ.

## Giới hạn hiện tại

Đây vẫn là frontend mock/localStorage, chưa phải backend dùng chung giữa nhiều máy. Các chức năng giao việc, bình luận, bàn giao, thông báo và tệp chưa có UI hoàn chỉnh; cần triển khai theo tài liệu BA đã bàn giao. Kiểm tra vai trò trong bản này không thay thế kiểm thử phân quyền ở backend. Nút ghi nhận chi lưu chứng từ, không chuyển tiền ngân hàng.
