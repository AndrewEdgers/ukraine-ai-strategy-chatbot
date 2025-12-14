const log = document.getElementById("log");
const form = document.getElementById("form");
const input = document.getElementById("input");
const clearBtn = document.getElementById("clear");
const healthPill = document.getElementById("health");

function nowTime() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addMessage(kind, who, text) {
  const div = document.createElement("div");
  div.className = `msg ${kind}`;
  const t = nowTime();

  if (kind === "sys") {
    div.textContent = text;
  } else {
    div.innerHTML = `
      <div class="meta">
        <span class="who"></span>
        <span class="time"></span>
      </div>
      <div class="text"></div>
    `;
    div.querySelector(".who").textContent = who;
    div.querySelector(".time").textContent = t;
    div.querySelector(".text").textContent = text;
  }

  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

async function checkHealth() {
  try {
    const r = await fetch("/health");
    const data = await r.json();
    healthPill.textContent = data.ok ? "Healthy" : "Unhealthy";
  } catch {
    healthPill.textContent = "Offline";
  }
}

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

const sendBtn = document.getElementById("send");

const history = [];
const MAX_HISTORY = 20;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const message = input.value.trim();
  if (!message) return;
  
  sendBtn.disabled = true;
  sendBtn.textContent = "Sending…";
  
  input.value = "";
  input.focus();
  
  addMessage("user", "You", message);
  const pending = addMessage("bot", "Bot", "…");

  history.push({ role: "user", content: message });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  
  try {
    const r = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        messages: history
      })
    });
    
    let data = null;
    try {
      data = await r.json();
    } catch {
      data = null;
    }
    
    if (!r.ok) {
      pending.querySelector(".text").textContent = data?.error || data?.text || `Request failed (${r.status})`;
      return;
    }
    
    const botText = data?.text || "No response";
    pending.querySelector(".text").textContent = botText;

    history.push({ role: "assistant", content: botText });
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  } catch {
    pending.querySelector(".text").textContent = "Network error";
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Send";
  }
  
});

clearBtn.addEventListener("click", () => {
  log.innerHTML = "";
  history.length = 0;
  addMessage("sys", "", "Cleared.");
  input.focus();
});

addMessage("sys", "", "Ready. Ask about Ukraine’s AI strategy and implementation.");
checkHealth();
