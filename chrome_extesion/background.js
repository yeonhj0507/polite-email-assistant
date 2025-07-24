let ws;
const WS_URL = "ws://127.0.0.1:37100";
let reconnectTimer = null;
let keepAliveInterval = null;

function connectWebSocket() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    console.log("WebSocket connected to Flutter app");
    // Send keep-alive pings every 20s to keep service worker alive:contentReference[oaicite:5]{index=5}
    keepAliveInterval = setInterval(() => {
      ws.send(JSON.stringify({ type: "ping" }));
    }, 20000);
  };
  ws.onmessage = (event) => {
    console.log("[BG] ◀ from Flutter:", event.data);
    // Relay incoming suggestions to content script
    const data = JSON.parse(event.data);
    if (data.suggestions) {
      // Broadcast to all tabs (or specifically to the tab that requested)
      chrome.tabs.query({url: "*://mail.google.com/*"}, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: "suggestions", suggestions: data.suggestions });
        }
      });
    } else if (data.error) {
      chrome.tabs.query({url: "*://mail.google.com/*"}, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: "error", error: data.error });
        }
      });
    }
  };
  ws.onclose = () => {
    console.warn("WebSocket disconnected, will retry...");
    clearInterval(keepAliveInterval);
    // Attempt reconnection after a delay
    reconnectTimer = setTimeout(connectWebSocket, 5000);
  };
  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    // Close and attempt reconnect
    ws.close();
  };
}

// Start the WebSocket connection when extension loads
connectWebSocket();

// Listen for messages from content scripts (email data to forward)
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === "emailContent" && ws && ws.readyState === WebSocket.OPEN) {
    console.log("[BG] ◀ emailContent from CS:", msg);
    ws.send(JSON.stringify({ to: msg.to, subject: msg.subject, body: msg.body }));
    respond({ status: "sent" });
  }
});
