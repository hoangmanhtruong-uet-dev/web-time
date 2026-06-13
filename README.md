# Student Schedule PWA

Web thời gian biểu có backend lưu lịch và gửi Web Push Notification khi sắp đến giờ học.

## Setup MySQL

Chạy file `schema.sql` trong MySQL Workbench để tạo database `web_time` và các bảng:

- `schedule_events`
- `push_subscriptions`
- `sent_reminders`

Tạo file `.env` từ `.env.example`, rồi điền tài khoản MySQL của máy bạn.

Ví dụ:

```bash
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=web_time
```

## Chạy local

```bash
npm install
npm start
```

Mở `http://localhost:3000`, bấm `Bật thông báo`, cho phép notification, rồi thêm lịch.

## Deploy

1. Tạo VAPID keys:

```bash
npm run vapid
```

2. Set env trên hosting:

```bash
PORT=3000
REMINDER_MINUTES=15
VAPID_SUBJECT=mailto:you@example.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

3. Deploy project Node.js và chạy:

```bash
npm start
```

Web Push cần HTTPS khi deploy thật. `localhost` vẫn dùng được để test local.
