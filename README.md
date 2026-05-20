# YOLO RTSP Person Counter

ระบบนับจำนวนคนจาก RTSP กล้องวงจรปิด ด้วย YOLOv8 + FastAPI

## โครงสร้างไฟล์
```
yolo-rtsp/
├── main.py              # FastAPI backend
├── config.json          # ตั้งค่า (สร้างอัตโนมัติ)
├── requirements.txt
├── templates/
│   ├── index.html       # Dashboard
│   └── settings.html    # หน้าตั้งค่า + วาดโซน
└── static/              # (สำหรับไฟล์ static ถ้ามี)
```

## ติดตั้ง

```bash
pip install -r requirements.txt
```

## รัน

```bash
python main.py
# หรือ
uvicorn main:app --host 0.0.0.0 --port 8000
```

เปิด browser ไปที่:
- **http://localhost:8000** — Dashboard ดู stream + จำนวนคน
- **http://localhost:8000/settings** — ตั้งค่า RTSP + ขีดเส้นโซน

## วิธีใช้งาน

1. เปิด **http://localhost:8000/settings**
2. ใส่ RTSP URL เช่น `rtsp://admin:password@192.168.1.100:554/stream`
3. เลือก YOLO model (n=เร็ว, l=แม่น)
4. กด **โหลด snapshot** (ต้องเริ่ม stream ก่อน) หรือ **อัปโหลดรูป** จากกล้อง
5. พิมพ์ชื่อโซน → คลิกวาด polygon บน canvas → กด **✓ บันทึกโซน**
6. วาดได้หลายโซน กด **💾 บันทึกการตั้งค่าทั้งหมด**
7. กลับ Dashboard → กด **▶ เริ่ม Stream**

## หมายเหตุ

- โซนใช้พิกัดแบบ normalized (0.0–1.0) เทียบกับขนาดเฟรม
- การนับใช้ "foot point" (กึ่งกลางล่างของ bounding box) เพื่อความแม่นยำ
- รองรับหลายโซนพร้อมกัน คนคนเดียวอาจถูกนับในหลายโซนถ้าอยู่ในพื้นที่ทับซ้อน
- stream รีสตาร์ทอัตโนมัติถ้าขาดการเชื่อมต่อ
