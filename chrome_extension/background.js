
let ws;
const WS_URL = "ws://127.0.0.1:37100";
let reconnectTimer = null;
let keepAliveInterval = null;

function connectWebSocket() {
  ws = new WebSocket(WS_URL);
  
  ws.onopen = () => {
    console.log("✅ WebSocket connected to Flutter app");
    // Keep service worker alive
    keepAliveInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 20000);
  };
  
  ws.onmessage = (event) => {
    console.log("[BG] 📨 from Flutter:", event.data);
    
    try {
      const data = JSON.parse(event.data);
      
      if (data.suggestions && Array.isArray(data.suggestions)) {
        const tone = data.suggestions[0]; // "중립" 또는 "무례"
        const suggestions = data.suggestions.slice(1); // 실제 제안들
        
        // tone을 영문 레벨로 변환
        const toneLevel = (tone === "무례" || tone === "Rude") ? "error" : "neutral";

        console.log(`[BG] 📊 Tone: ${tone} (${toneLevel}), Suggestions: ${suggestions.length}`);
        
        // Gmail 탭들에게 전송
        chrome.tabs.query({ url: "*://mail.google.com/*" }, (tabs) => {
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {
              type: "analysis_result",
              tone: toneLevel,
              toneText: tone,
              suggestions: suggestions,
              timestamp: Date.now()
            }).catch(err => {
              console.warn(`Failed to send to tab ${tab.id}:`, err);
            });
          }
        });
        
      } else if (data.error) {
        console.error("[BG] ❌ Flutter error:", data.error);
        
        chrome.tabs.query({ url: "*://mail.google.com/*" }, (tabs) => {
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {
              type: "error",
              error: data.error
            }).catch(err => console.warn(`Failed to send error to tab ${tab.id}`));
          }
        });
      }
      
    } catch (parseErr) {
      console.error("[BG] ❌ Failed to parse Flutter message:", parseErr);
    }
  };
  
  ws.onclose = () => {
    console.warn("[BG] ⚠️ WebSocket disconnected, will retry in 5s...");
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    
    // 재연결 시도
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWebSocket, 5000);
  };
  
  ws.onerror = (err) => {
    console.error("[BG] ❌ WebSocket error:", err);
    ws.close();
  };
}

// 확장 로드 시 WebSocket 연결 시작
connectWebSocket();

// Content Script로부터 이메일 데이터 수신
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === "emailContent") {
    console.log("[BG] 📧 emailContent from CS:", {
      focus: msg.focus?.substring(0, 50) + "...",
      context: msg.context?.substring(0, 50) + "...",
      bodyLength: msg.body?.length || 0
    });
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Flutter로 분석 요청 (focus, context, body만 전송)
      const payload = {
        type: "analyze",
        focus: msg.focus || "",
        context: msg.context || "",
        body: msg.body || "",
        timestamp: Date.now()
      };
      
      ws.send(JSON.stringify(payload));
      respond({ status: "sent", payload: payload });
      
    } else {
      console.warn("[BG] ⚠️ WebSocket not connected");
      respond({ status: "error", error: "WebSocket not connected" });
      
      // Content Script에 연결 오류 알림
      chrome.tabs.sendMessage(sender.tab.id, {
        type: "error",
        error: "AI 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요."
      });
    }
  }
  
  return true; // 비동기 응답
});