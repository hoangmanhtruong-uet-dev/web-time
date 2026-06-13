self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Nhắc lịch";
  const options = {
    body: data.body || "Bạn có một kế hoạch sắp tới.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: {
      url: data.url || "/",
      eventId: data.eventId
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existingClient = clientList.find((client) => client.url.includes(url) && "focus" in client);
      if (existingClient) return existingClient.focus();
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    })
  );
});
