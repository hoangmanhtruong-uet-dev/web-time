require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const webpush = require("web-push");

const app = express();
const port = process.env.PORT || 3000;
const reminderMinutes = Number(process.env.REMINDER_MINUTES || 15);

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "web_time",
  ssl: getMysqlSslConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

const vapidKeys = getVapidKeys();

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

app.use(express.json({ limit: "256kb" }));
app.use(express.static(__dirname));

app.get("/api/health", asyncRoute(async (req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true, database: "mysql", reminderMinutes });
}));

app.get("/api/config", (req, res) => {
  res.json({
    publicVapidKey: vapidKeys.publicKey,
    reminderMinutes
  });
});

app.get("/api/events", asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT
      id,
      title,
      event_date AS date,
      event_type AS type,
      TIME_FORMAT(start_time, '%H:%i') AS start,
      TIME_FORMAT(end_time, '%H:%i') AS end,
      starts_at AS startsAt,
      ends_at AS endsAt,
      location,
      teacher,
      done
    FROM schedule_events
    ORDER BY event_date ASC, start_time ASC
  `);

  res.json(rows.map(mapEventRow));
}));

app.post("/api/events", asyncRoute(async (req, res) => {
  const event = normalizeEvent(req.body);

  await pool.execute(`
    INSERT INTO schedule_events
      (id, title, event_date, event_type, start_time, end_time, starts_at, ends_at, location, teacher, done)
    VALUES
      (:id, :title, :date, :type, :start, :end, :startsAt, :endsAt, :location, :teacher, :done)
  `, {
    ...event,
    done: event.done ? 1 : 0
  });

  res.status(201).json(event);
}));

app.patch("/api/events/:id", asyncRoute(async (req, res) => {
  const patch = normalizeEventPatch(req.body);
  const updates = [];
  const params = { id: req.params.id };

  const columns = {
    title: "title",
    date: "event_date",
    type: "event_type",
    start: "start_time",
    end: "end_time",
    startsAt: "starts_at",
    endsAt: "ends_at",
    location: "location",
    teacher: "teacher",
    done: "done"
  };

  Object.entries(columns).forEach(([field, column]) => {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      updates.push(`${column} = :${field}`);
      params[field] = field === "done" ? (patch[field] ? 1 : 0) : patch[field];
    }
  });

  if (updates.length === 0) throwRequest("No valid fields to update");

  const [result] = await pool.execute(`
    UPDATE schedule_events
    SET ${updates.join(", ")}
    WHERE id = :id
  `, params);

  if (result.affectedRows === 0) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const event = await getEventById(req.params.id);
  res.json(event);
}));

app.delete("/api/events/:id", asyncRoute(async (req, res) => {
  const [result] = await pool.execute("DELETE FROM schedule_events WHERE id = ?", [req.params.id]);
  if (result.affectedRows === 0) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  res.status(204).end();
}));

app.post("/api/subscriptions", asyncRoute(async (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) throwRequest("Invalid push subscription");

  await pool.execute(`
    INSERT INTO push_subscriptions (endpoint, subscription_json)
    VALUES (:endpoint, :subscriptionJson)
    ON DUPLICATE KEY UPDATE
      subscription_json = VALUES(subscription_json),
      updated_at = CURRENT_TIMESTAMP
  `, {
    endpoint: subscription.endpoint,
    subscriptionJson: JSON.stringify(subscription)
  });

  res.status(201).json({ ok: true });
}));

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error(error);
  const status = error.status || 500;
  res.status(status).json({
    error: status === 500 ? "Internal server error" : error.message
  });
});

app.listen(port, () => {
  console.log(`Schedule app running on http://localhost:${port}`);
  console.log(`Database: MySQL ${process.env.MYSQL_DATABASE || "web_time"}`);
  console.log(`Push reminder: ${reminderMinutes} minute(s) before each event`);
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.log("Generated temporary VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY for production.");
  }
});

setInterval(() => {
  sendDueReminders().catch((error) => console.error("Reminder scheduler failed:", error.message));
}, 30000);

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function getEventById(id) {
  const [rows] = await pool.execute(`
    SELECT
      id,
      title,
      event_date AS date,
      event_type AS type,
      TIME_FORMAT(start_time, '%H:%i') AS start,
      TIME_FORMAT(end_time, '%H:%i') AS end,
      starts_at AS startsAt,
      ends_at AS endsAt,
      location,
      teacher,
      done
    FROM schedule_events
    WHERE id = ?
  `, [id]);

  return rows[0] ? mapEventRow(rows[0]) : null;
}

function getVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY
    };
  }

  return webpush.generateVAPIDKeys();
}

function getMysqlSslConfig() {
  if (process.env.MYSQL_SSL !== "true") return undefined;

  const config = {
    rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== "false"
  };

  if (process.env.MYSQL_SSL_CA) {
    config.ca = process.env.MYSQL_SSL_CA.replace(/\\n/g, "\n");
  }

  return config;
}

function normalizeEvent(input) {
  const event = normalizeEventPatch(input);
  ["title", "date", "type", "start", "end", "startsAt", "endsAt"].forEach((field) => {
    if (!event[field]) throwRequest(`${field} is required`);
  });

  return {
    id: event.id || randomId(),
    title: event.title,
    date: event.date,
    type: event.type,
    start: event.start,
    end: event.end,
    startsAt: toScheduleDateTime(event.date, event.start),
    endsAt: toScheduleDateTime(event.date, event.end),
    location: event.location || "",
    teacher: event.teacher || "",
    done: Boolean(event.done)
  };
}

function normalizeEventPatch(input) {
  if (!input || typeof input !== "object") throwRequest("Invalid event payload");

  const allowed = {};
  const fields = ["id", "title", "date", "type", "start", "end", "startsAt", "endsAt", "location", "teacher", "done"];

  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      allowed[field] = typeof input[field] === "string" ? input[field].trim() : input[field];
    }
  });

  if (!allowed.title && Object.prototype.hasOwnProperty.call(input, "title")) {
    throwRequest("Title is required");
  }

  if (allowed.startsAt) allowed.startsAt = toMysqlDateTime(allowed.startsAt);
  if (allowed.endsAt) allowed.endsAt = toMysqlDateTime(allowed.endsAt);

  return allowed;
}

async function sendDueReminders() {
  const [events] = await pool.execute(`
    SELECT
      id,
      title,
      event_date AS date,
      event_type AS type,
      TIME_FORMAT(start_time, '%H:%i') AS start,
      TIME_FORMAT(end_time, '%H:%i') AS end,
      starts_at AS startsAt,
      ends_at AS endsAt,
      location,
      teacher,
      done
    FROM schedule_events
    WHERE done = 0
      AND starts_at BETWEEN DATE_SUB(NOW(), INTERVAL 1 MINUTE)
      AND DATE_ADD(NOW(), INTERVAL ? MINUTE)
  `, [reminderMinutes + 1]);

  for (const row of events) {
    const event = mapEventRow(row);
    const startsAt = new Date(event.startsAt).getTime();
    const now = Date.now();
    const remindAt = startsAt - reminderMinutes * 60000;

    if (now >= remindAt && now - remindAt < 45000) {
      await sendReminderOnce(event, `before:${reminderMinutes}`, `${reminderMinutes} phút nữa đến ${event.title}`);
    }

    if (now >= startsAt && now - startsAt < 45000) {
      await sendReminderOnce(event, "start", `Đến giờ: ${event.title}`);
    }
  }
}

async function sendReminderOnce(event, reminderType, title) {
  const [result] = await pool.execute(`
    INSERT IGNORE INTO sent_reminders (event_id, reminder_type)
    VALUES (?, ?)
  `, [event.id, reminderType]);

  if (result.affectedRows === 0) return;

  await queuePush(event, title, buildBody(event));
}

async function queuePush(event, title, body) {
  const [rows] = await pool.query("SELECT endpoint, subscription_json AS subscriptionJson FROM push_subscriptions");
  const payload = JSON.stringify({
    title,
    body,
    url: "/",
    eventId: event.id
  });

  await Promise.all(rows.map(async (row) => {
    const subscription = JSON.parse(row.subscriptionJson);

    try {
      await webpush.sendNotification(subscription, payload);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await pool.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", [row.endpoint]);
      } else {
        console.error("Push failed:", error.message);
      }
    }
  }));
}

function buildBody(event) {
  const place = event.location ? ` tại ${event.location}` : "";
  const teacher = event.teacher ? ` - ${event.teacher}` : "";
  return `${event.start} - ${event.end}${place}${teacher}`;
}

function mapEventRow(row) {
  return {
    id: row.id,
    title: row.title,
    date: toDateOnly(row.date),
    type: row.type,
    start: row.start,
    end: row.end,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: new Date(row.endsAt).toISOString(),
    location: row.location || "",
    teacher: row.teacher || "",
    done: Boolean(row.done)
  };
}

function toDateOnly(value) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function toMysqlDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throwRequest("Invalid datetime");
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function toScheduleDateTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throwRequest("Invalid schedule date or time");
  }

  return `${date} ${time}:00`;
}

function randomId() {
  return `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function throwRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}
