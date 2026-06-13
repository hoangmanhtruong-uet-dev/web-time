const hourStart = 6;
const hourEnd = 21;
const storageKey = "student-schedule-events";
const themeKey = "student-schedule-theme";

const subjectColors = {
  "Đại số": "var(--algebra)",
  "Lập trình": "var(--programming)",
  "Thể dục": "var(--sport)",
  "Triết học": "var(--philosophy)",
  personal: "var(--personal)",
  school: "var(--primary)"
};

const dayNames = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
let currentWeekDate = new Date();
let selectedCellDate = null;
let events = [];
let apiOnline = false;
let appConfig = null;

const els = {
  weekTitle: document.querySelector("#weekTitle"),
  prevWeek: document.querySelector("#prevWeek"),
  nextWeek: document.querySelector("#nextWeek"),
  todayButton: document.querySelector("#todayButton"),
  filter: document.querySelector("#scheduleFilter"),
  themeToggle: document.querySelector("#themeToggle"),
  notifyButton: document.querySelector("#enableNotifications"),
  timeColumn: document.querySelector("#timeColumn"),
  board: document.querySelector("#scheduleBoard"),
  modal: document.querySelector("#scheduleModal"),
  addButton: document.querySelector("#addScheduleButton"),
  closeModal: document.querySelector("#closeModal"),
  cancelModal: document.querySelector("#cancelModal"),
  form: document.querySelector("#scheduleForm"),
  countdownTitle: document.querySelector("#countdownTitle"),
  countdownText: document.querySelector("#countdownText"),
  eventDate: document.querySelector("#eventDate"),
  eventStart: document.querySelector("#eventStart"),
  eventEnd: document.querySelector("#eventEnd")
};

init();

async function init() {
  initTheme();
  bindEvents();
  await loadInitialEvents();
  await registerServiceWorker();
  render();
  updateNotificationButton();
  setInterval(updateCountdown, 30000);
}

function bindEvents() {
  els.prevWeek.addEventListener("click", () => changeWeek(-7));
  els.nextWeek.addEventListener("click", () => changeWeek(7));
  els.todayButton.addEventListener("click", () => {
    currentWeekDate = new Date();
    render();
  });
  els.filter.addEventListener("change", render);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.notifyButton.addEventListener("click", enablePushNotifications);
  els.addButton.addEventListener("click", () => openModal(new Date()));
  els.closeModal.addEventListener("click", closeModal);
  els.cancelModal.addEventListener("click", closeModal);
  els.modal.addEventListener("click", (event) => {
    if (event.target === els.modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
  els.form.addEventListener("submit", handleSubmit);
}

async function loadInitialEvents() {
  try {
    const [configResponse, eventsResponse] = await Promise.all([
      fetch("/api/config"),
      fetch("/api/events")
    ]);

    if (!configResponse.ok || !eventsResponse.ok) throw new Error("API unavailable");

    appConfig = await configResponse.json();
    events = await eventsResponse.json();
    apiOnline = true;

    if (events.length === 0) {
      events = [];
      const localEvents = getStoredLocalEvents();
      const initialEvents = localEvents.length > 0 ? localEvents : seedEvents();

      for (const item of initialEvents) {
        events.push(await createEvent(item));
      }
    }

    saveLocalEvents();
  } catch (error) {
    apiOnline = false;
    events = loadLocalEvents();
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(els.form);
  const start = formData.get("start");
  const end = formData.get("end");

  if (start >= end) {
    els.eventEnd.setCustomValidity("Giờ kết thúc phải sau giờ bắt đầu.");
    els.eventEnd.reportValidity();
    return;
  }

  els.eventEnd.setCustomValidity("");

  const scheduleItem = buildEvent({
    title: formData.get("title").trim(),
    date: formData.get("date"),
    type: formData.get("type"),
    start,
    end,
    location: formData.get("location").trim(),
    teacher: formData.get("teacher").trim(),
    done: false
  });

  const savedEvent = await createEvent(scheduleItem);
  events.push(savedEvent);
  saveLocalEvents();
  closeModal();
  render();
}

async function createEvent(scheduleItem) {
  if (!apiOnline) return scheduleItem;

  try {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scheduleItem)
    });
    if (!response.ok) throw new Error("Could not save event");
    return response.json();
  } catch (error) {
    apiOnline = false;
    return scheduleItem;
  }
}

async function updateEvent(id, patch) {
  const event = events.find((item) => item.id === id);
  if (event) Object.assign(event, patch);
  saveLocalEvents();

  if (!apiOnline) return;

  try {
    const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!response.ok) throw new Error("Could not update event");
  } catch (error) {
    apiOnline = false;
  }
}

function render() {
  const weekStart = getWeekStart(currentWeekDate);
  const weekEnd = addDays(weekStart, 6);
  els.weekTitle.textContent = `Tuần ${getWeekNumber(weekStart)}: ${formatDate(weekStart)} - ${formatDate(weekEnd)}`;

  renderTimeColumn();
  renderBoard(weekStart);
  updateCountdown();
}

function renderTimeColumn() {
  els.timeColumn.innerHTML = '<div class="time-spacer"></div>';

  for (let hour = hourStart; hour < hourEnd; hour += 1) {
    const slot = document.createElement("div");
    slot.className = "time-slot";
    slot.textContent = `${String(hour).padStart(2, "0")}:00`;
    els.timeColumn.append(slot);
  }
}

function renderBoard(weekStart) {
  els.board.innerHTML = "";
  const todayKey = toDateKey(new Date());

  for (let day = 0; day < 7; day += 1) {
    const date = addDays(weekStart, day);
    const header = document.createElement("div");
    header.className = `day-header${toDateKey(date) === todayKey ? " today" : ""}`;
    header.innerHTML = `<strong>${dayNames[day]}</strong><span>${formatDate(date)}</span>`;
    els.board.append(header);
  }

  for (let hour = hourStart; hour < hourEnd; hour += 1) {
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(weekStart, day);
      const cell = document.createElement("button");
      cell.className = "board-cell";
      cell.type = "button";
      cell.dataset.date = toDateKey(date);
      cell.dataset.hour = String(hour);
      cell.setAttribute("aria-label", `Thêm lịch vào ${formatDate(date)} lúc ${hour}:00`);
      cell.addEventListener("click", () => openModal(date, `${String(hour).padStart(2, "0")}:00`));
      els.board.append(cell);
    }
  }

  layoutEvents(weekStart).forEach(addEventToBoard);
}

function addEventToBoard(positionedEvent) {
  const { item, lane, laneCount } = positionedEvent;
  const dayIndex = Math.round((parseDate(item.date) - getWeekStart(currentWeekDate)) / 86400000);
  const startHour = timeToDecimal(item.start);
  const endHour = timeToDecimal(item.end);
  const top = 58 + Math.max(0, startHour - hourStart) * 64;
  const height = Math.max(46, (endHour - startHour) * 64 - 8);
  const dayWidth = 100 / 7;
  const gap = laneCount > 1 ? 4 : 6;
  const left = `calc(${dayIndex * dayWidth}% + ${gap}px + ${lane} * ((100% / 7 - ${gap * 2}px) / ${laneCount}))`;
  const width = `calc((100% / 7 - ${gap * 2}px) / ${laneCount} - ${laneCount > 1 ? 3 : 0}px)`;
  const color = getEventColor(item);

  const card = document.createElement("article");
  card.className = `event-card${item.done ? " done" : ""}${height < 72 ? " compact" : ""}${laneCount > 1 ? " split" : ""}`;
  card.style.setProperty("--event-color", color);
  card.style.color = color;
  card.style.top = `${top}px`;
  card.style.height = `${height}px`;
  card.style.left = left;
  card.style.width = width;

  card.innerHTML = `
    <button class="done-toggle" type="button" aria-label="Đánh dấu hoàn thành">${item.done ? "✓" : ""}</button>
    <h3>${escapeHtml(item.title)}</h3>
    <p>${item.start} - ${item.end}</p>
    <p>${escapeHtml(item.location || "Chưa có địa điểm")}</p>
    <p>${escapeHtml(item.teacher || "Chưa có giảng viên")}</p>
  `;

  card.querySelector(".done-toggle").addEventListener("click", async (event) => {
    event.stopPropagation();
    await updateEvent(item.id, { done: !item.done });
    render();
  });

  els.board.append(card);
}

function layoutEvents(weekStart) {
  const positioned = [];
  const byDay = new Map();

  getVisibleEvents(weekStart).forEach((item) => {
    const key = item.date;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(item);
  });

  byDay.forEach((items) => {
    const sorted = [...items].sort((a, b) => timeToDecimal(a.start) - timeToDecimal(b.start));
    const active = [];

    sorted.forEach((item) => {
      const start = timeToDecimal(item.start);
      const end = timeToDecimal(item.end);

      for (let index = active.length - 1; index >= 0; index -= 1) {
        if (active[index].end <= start) active.splice(index, 1);
      }

      const usedLanes = new Set(active.map((entry) => entry.lane));
      let lane = 0;
      while (usedLanes.has(lane)) lane += 1;

      active.push({ item, lane, start, end });

      const group = active.filter((entry) => entry.start < end && entry.end > start);
      const laneCount = Math.max(...group.map((entry) => entry.lane)) + 1;

      group.forEach((entry) => {
        const existing = positioned.find((candidate) => candidate.item.id === entry.item.id);
        if (existing) {
          existing.laneCount = Math.max(existing.laneCount, laneCount);
        } else {
          positioned.push({ item: entry.item, lane: entry.lane, laneCount });
        }
      });
    });
  });

  return positioned;
}

function getVisibleEvents(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const filter = els.filter.value;

  return events
    .filter((item) => {
      const date = parseDate(item.date);
      const inWeek = date >= weekStart && date <= weekEnd;
      const matchesType = filter === "all" || item.type === filter || item.title.includes(filter);
      return inWeek && matchesType;
    })
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
}

function openModal(date, startTime = "07:00") {
  selectedCellDate = date;
  els.form.reset();
  els.eventDate.value = toDateKey(selectedCellDate);
  els.eventStart.value = startTime;
  els.eventEnd.value = addMinutesToTime(startTime, 90);
  els.modal.classList.add("open");
  els.modal.setAttribute("aria-hidden", "false");
  document.querySelector("#eventTitle").focus();
}

function closeModal() {
  els.modal.classList.remove("open");
  els.modal.setAttribute("aria-hidden", "true");
  els.eventEnd.setCustomValidity("");
}

function updateCountdown() {
  const now = new Date();
  const upcoming = events
    .filter((item) => !item.done)
    .map((item) => ({ ...item, startsAtDate: new Date(item.startsAt || `${item.date}T${item.start}`) }))
    .filter((item) => item.startsAtDate > now)
    .sort((a, b) => a.startsAtDate - b.startsAtDate)[0];

  if (!upcoming) {
    els.countdownTitle.textContent = "Không có lịch sắp tới";
    els.countdownText.textContent = "Bạn đang rảnh, hoặc các lịch gần nhất đã hoàn thành.";
    return;
  }

  const minutes = Math.ceil((upcoming.startsAtDate - now) / 60000);
  const timeText = minutes < 60
    ? `Còn ${minutes} phút nữa`
    : `Còn ${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;

  els.countdownTitle.textContent = `${timeText} đến ${upcoming.title}`;
  els.countdownText.textContent = `${upcoming.start} tại ${upcoming.location || "địa điểm chưa nhập"}. Chuẩn bị vào học thôi.`;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    els.notifyButton.disabled = true;
    els.notifyButton.textContent = "Không hỗ trợ thông báo";
    return;
  }

  try {
    await navigator.serviceWorker.register("/service-worker.js");
  } catch (error) {
    els.notifyButton.disabled = true;
    els.notifyButton.textContent = "Không đăng ký được";
  }
}

async function enablePushNotifications() {
  if (!apiOnline || !appConfig) {
    els.notifyButton.textContent = "Cần chạy backend";
    return;
  }

  if (!("Notification" in window) || !("PushManager" in window)) {
    els.notifyButton.textContent = "Trình duyệt không hỗ trợ";
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    els.notifyButton.textContent = "Thông báo bị chặn";
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(appConfig.publicVapidKey)
  });

  await fetch("/api/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription)
  });

  els.notifyButton.textContent = "Đã bật thông báo";
}

function updateNotificationButton() {
  if (!("Notification" in window)) {
    els.notifyButton.disabled = true;
    els.notifyButton.textContent = "Không hỗ trợ thông báo";
    return;
  }

  if (Notification.permission === "granted") {
    els.notifyButton.textContent = "Đã bật thông báo";
  }
}

function buildEvent(input) {
  const startsAt = new Date(`${input.date}T${input.start}`).toISOString();
  const endsAt = new Date(`${input.date}T${input.end}`).toISOString();

  return {
    id: input.id || crypto.randomUUID(),
    ...input,
    startsAt,
    endsAt
  };
}

function changeWeek(dayCount) {
  currentWeekDate = addDays(currentWeekDate, dayCount);
  render();
}

function initTheme() {
  const savedTheme = localStorage.getItem(themeKey);
  if (savedTheme === "dark") document.body.classList.add("dark");
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem(themeKey, document.body.classList.contains("dark") ? "dark" : "light");
}

function loadLocalEvents() {
  const saved = getStoredLocalEvents();
  if (saved.length > 0) return saved;
  return seedEvents();
}

function saveLocalEvents() {
  localStorage.setItem(storageKey, JSON.stringify(events));
}

function getStoredLocalEvents() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => buildEvent(item));
  } catch (error) {
    return [];
  }
}

function seedEvents() {
  const monday = getWeekStart(new Date());
  return [
    buildEvent({
      title: "Đại số",
      date: toDateKey(monday),
      type: "school",
      start: "07:30",
      end: "09:00",
      location: "A2-305",
      teacher: "Cô Lan",
      done: true
    }),
    buildEvent({
      title: "Lập trình",
      date: toDateKey(addDays(monday, 2)),
      type: "school",
      start: "09:30",
      end: "11:30",
      location: "Lab 4",
      teacher: "Thầy Minh",
      done: false
    }),
    buildEvent({
      title: "Thể dục",
      date: toDateKey(addDays(monday, 4)),
      type: "school",
      start: "15:00",
      end: "16:30",
      location: "Sân vận động",
      teacher: "Thầy Quân",
      done: false
    }),
    buildEvent({
      title: "Ôn Triết học",
      date: toDateKey(addDays(monday, 5)),
      type: "personal",
      start: "20:00",
      end: "21:00",
      location: "Thư viện",
      teacher: "",
      done: false
    })
  ];
}

function getEventColor(item) {
  const subject = Object.keys(subjectColors).find((key) => item.title.includes(key));
  return subjectColors[subject] || subjectColors[item.type] || subjectColors.school;
}

function getWeekStart(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function getWeekNumber(date) {
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const pastDays = Math.floor((date - firstDay) / 86400000);
  return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function parseDate(value) {
  return new Date(`${value}T00:00:00`);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function timeToDecimal(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours + minutes / 60;
}

function addMinutesToTime(time, minutesToAdd) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes + minutesToAdd, 0, 0);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
