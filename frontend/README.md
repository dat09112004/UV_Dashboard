# Uyen Vu International — Dashboard điều hành

## Tài khoản demo và phân quyền

| Vai trò | Email | Mật khẩu demo | Phạm vi |
| --- | --- | --- | --- |
| CEO | ceo@uyenvu.vn | 123 | Toàn bộ phân hệ, quản lý tài khoản và vai trò, giao và xác nhận công việc. Người lập đề nghị chi không được tự duyệt. |
| Admin | admin@uyenvu.vn | 123 | Tạo tài khoản Sale hoặc Kế toán, đổi giữa hai vai trò này, khóa hoặc mở lại tài khoản trong phạm vi quản lý. Giao việc cho Sale, Kế toán và duyệt kết quả của những việc do mình giao. |
| Sale | sale@uyenvu.vn | 123 | Xem dữ liệu nghiệp vụ, cập nhật tiến độ đơn và xử lý công việc của mình. |
| Kế toán | ketoan@uyenvu.vn | 123 | Xem dữ liệu nghiệp vụ, ghi nhận doanh thu, xử lý công nợ và công việc của mình. |

**Quản lý tài khoản** cho phép tạo hồ sơ bằng email và mật khẩu ban đầu từ 8 ký tự. Nút **Cấp quyền** thay đổi vai trò theo bộ quyền tương ứng hoặc khóa/mở tài khoản. Tài khoản CEO gốc được bảo vệ. Nếu tài khoản còn việc đang mở, CEO cần đổi người phụ trách trước khi khóa.

### Cấp quyền điều hướng theo tài khoản

Trong **Quản lý tài khoản → Cấp quyền**, chọn vai trò, trạng thái và các trang được phép truy cập. Danh sách quyền cá nhân áp dụng trong phạm vi vai trò, gồm cả điều hướng nội bộ và dữ liệu được phép xem trong Nhập liệu Excel. Tổng quan phụ thuộc bốn phân hệ tổng hợp. Bản xuất toàn bộ dashboard chỉ xuất hiện khi người dùng có quyền xem đủ bốn phân hệ. **Nhập liệu Excel** luôn xuất hiện với tài khoản đang hoạt động. Trang này chỉ mở các bảng mà tài khoản có quyền truy cập.

Sale mặc định có **Tiến độ đơn hàng**, **Doanh thu**, **Công việc của tôi** và **Nhập liệu Excel**. Quyền riêng đã lưu trên tài khoản vẫn được ưu tiên. Chọn một thành viên Sale hoặc Kế toán, điều chỉnh các trang rồi bấm **Áp dụng cho toàn bộ phòng ban**. Sau khi xác nhận, bộ quyền thay thế quyền điều hướng riêng của các thành viên hiện tại trong phòng và trở thành mặc định cho thành viên được tạo sau.

Biểu tượng khóa đỏ cạnh **Cấp quyền** mở popup xác nhận khóa hoặc mở khóa. Dòng tài khoản khóa được tô đỏ nhạt và có nhãn **Đã khóa**. Tài khoản bị khóa không thể đăng nhập, còn công việc đã giao được giữ để tiếp tục xử lý sau khi mở khóa. Thao tác cấp quyền phòng ban không thay đổi trạng thái khóa.

### Nhập liệu Excel

| Bảng | Có thể nhập | Nơi thấy dữ liệu đã lưu |
| --- | --- | --- |
| Đơn hàng và tiến độ | Tạo PO mới hoặc cập nhật tiến độ theo mã dòng hoặc mã PO/mã hàng | Tiến độ đơn hàng và cảnh báo |
| Doanh thu | Ghi nhận hóa đơn theo PO | Doanh thu và công nợ phải thu tương ứng |
| Công nợ phải thu | Xem, tìm, xuất | Phát sinh từ hóa đơn và thay đổi qua phân bổ thu |
| Công nợ phải trả | Ghi nhận chứng từ phải trả theo PO | Công nợ phải trả, bắt đầu ở trạng thái kiểm tra |
| Thu tiền, phân bổ thu, chi tiền | Ghi nhận giao dịch theo quyền và các điều kiện nghiệp vụ | Sổ giao dịch và số dư công nợ |
| Công việc | CEO/Admin giao việc qua email hoặc phòng ban. Nhân viên xem và xuất việc của mình | Giao việc và Công việc của tôi |

Chọn bảng, chuyển sang **Bản nháp nhập liệu** để thêm dòng, gõ từng ô hoặc dán vùng ô đã sao chép từ Excel. Nút **Sửa tiến độ** nạp dữ liệu dòng PO đang xem. Với tệp có sẵn, chọn **Tải Excel lên**, chọn trang tính rồi đưa vào bản nháp. Tải **Tệp mẫu** để lấy các cột được hỗ trợ nếu tiêu đề tệp khác mẫu. Hỗ trợ .xlsx tối đa 8 MB, 500 dòng mỗi lô. Tệp BM41 có trang **PO Released** và các ngày dạng Oct 17th. Điền năm 2026 cho ngày thiếu năm để nhập mẫu BM41. Với một tệp có nhiều bảng, xử lý từng trang tính theo bảng đích. Nếu lô có lỗi, sửa dòng được báo trước khi lưu lại. **Xuất Excel** xuất dữ liệu đang lọc hoặc bản nháp đang mở.

PO mới để trống **Mã dòng PO** để hệ thống tự cấp mã. Với PO có nhiều dòng, điền mã dòng để cập nhật chính xác. Để trống cột tiến độ cần giữ giá trị cũ. Giao dịch phân bổ cần mã lần phân bổ riêng, số chứng từ và tham chiếu khoản thu. Chi tiền vẫn kiểm tra hạn mức duyệt và số dư. Duyệt chi, tách hồ sơ và xử lý mật khẩu tiếp tục thực hiện tại màn hình nghiệp vụ tương ứng.

Bản demo lưu vào bộ nhớ trình duyệt trên localhost hoặc HTTPS. Dữ liệu đã lưu dùng chung với các trang nghiệp vụ. Bản nháp được giữ riêng theo tài khoản trong cùng thẻ trình duyệt khi chuyển trang hoặc tải lại. Dùng **Bỏ bản nháp** để xóa bản nháp của bảng hiện tại. Lớp lưu trữ tập trung ở `src/features/dataEntry/service.js`. Khi nối backend, thay hàm `saveEntryBatch` bằng yêu cầu gửi mã bảng và các dòng có số dòng nguồn. Backend xác định người dùng từ phiên đăng nhập, áp dụng quyền điều hướng và quyền thao tác, kiểm tra cả lô trong transaction và trả lỗi theo dòng. Dữ liệu trả về cập nhật các phân hệ theo phạm vi quyền. Hệ thống thật cần kiểm tra quyền trên máy chủ.

### Thử giao việc và bàn giao tệp

1. Đăng nhập CEO hoặc Admin, vào **Giao việc** và bấm nút **Giao việc** để mở popup. Chọn một nhân viên hoặc toàn bộ phòng Sale/Kế toán. Mỗi nhân viên đang hoạt động trong phòng nhận một bản việc riêng tại thời điểm giao. Có thể đính kèm tệp hướng dẫn hoặc bật bắt buộc nộp tệp kết quả.
2. Đăng nhập bằng tài khoản người nhận, vào **Công việc của tôi**, chọn **Tiếp nhận** rồi điền ô **Nộp kết quả hoàn thành**. Sau khi gửi, trạng thái chuyển sang **Chờ duyệt**.
3. Đăng nhập lại đúng tài khoản đã giao. Tại **Công việc đã giao**, mở chi tiết việc **Chờ duyệt** và chọn **Duyệt hoàn thành** hoặc **Không đạt yêu cầu**. Quyết định chỉ cập nhật trạng thái và lịch sử.
4. Nhân viên thấy trạng thái **Không đạt yêu cầu** màu đỏ, có thể chỉnh sửa và **Gửi duyệt lại** trước hạn. Sau mỗi lần nộp lại, việc chuyển sang **Chờ duyệt lại**. Người giao mở thẻ **Chờ duyệt lại** trong **Giao việc** để vào trang riêng có các bản đã nộp lại. Người giao có thể tiếp tục đánh dấu **Không đạt yêu cầu** cho tới khi đạt hoặc hết hạn.
5. **Hoàn tất** màu xanh lá và **Hết hạn** là hai trạng thái chỉ xem. Hạn được tính đến hết ngày đã chọn theo giờ Việt Nam, độc lập với ngày theo dõi trên dashboard. Kết quả đang chờ duyệt cũng khóa khi qua hạn.

CEO xem toàn bộ việc. Admin xem và xử lý việc do mình giao. Người giao duyệt kết quả hoặc đổi phân công. Nhân viên thấy bản việc và kết quả của mình. Người giao và người nhận có thể bình luận khi việc còn mở. Mỗi dòng hiển thị nội dung tóm tắt, người phụ trách hoặc người giao, hạn và trạng thái. Bấm vào dòng để mở kết quả, tệp và các thao tác theo quyền.

### Giao việc từ báo động đỏ

Tại **Tổng quan**, đăng nhập CEO và chọn **Giao việc** trên một báo động đỏ. Biểu mẫu điền sẵn mã hồ sơ trong tiêu đề và nội dung gợi ý. Chọn người phụ trách hoặc phòng ban, đặt hạn và xác nhận. Việc lưu nguồn cảnh báo để đối chiếu trên danh sách và ở chi tiết.

Sale thấy mục **Nhắc việc từ báo động đỏ** cho cảnh báo đơn hàng trên **Tổng quan**. Kế toán thấy cảnh báo phải thu và phải trả. Tại **Công việc của tôi**, mục nhắc việc lọc riêng các nhiệm vụ đang mở được giao từ báo động đỏ.

### Công việc có sẵn để kiểm thử

| Trạng thái | CEO giao cho Sale | Admin giao cho Kế toán |
| --- | --- | --- |
| Mới giao | Đối chiếu tiến độ UV-Intl-3500003 | Đối chiếu công nợ BM41 |
| Đang thực hiện | Kiểm tra đóng gói PO UV-Intl-3500004, có tệp hướng dẫn và bắt buộc nộp tệp | Đối chiếu số dư DEMO-INV-A2 |
| Chờ duyệt | Xác nhận lịch giao PO UV-Intl-3500006, có tệp kết quả | Đối soát khoản thu DEMO-THU-A, có tệp kết quả |
| Chờ duyệt lại | Duyệt lại xác nhận giao PO UV-Intl-3500003 | Duyệt lại số dư DEMO-BILL-02 |
| Không đạt yêu cầu | Bổ sung đối chiếu PO UV-Intl-3500003, có tệp kết quả đã nộp | Bổ sung chứng từ DEMO-BILL-04 |
| Hoàn tất | Xác nhận giao đủ PO UV-Intl-3500002 | Kiểm tra khoản chi DEMO-BILL-02 |
| Hết hạn | — | Rà soát khoản thu chưa phân bổ, hạn 05/11/2026 |

Dữ liệu nằm trong `src/mock/tasks.js`. Khi mở bản mới, các việc mẫu còn thiếu được bổ sung theo ID và giữ kết quả đã lưu của những việc đã có.

Bản frontend demo lưu tài khoản, việc và tệp trên cùng trình duyệt. Hỗ trợ PDF, DOCX, XLSX, PPTX, PNG, JPEG, CSV, TXT với tối đa 3 tệp và tổng 1 MB mỗi lần gửi. Để chạy thử giữa các vai trò, đăng xuất và đăng nhập lại trong cùng trình duyệt. Khi dùng dữ liệu thật hoặc làm việc giữa nhiều thiết bị, backend cần xác thực quyền xem, sửa và tải tệp, đồng thời kiểm tra hạn theo đồng hồ máy chủ.

## Dữ liệu thử nghiệm BM41

Bản này giữ nguyên 5 dòng trong sheet `PO Released`. Cột SAP dùng làm mã tham chiếu PO, `210101080` là mã nhóm hàng, cột Req. dùng làm hạn nhận hàng. Ngày theo dõi mặc định 06/11/2026. Ngày trong file nguồn chỉ có ngày và tháng, nên bản mẫu dùng năm 2026 theo ngày sửa tệp. Tổng đặt mua theo BM41 là 50.000 pcs và 83.000.000 VND.

Tiến độ, giao khách, chứng từ và giao dịch tài chính là dữ liệu mô phỏng. PO `DEMO-PO-TACH` là dòng bổ sung để thử tách chứng từ cho hai nhà cung cấp. Dữ liệu BM41 nguồn nằm ở `src/mock/bm41.js`. Kịch bản mô phỏng nằm ở `src/mock/bm41Scenarios.js` và dùng vùng lưu riêng trên trình duyệt.

### Đối chiếu theo đơn đặt hàng

| Mã PO | Đặt / Nhập / Giao (pcs) | Sản xuất / Đóng gói | Chứng từ để đối chiếu |
| --- | --- | --- | --- |
| UV-Intl-3500002 | 10.000 / 10.000 / 10.000 | 100% / 100% | DEMO-INV-A1 đã thu đủ, DEMO-INV-A2 còn 9 triệu. DEMO-BILL-02 đã duyệt và đã chi 6 triệu, còn 10 triệu. |
| UV-Intl-3500003 | 10.000 / 8.000 / 6.000 | 100% / 80% | DEMO-INV-B1 quá hạn, còn 10 triệu. DEMO-BILL-03 đến hạn, chờ CEO duyệt 12,8 triệu. |
| UV-Intl-3500004 | 10.000 / 0 / 0 | 65% / 40% | DEMO-BILL-04 là đề nghị tạm ứng 3,2 triệu cần bổ sung. |
| UV-Intl-3500005 | 10.000 / 0 / Chưa xác nhận | 20% / 0% | DEMO-BILL-05 là hồ sơ tạm ứng 3,2 triệu chưa xác định hạn thanh toán. |
| UV-Intl-3500006 | 10.000 / 10.000 / 4.000 | 100% / 100% | DEMO-INV-C1 đến hạn, còn 9 triệu. PO này nằm trong DEMO-BILL-GROUP. |
| DEMO-PO-TACH | 2.000 / 0 / Chưa xác nhận | 30% / 0% | PO mô phỏng thứ hai trong DEMO-BILL-GROUP. |

### Các bước thử theo vai trò

1. **Sale** → **Tiến độ đơn hàng** → mở UV-Intl-3500003, thử cập nhật số nhập từ 8.000 lên 9.000. Đối chiếu tiến độ nhập từ 80% lên 90% và kiểm tra lịch sử cập nhật.
2. **Kế toán** → **Doanh thu** → đối chiếu 4 hóa đơn, doanh thu 52 triệu và thực thu đã phân bổ 24 triệu. Có thể dùng **Ghi nhận doanh thu** để thử thêm hóa đơn mới.
3. **Kế toán** → **Phải thu** → đối soát DEMO-THU-UNKNOWN (4 triệu) cho Demo Retail B rồi phân bổ vào DEMO-INV-B1. Dư hóa đơn giảm từ 10 xuống 6 triệu. DEMO-THU-A còn 2 triệu chưa phân bổ.
4. **CEO** → **Phải trả** → xem và duyệt DEMO-BILL-03. **Kế toán** đăng nhập lại, ghi chi thử 1 triệu cho chứng từ này và đối chiếu số dư còn 11,8 triệu.
5. **Kế toán** → lọc **Cần tách chứng từ** → mở DEMO-BILL-GROUP. Nhập 19 triệu cho nhà cung cấp 15090 và 4 triệu cho DEMO-NCC-02, mỗi bên dùng một số chứng từ mới và hạn 12/11/2026. Hai chứng từ riêng chờ trình duyệt, tổng dư nợ giữ nguyên.
6. **Xuất báo cáo** → xem các sheet theo dõi đơn, nhật ký tiến độ, doanh thu, phải thu, phải trả, tiền thu, phân bổ, chi tiền và nhật ký tài chính.

Số dư mở đầu trước khi chạy thử là 28 triệu phải thu và 52,2 triệu phải trả. Ngày 06/11/2026 có 19 triệu phải thu và 22,8 triệu phải trả đã đến hoặc qua hạn. Các ví dụ số liệu ở mục bên dưới mô tả bộ mẫu trước đó.

## Rà soát nghiệp vụ trước khi triển khai backend

- Lưu tiến độ kiểm phiên bản theo dòng PO, đồng thời khóa vùng ghi trên cùng trình duyệt để tránh ghi đè giữa các tab. Nếu báo xung đột, giữ bản đang nhập để người dùng đối chiếu trước khi tải lại. Các thao tác lưu tiến độ và tài chính yêu cầu HTTPS hoặc localhost và trình duyệt hỗ trợ Web Locks.
- Đối soát tiền thu qua danh sách khách hàng từ chứng từ đã có. Khoản thu mới có thể ghi nhận với khách hàng chưa xác định. Khoản chưa phân bổ có thể sửa đối soát, có lý do và lịch sử.
- Chứng từ gộp được đưa vào nhóm **Cần tách chứng từ**. Kế toán nhập chứng từ riêng và số tiền đã đối soát cho từng nhà cung cấp. Tổng tiền gốc, điều chỉnh và đã trả phải khớp chứng từ nguồn. Bản gộp được lưu lịch sử, không tính trùng công nợ. Chứng từ riêng cần trình duyệt lại, kể cả khi bản gộp đã từng được duyệt.
- Tạo chứng từ doanh thu sinh đồng thời khoản phải thu đúng dòng PO; số tiền VND nguyên, hạn và căn cứ ghi nhận được kiểm tra. Ngày ghi nhận là ngày thực, không lấy ngày theo dõi mô phỏng.
- Khoản thu mở đầu 25 triệu được giữ nguyên nhưng chưa xác định khách hàng. Kế toán phải đối soát khách, ngày nhận và tham chiếu trước; phân bổ chỉ cho hóa đơn cùng khách, cùng tiền tệ. Có thể ghi nhận khoản thu mới từ chứng từ thực tế.
- AP có các bước kiểm tra, trình, CEO duyệt hoặc trả lại, rồi Kế toán ghi nhận số thực chi. Không còn tự chi 25 triệu. Số chi bị giới hạn theo dư nợ và hạn mức duyệt còn lại; ngày chi không trước ngày duyệt đề nghị mới. Ngày phân bổ tiền thu không trước ngày nhận và ngày ghi nhận hóa đơn. Hạn đề nghị chỉ thành hạn chính thức sau khi CEO chấp nhận.
- Chứng từ gộp nhiều nhà cung cấp bị chặn ghi nhận chi trước khi tách và đối soát; frontend không tự chia số tiền nguồn.
- Tài chính được lưu cùng giao dịch và lịch sử vào `uv-finance-workflow-v1`. Thất bại lưu thì không báo thành công. Có kiểm revision để phát hiện dữ liệu cũ ở cửa sổ khác; BE vẫn cần transaction và khóa dòng thực sự.
- Cập nhật tiến độ có lý do, ngày xuất thực tế và lịch sử. Cảnh báo thủ công tách khỏi kết quả tự tính; Sale được nâng, chỉ CEO được hạ mức thủ công. Số bán nguồn chỉ đọc.
- Tóm tắt tiền trong chi tiết PO lấy từ chứng từ liên quan; số gộp không tự phân bổ về mã hàng. Lọc xuất xứ ưu tiên liên kết PO, không lấy nhầm PO chỉ vì trùng NCC. Bộ lọc trạng thái AR/AP được tách theo trang.
- Giữ nguyên dữ liệu nguồn, logo, tài khoản và gói phụ thuộc. Giao việc, bình luận, bàn giao và nhắc hạn có trong bản demo. Cần API và lưu trữ máy chủ để dùng đồng thời trên nhiều thiết bị.

Tài liệu Word đi kèm mô tả hiện trạng, hướng dẫn thao tác, quyền, API mục tiêu, mô hình dữ liệu, transaction, đối soát dữ liệu và UAT. `src/services/endpoints.js` vẫn là danh mục route khung kế thừa; khi nối BE, ánh xạ adapter sang các route được thống nhất trong tài liệu, không coi các route khung là API đã triển khai.

Nếu bản lưu tài chính lỗi, hệ thống mở số liệu gốc và chặn ghi tiếp để tránh ghi đè bản lỗi. Sao lưu giá trị khóa dữ liệu rồi đối chiếu trước khi xóa riêng khóa để về nguồn; không xóa toàn bộ bộ nhớ trình duyệt. Tiến độ vẫn dùng `uv-order-tracking-v1` như phần dưới.

## Cập nhật màu giao diện

Đồng bộ trên CEO, Sale và Kế toán: nền thẻ/bảng trắng, chữ đen xanh, thao tác xanh dương #1558C9; header đen #030407; mục điều hướng đang chọn và điểm nhấn lime #D4FF24. Cột sản xuất xanh dương, đóng gói lime có vân sọc. Không tô cả ngành hàng theo cảnh báo nặng nhất của một mã hàng. Cảnh báo hiển thị riêng bằng nhãn, số đếm hoặc vạch màu nhỏ tại hồ sơ liên quan.

Đỏ chỉ dùng cho cảnh báo thực tế, phần tiền đã quá hạn và số dư của hồ sơ đang báo động. Cần theo dõi dùng đỏ trầm/pale red, phân biệt bằng nhãn và mức ưu tiên; tổng tiền, khoản chưa đến hạn, nút mở chi tiết và số đếm bằng 0 dùng màu thông thường. Giữ nguyên cách phân loại nghiệp vụ, số liệu và ưu tiên theo vai trò.

## Cập nhật: cửa sổ căn giữa và theo dõi nhập / giao hàng

Cửa sổ chi tiết được căn giữa, bo góc 20 px, rộng 2/3 viewport trên desktop, cao tối đa 84% viewport và cuộn trong phần nội dung. Trên tablet/điện thoại, cửa sổ mở rộng theo chiều rộng thiết bị với khoảng đệm hai bên. Có nút toàn màn hình/thu gọn; đóng rồi mở lại sẽ về kích thước mặc định. Escape và điều hướng Tab được giữ.

Trong Tổng quan, bảng “Đặt hàng · Nhập kho · Giao khách” cho biết từng PO/mã hàng:

- Ngày phát hành PO, số lượng đặt và đơn vị tính.
- Số đã về kho, tỷ lệ đã về và số còn chờ về.
- Số giao khách đã xác nhận, tỷ lệ đã giao và số còn phải giao.
- Ngày dự kiến về kho, ngày xuất dự kiến ETD, ngày giao dự kiến ETA và ngày giao xác nhận gần nhất.
- Trạng thái hàng về/giao một phần, đủ hàng, giao đủ, thiếu xác nhận và quá hạn.

Trong menu Tiến độ đơn hàng có hai chế độ: “Nhập & giao hàng” và “Sản xuất & đóng gói”. Bảng sản xuất gốc vẫn được giữ. Bảng mới có bộ lọc theo hàng đã về, về một phần/đủ, chưa về, giao một phần/đủ, chưa xác nhận, trễ và thiếu dữ liệu. Xuất Excel có thêm sheet `Nhap_giao_hang`.

**Dữ liệu gốc chưa có số lượng đặt, đơn vị tính của từng dòng, số giao khách được xác nhận hoặc ngày hàng về kho dự kiến.** Các trường này ban đầu để trống; tỷ lệ chưa tính được hiển thị “—”. Giữ nguyên số nhập kho `nhap` đã có (2 dòng có hàng về); không tự dùng số bán `ban` hoặc số xuất kho `xuat` làm bằng chứng đã giao khách. Không suy ra số lượng đặt từ doanh thu hoặc đơn giá.

CEO và Sale mở chi tiết để bổ sung số liệu; Kế toán chỉ xem tiến độ. Số lượng nhập là **lũy kế cho từng dòng PO**, không phải số tăng thêm của một đợt:

```text
% đã về = số đã về kho / số lượng đặt × 100
% đã giao = số đã giao khách xác nhận / số lượng đặt × 100
```

Ví dụ kiểm thử độc lập: đặt 10.000, về 9.000, giao 4.500 tương ứng 90% và 45%. Các số ví dụ chỉ có trong kiểm thử, không được điền vào dữ liệu nghiệp vụ gốc của gói bàn giao.

Không cho số âm/không hữu hạn, số về hoặc giao vượt số đặt, số giao vượt tồn đầu + hàng đã về. Số đặt phải dương khi được bổ sung và cần có đơn vị tính. Có kiểm tra ngày giao xác nhận, thứ tự ngày về kho dự kiến/ETA. Đã giao đủ mà thiếu ngày xác nhận vẫn hiện cảnh báo cần bổ sung ngày. Số tổng hợp trên dashboard là **số mã hàng**, không cộng chung số lượng của những đơn vị tính khác nhau.

Các cập nhật tiến độ và nhập/giao được lưu ở localStorage với khóa `uv-order-tracking-v1`, đọc lại sau khi tải trang, dùng chung cho các tài khoản trên cùng trình duyệt và cùng địa chỉ ứng dụng. Chỉ lưu các trường tiến độ được cho phép, không ghi đè doanh thu/công nợ/định danh tài khoản từ dữ liệu lưu. Nếu cần quay về nguồn ban đầu, xóa riêng khóa này trong Developer Tools > Application > Local Storage rồi tải lại. Đây vẫn là lưu trên máy hiện tại, chưa phải dữ liệu dùng chung trên máy chủ.

Tệp bổ sung:

```text
src/mock/orderTracking.js
src/utils/orderFulfillment.js
src/components/orders/FulfillmentTable.jsx
src/components/orders/ItemDetailPanel.jsx
src/styles/order-fulfillment.css
```

Số nhập/giao mới không tự sinh bút toán doanh thu, thu tiền hoặc công nợ. Các cờ đỏ nguồn được giữ; thông tin theo dõi mới có số đặt/ngày về kho sẽ bổ sung cảnh báo trễ nhập/giao tương ứng. Ngày theo dõi dùng để tính trạng thái, không tái dựng lịch sử giao dịch theo ngày.

## Cập nhật giao diện và ưu tiên theo vai trò

Logo PNG nguồn được giữ nguyên độ phân giải và nền trong suốt, hiển thị lớn hơn trên nền đen để làm rõ màu vàng. Trang đăng nhập dùng nền đen/xanh dương có lớp hình học và điểm nhấn lime; form sáng có tương phản cao. Không thay đổi hình dáng hay nội dung logo.

Các vai trò dùng cùng header, menu, hệ thống màu và thành phần giao diện. Thứ tự, kích thước khối và nhóm cảnh báo mặc định thay đổi theo công việc:

| Vai trò | Khối lớn ưu tiên | Các khối nhỏ hơn |
| --- | --- | --- |
| CEO | Cảnh báo toàn công ty; doanh thu và thực thu | Tiến độ ngành hàng; cơ cấu phải thu/phải trả; bảng mã hàng |
| Sale | Tiến độ sản xuất/đóng gói; cảnh báo giao hàng; bảng mã hàng ngay sau khối ưu tiên | Doanh thu, phải thu và phải trả |
| Kế toán | Thu & chi đến hạn; cảnh báo tài chính | Cơ cấu công nợ, doanh thu, tiến độ và bảng mã hàng thu gọn |

Thanh cảnh báo phía trên chỉ ngay hồ sơ cần xử lý trước, gồm mã và đối tác/mặt hàng. Mỗi thẻ công việc có mã PO/chứng từ, tên mặt hàng/đối tác, vấn đề, hạn ETD/ETA hoặc hạn thanh toán, số tiền/tiến độ, việc cần làm và nút mở đúng hồ sơ. Lọc được nhóm công việc và mức đỏ/vàng. Tổng đỏ vẫn giữ nguyên 16; hiển thị 8 việc cần theo dõi từ dữ liệu hiện có, không thêm giao dịch hay thay đổi số dư.

Màu đỏ đi kèm biểu tượng và nhãn báo động; đỏ trầm dùng cho cần theo dõi; xanh dương/lime cho trạng thái theo kế hoạch/đã thu trong ngữ cảnh tương ứng. Cột sản xuất luôn xanh dương, cột đóng gói lime có vân sọc, kèm nhãn phần trăm và chú giải. Số mã hàng báo động hiển thị riêng, không đổi màu cột tiến độ. Không suy ra trễ giao hàng chỉ từ tỷ lệ hoàn thành thấp.

Biểu đồ doanh thu ngành hàng dùng cột chồng: thực thu, còn phải thu đến hạn/quá hạn, chưa đến hạn và chưa phân loại. Phần chưa thu chỉ đối chiếu hóa đơn cùng số chứng từ, không gộp nhầm toàn bộ số dư khác vào biểu đồ. Nhãn thu–chi trên từng đoạn cột là giá trị riêng của đoạn, không phải giá trị cộng dồn. Các biểu đồ ghi rõ đơn vị và có nhãn số liệu; số tiền chính vẫn hiển thị bằng VND đầy đủ.

Hiệu ứng cảnh báo vào trang chỉ chạy hai nhịp, không nhấp nháy liên tục; tắt khi thiết bị bật giảm chuyển động. Trên màn hình nhỏ, cảnh báo được đưa lên trước các biểu đồ để dễ tiếp cận.

## Cài đặt và chạy

Yêu cầu Node.js 20.19+ hoặc 22.12+. Mở terminal trong thư mục `frontend` chứa `package.json`:

```bash
npm ci
npm run dev
```

Mở http://127.0.0.1:3000. Mặc định ứng dụng chỉ chạy localhost. Gói giữ lockfile và ExcelJS 4.4.0; không chứa `node_modules` hoặc `dist`.

## Dữ liệu tài khoản riêng

File `src/mock/accounts.js` là nguồn tài khoản dùng bởi màn hình đăng nhập. Mỗi hồ sơ có ID, mã nhân viên mẫu, email, username, mật khẩu mẫu, tên, chức danh, phòng ban, vai trò, nhãn vai trò, trạng thái, ảnh đại diện, chữ viết tắt, ngôn ngữ, múi giờ, phạm vi dữ liệu và danh sách quyền. Email/mật khẩu/tên/vai trò giữ nguyên từ bản được cung cấp; ID, mã nhân viên và thông tin cấu hình bổ sung là dữ liệu mẫu.

| Vai trò | Email | Mật khẩu mẫu |
| --- | --- | --- |
| CEO | ceo@uyenvu.vn | 123 |
| Sale | sale@uyenvu.vn | 123 |
| Kế toán | ketoan@uyenvu.vn | 123 |

Ứng dụng mở ở màn hình đăng nhập; đổi tài khoản bằng đăng xuất rồi đăng nhập lại. Không có nút đổi vai trò hoặc đăng nhập nhanh. Chỉ ghi nhớ email, không lưu mật khẩu. Quên mật khẩu hiện hướng dẫn liên hệ quản trị viên, chưa gửi email.

## Thiết kế dashboard

Menu nằm giữa header, dùng nền chọn trượt trong 340 ms và hỗ trợ thiết lập giảm chuyển động. Khi thiếu chiều rộng, menu cuộn ngang; các bảng cuộn trong vùng riêng.

Logo PNG gốc đã có alpha trong suốt. Đã bỏ nền, viền và khoảng đệm ô trắng bằng CSS, tăng kích thước logo trên header và trang đăng nhập, giữ nguyên ảnh gốc.

Trang Tổng quan không ghép bốn phân hệ thành bốn khối dài nối tiếp. Bố cục gồm:

- Thẻ doanh thu, mã hàng cần xử lý, phải thu đến hạn và phải trả đến hạn, bấm để mở trang tương ứng.
- Biểu đồ cột doanh thu theo ngành hàng, tách thực thu và số dư cần thu; có thể chuyển sang tháng ghi nhận của chứng từ.
- Danh sách ưu tiên xử lý với bộ lọc giao hàng, phải thu và phải trả; bấm để mở đúng đơn hàng/chứng từ.
- Biểu đồ tiến độ sản xuất và đóng gói của Garment, Recycle Bag, Volkswagen Ipin Touch Cable.
- Hai biểu đồ cơ cấu công nợ, tách quá hạn, hôm nay, chưa đến hạn và chưa có hạn.
- Năm mã hàng ưu tiên với Released PO, On Process, Packaging, Shipdate ETD/ETA. Trang Tiến độ đơn hàng giữ bảng đầy đủ 20 dòng.

Tên chức năng không đánh số 1–2–3–4. Bộ lọc ngành hàng, xuất xứ, tìm kiếm và báo động đỏ dùng chung dữ liệu cho các chỉ số, biểu đồ và bảng. Bộ lọc xuất xứ của chứng từ dựa trên PO/NCC liên quan; chứng từ gộp vẫn giữ nguyên toàn bộ giá trị, không tự phân chia tiền theo xuất xứ.

## Giữ dữ liệu và tính cảnh báo

`src/mock/dashboard.js` giữ nguyên 20 dòng mã hàng, 6 chứng từ doanh thu, 5 khoản phải thu, 5 khoản phải trả và chuỗi tổng hợp theo tháng có trong bản gốc. Không đổi giá trị, tên, ngày hoặc ngành hàng của nguồn. Các trường cảnh báo được tính riêng trong `src/utils/dashboardMetrics.js`.

Ngày dữ liệu gốc là 05/11/2026. Ngày theo dõi mặc định cùng ngày; có thể chọn ngày sau để xem trạng thái đến hạn từ số dư hiện tại. Việc đổi ngày không dựng lại sổ kế toán quá khứ và không dự đoán giao dịch tương lai.

Cảnh báo đỏ gồm quá hạn công nợ, công nợ đến hạn hôm nay còn số dư, ETD đã qua/hôm nay khi sản xuất hoặc đóng gói chưa xong, thiếu lịch ETD/ETA và các cờ đỏ gốc. Quá ETA chỉ được suy ra khi có ngày xuất thực tế mà chưa có ngày đến thực tế. Đóng gói xong không bị tự coi là đã giao hàng. Giữ các cờ đỏ nguồn; không tự hạ mức cảnh báo khi không đủ thông tin.

Danh sách ưu tiên và bảng tiến độ xếp đỏ trước, rồi quá hạn, đến hạn hôm nay, thiếu lịch/hạn, các cờ đỏ còn lại. Khoản đã tất toán không tiếp tục báo động. Công nợ chưa có hạn được cảnh báo riêng nhưng không cộng vào số tiền đã đến hạn.

Tại ngày 05/11/2026, trước khi lọc hoặc thao tác:

| Chỉ số | Giá trị |
| --- | ---: |
| Doanh thu ghi nhận của 6 chứng từ | 986.350.000 VND |
| Tiền thực thu trên các chứng từ | 596.350.000 VND |
| Mã hàng báo động đỏ | 7 / 20 |
| Phải thu đến hạn, gồm hôm nay và quá hạn | 265.000.000 VND |
| Tổng dư nợ phải thu | 390.000.000 VND |
| Phải trả đến hạn, gồm hôm nay và quá hạn | 458.000.000 VND |
| Phải trả chưa có hạn, theo dõi riêng | 210.000.000 VND |
| Tổng dư nợ phải trả | 668.000.000 VND |
| Tổng cảnh báo đỏ từ đơn hàng và công nợ | 16 |

Biểu đồ doanh thu theo tháng được tính từ ngày ghi nhận thực tế của 6 chứng từ: tháng 10 là 102 triệu, tháng 11 là 884,35 triệu. Chuỗi tổng hợp theo tháng cũ vẫn được lưu nguyên trong mock để đối chiếu; không trộn chuỗi tổng hợp này với danh sách chứng từ chi tiết do hai nguồn có phạm vi khác nhau.

## Cấu trúc chính

```text
src/
  mock/
    accounts.js
    dashboard.js
  features/auth/services/mockAuth.js
  components/layout/AppHeader.jsx
  components/dashboard/DashboardOverview.jsx
  components/dashboard/DashboardCharts.jsx
  utils/dashboardMetrics.js
  utils/dashboardPresentation.js
  styles/dashboard-priority.css
  App.jsx
```

Màn hình và dữ liệu dùng chung cho các vai trò đang có trong bản được cung cấp. CEO/Sale cập nhật tiến độ; Kế toán xem tiến độ và thực hiện các thao tác kế toán. Quyền giao việc trong dữ liệu mẫu chỉ có ở CEO; không bổ sung một phân hệ giao việc mới trong lần thay đổi dashboard này.

## Kiểm tra

```bash
npm run lint
npm test
npm run build
```

Kiểm thử gồm dữ liệu tài khoản, bảo toàn số liệu, cảnh báo đến hạn/ETD/ETA, ưu tiên hôm nay trước cờ đỏ tương lai, số dư tất toán, đối chiếu công nợ, lọc ngành hàng/xuất xứ, số liệu biểu đồ theo ngày ghi nhận và xuất file XLSX. Những kiểm thử nghiệp vụ kế thừa vẫn được giữ.

## Phạm vi hiện tại

Đây là frontend dùng dữ liệu và tài khoản mẫu. Tiến độ, tài chính và lịch sử được lưu trên trình duyệt như mô tả ở trên, chưa chia sẻ giữa máy hoặc đồng bộ lên máy chủ. Ghi nhận khoản đã chi chỉ lưu chứng từ, không thực hiện chuyển tiền ngân hàng. Cần backend trước khi triển khai thật để xác thực, phân quyền phía máy chủ, lưu dữ liệu chung và đối chiếu chứng từ. Các thư mục khung kế thừa trong `features`, `store`, `routes` chưa tự trở thành API hoàn chỉnh.


## Bản cập nhật trải nghiệm sử dụng 05/11/2026

Đọc `THAY_DOI_GIAO_DIEN_VA_KIEM_THU.md` để xem các tình huống đã thử theo vai trò và hướng dẫn nhanh.

Cảnh báo mở trực tiếp đúng đơn hàng/chứng từ; riêng CEO có thể mở ngay đề nghị chờ duyệt. Không điền mã chứng từ vào tìm kiếm toàn hệ thống khi mở cảnh báo. Công nợ có cửa sổ chi tiết và thao tác phù hợp vai trò, bảng giữ cột thao tác khi cuộn ngang. Các nhóm hồ sơ chi có bộ lọc Chờ CEO duyệt / Đã duyệt chi / Cần lập đề nghị / Cần bổ sung.

Biểu mẫu nhập tiền chấp nhận `25000000`, `25.000.000`, `25,000,000`, giữ số nguyên VND cho nghiệp vụ. Không chuyển số âm, số thập phân hay biểu thức mũ thành số tiền khác. Lỗi lưu hiển thị ngay trong cửa sổ và giữ nội dung đang nhập. Đóng cửa sổ có dữ liệu chưa lưu sẽ hỏi giữ/bỏ thay đổi; tải lại trang khi còn dữ liệu chưa lưu dùng cảnh báo của trình duyệt.

Biểu mẫu tiến độ chia nhóm số lượng, lịch giao và sản xuất; lý do cập nhật luôn hiển thị. Có nút đi thẳng đến phần Cập nhật tiến độ. Kế toán xem thông tin đơn hàng ở chế độ chỉ đọc, không hiển thị hàng loạt ô nhập bị khóa.

Bảng màu nằm ở `src/styles/executive-theme.css`; màu chuỗi biểu đồ ở `src/utils/dashboardPresentation.js`. Các token warning tách riêng khỏi màu thương hiệu. Nền đọc số liệu vẫn sáng, logo PNG và toàn bộ dữ liệu mở đầu giữ nguyên.

Đang nhập/giao một phần nhưng còn hạn là tiến độ thông thường. Tỷ lệ dưới 100% không tự làm đổi màu sang cảnh báo; mốc sắp đến hạn, quá hạn hoặc thiếu xác nhận mới quyết định mức theo dõi.

## Ngôn ngữ Việt – Anh

Chọn **VI** hoặc **EN** ở màn hình đăng nhập hoặc trên thanh đầu trang. Ứng dụng ghi nhớ lựa chọn trên trình duyệt. Báo cáo Excel dùng ngôn ngữ đang chọn khi bấm xuất. Tên đối tác mẫu có nhãn tiếng Anh tại `src/locales/partnerNames.js`. Mã đối tác và tên gốc dùng cho đối soát được giữ nguyên. Với tên đối tác mới, bổ sung tên tiếng Anh được xác nhận vào bảng này. Mã PO, mã chứng từ và các đơn vị nghiệp vụ giữ theo dữ liệu nguồn.

Bản dịch nằm ở `src/locales/messages.js`. Khi bổ sung nhãn giao diện hoặc thông báo, giữ nguyên mã nghiệp vụ và dịch chuỗi ở nơi hiển thị. Dùng `phrase` cho câu có số liệu hoặc tham số. Dùng `npm test` để kiểm tra hồi quy định dạng và xuất Excel.
