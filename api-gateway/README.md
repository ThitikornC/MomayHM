# Person Counter — API Gateway

Node.js / Express สำหรับ deploy บน cloud เป็นตัวกลางระหว่าง on-site server กับ front end

## Architecture

```
[On-site] FastAPI + YOLO  --POST /api/push-->  [Cloud] Node.js Gateway  <--GET /api/cameras--  [Browser] Heatmap
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port ที่ server ฟัง |
| `API_KEY` | _(ว่าง)_ | Secret key สำหรับ on-site server แนบใน header `X-API-Key` |
| `STALE_SEC` | `15` | วินาที ถ้าไม่มีข้อมูลใหม่ จะ mark กล้องว่า offline |

## Install & Run

```bash
cd api-gateway
npm install
node server.js
```

## Endpoints

| Method | Path | ใคร call | Description |
|---|---|---|---|
| `POST` | `/api/push` | On-site server | ส่งข้อมูลกล้องทั้งหมด |
| `GET` | `/api/cameras` | Front end | รับข้อมูลกล้องทั้งหมด |
| `GET` | `/api/cameras/:id/status` | Front end | ข้อมูลกล้องเดียว |
| `GET` | `/api/summary` | Front end | ยอดรวม |
| `GET` | `/health` | Monitoring | Health check |

## Deploy บน Render / Railway / Fly.io

1. Push โฟลเดอร์ `api-gateway/` ขึ้น Git
2. ตั้ง Root Directory เป็น `api-gateway`
3. Build command: `npm install`
4. Start command: `node server.js`
5. ตั้ง env var `API_KEY=your_secret_key`
