const statusNode = document.querySelector("#status");
const buttons = [...document.querySelectorAll("button")];

async function runAction(action) {
  buttons.forEach(button => { button.disabled = true; });
  statusNode.textContent = "Ищу видеоплеер…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Не удалось определить активную вкладку.");

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    const result = await chrome.tabs.sendMessage(tab.id, {
      target: "vk-video-mirror",
      action
    });
    statusNode.textContent = result?.message || "Готово.";
  } catch (error) {
    statusNode.textContent = error?.message || "Не удалось выполнить действие на этой вкладке.";
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

document.querySelector("#mirror").addEventListener("click", () => runAction("toggle-mirror"));
document.querySelector("#pip").addEventListener("click", () => runAction("toggle-pip-launcher"));
