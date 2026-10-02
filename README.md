# HỆ THỐNG GHI DANH VÀ QUẢN LÝ LỚP HỌC - TRUNG TÂM BDVH 144

Hệ thống web hoàn chỉnh, có backend Node.js (Express), cơ sở dữ liệu bền vững, xuất file Excel chuyên nghiệp hai sheet (`exceljs`), lập lịch tự động server-side (`node-cron`), mã hóa xác thực bảo mật không dùng mật khẩu / tài khoản, nhận diện học sinh tự động không cần đăng nhập.

* Kho lưu trữ GitHub: **https://github.com/vatliphysics-boop/bdvh144-manager**
* Đường dẫn 1-Click Deploy Render: **https://render.com/deploy?repo=https://github.com/vatliphysics-boop/bdvh144-manager**

---

## 1. THÔNG TIN HỆ THỐNG & LỊCH HỌC
* **Trung tâm**: Trung tâm BDVH 144
* **Giáo viên**: thầy Nguyễn Khoa
* **Trợ giảng**: Võ Đoàn Đăng Khôi
* **Lớp 10**: thứ Bảy, **07:30 – 09:30**
* **Lớp 11**: thứ Bảy, **17:30 – 19:00**
* **Buổi học đầu tiên**: **03/10/2026** (các tuần tiếp theo giữ nguyên khung giờ này)
* **Múi giờ**: `Asia/Ho_Chi_Minh` (UTC+7)
* **Google Maps**: [https://maps.app.goo.gl/RsTMMvJtbgwDP5fQ7](https://maps.app.goo.gl/RsTMMvJtbgwDP5fQ7)

---

## 2. BA MÃ TRUY CẬP QUẢN LÝ (KHÔNG DÙNG TÀI KHOẢN)
1. **Võ Đoàn Đăng Khôi (Mã chính)**: `KHOI-BDVH-8629`
   * Toàn quyền quản trị viên: Quản lý buổi học, điểm danh giáo viên, điểm danh học sinh, chấm công vào/ra của bản thân, tạo & chấm test cuối giờ, chốt ghi danh sớm & tải file Excel.
2. **Võ Đoàn Đăng Khôi (Mã dự phòng)**: `KHOI-BACKUP-4319`
   * Quyền quản trị viên tương đương mã chính.
3. **Thầy Nguyễn Khoa (Xem báo cáo)**: `THAYKHOA-BC-5283`
   * Quyền riêng của thầy: Xem báo cáo chấm công giảng dạy của trợ giảng Võ Đoàn Đăng Khôi, lọc theo khoảng ngày, xem tổng số buổi & tổng thời gian thực tế. Quyền chỉ đọc (read-only), không sửa dữ liệu và không tải danh sách ghi danh.

---

## 3. HƯỚNG DẪN TRIỂN KHAI ONLINE 24/7 (HOẠT ĐỘNG KHI TẮT MACBOOK)

Để website hoạt động trên đám mây, học sinh mở link HTTPS bằng điện thoại 4G/5G bất kỳ lúc nào mà không cần bật MacBook:

### Cách 1: Triển khai 1-Click lên Render (Miễn phí 100%, Máy chủ Singapore)
1. Bấm vào liên kết tạo dịch vụ tự động:
   👉 **[Deploy to Render](https://render.com/deploy?repo=https://github.com/vatliphysics-boop/bdvh144-manager)**
2. Đăng nhập bằng tài khoản GitHub `vatliphysics-boop` của bạn.
3. Render sẽ tự động đọc tệp `render.yaml` đã cấu hình sẵn (Node.js, máy chủ Singapore gần TP.HCM nhất với ping cực thấp). Bấm nút **"Apply"** hoặc **"Create Web Service"**.
4. Sau 1 phút, bạn sẽ có link HTTPS công khai:
   👉 `https://bdvh144-manager.onrender.com`

### Giữ máy chủ luôn hoạt động 24/7 và Cơ sở dữ liệu Cloud:
* **Chống ngủ (Keep-alive)**: Để tiến trình cron tự động xuất Excel đúng 07:00 thứ Bảy hoạt động liên tục trên gói miễn phí của Render, bạn chỉ cần vào **[cron-job.org](https://cron-job.org)** (miễn phí), tạo một tác vụ ping đến:
  `https://bdvh144-manager.onrender.com/api/student/current-session` mỗi 10 phút một lần.
* **Cơ sở dữ liệu đám mây dùng chung**: Nếu muốn dữ liệu không bao giờ bị ảnh hưởng khi khởi động lại máy chủ, bạn tạo 1 cơ sở dữ liệu PostgreSQL miễn phí tại **[neon.tech](https://neon.tech)** (1 click bằng GitHub, không cần thẻ), sau đó dán chuỗi kết nối vào biến môi trường `DATABASE_URL` trên Render.

---

## 4. QUY TRÌNH KIỂM TRA BẰNG ĐIỆN THOẠI 4G
1. Mở trình duyệt trên điện thoại (tắt Wi-Fi, chỉ bật 4G hoặc 5G).
2. Truy cập vào link HTTPS công khai của bạn.
3. Điền họ tên học sinh (ví dụ: *Lê Thị Thu Trang*), chọn *Lớp 10*, trường học (tùy chọn) và bấm **"Xác nhận ghi danh"**.
4. Màn hình điện thoại lập tức hiện **"Ghi danh thành công"** với đầy đủ biểu tượng, thông tin lớp, ngày học, giáo viên, trợ giảng, nút Google Maps và nút Xem lớp học.
5. Trên MacBook, mở trang quản trị viên:
   `https://<domain-cua-ban>/admin.html` (hoặc bấm nút "Quản lý" trên header và nhập `KHOI-BDVH-8629`).
6. Dữ liệu học sinh vừa đăng ký từ điện thoại 4G sẽ hiển thị ngay lập tức trong bảng danh sách lớp!
