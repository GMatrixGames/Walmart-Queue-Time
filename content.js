let currentPathname = window.location.pathname;
if (currentPathname.startsWith("/qp")) {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("inject.js");
    script.type = "text/javascript";
    script.defer = true;

    (document.head || document.documentElement).appendChild(script);
}

let lastExpectedTurnTime = null;
let countdownInterval = null;
let injectedTimerEl = null;

function cleanup() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    if (injectedTimerEl && injectedTimerEl.parentNode) {
        injectedTimerEl.parentNode.removeChild(injectedTimerEl);
        injectedTimerEl = null;
    }
    lastExpectedTurnTime = null;
}

function checkLocation() {
    const newPathname = window.location.pathname;
    if (newPathname !== currentPathname) {
        currentPathname = newPathname;
        if (!newPathname.startsWith("/qp")) {
            cleanup();
        }
    }
}

const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
    originalPushState.apply(history, args);
    checkLocation();
};

history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    checkLocation();
};

window.addEventListener("popstate", checkLocation);

setInterval(checkLocation, 500);

window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== "QUEUE_TIMER") return;

    // sanity check for queue page ONLY
    if (!window.location.pathname.startsWith("/qp")) {
        cleanup();
        return;
    }

    const payload = event.data.payload;
    if (!Array.isArray(payload)) return;

    for (const queueItem of payload) {
        const expectedTime = queueItem?.expectedTurnTimeUnixTimestamp;
        const apiItemName = queueItem?.customMetadata?.item?.name;

        if (typeof expectedTime !== "number" || !apiItemName) continue;

        const nameElement = findElementByText(apiItemName);
        if (!nameElement) continue;

        const pageItemName = nameElement.textContent.trim();
        // console.log("Page item name", pageItemName, "api name", apiItemName);
        if (pageItemName !== apiItemName) continue;

        if (expectedTime !== lastExpectedTurnTime) {
            lastExpectedTurnTime = expectedTime;
            ensureTimerInjected(nameElement);
            startCountdown(expectedTime);
        }

        break;
    }
});

function findElementByText(text) {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    while ((node = walker.nextNode())) {
        const nodeText = node.textContent.trim();
        // ignore nextjs pagedata
        if (nodeText.includes('{') || nodeText.includes('}')) continue;

        // Check if this text node contains the product name
        // 80% match of product name (should only be one that matches 100%, just for sake of sanity)
        if (nodeText.includes(text) && nodeText.length >= text.length * 0.8) {
            return node.parentElement;
        }
    }
    return null;
}

// go up 4 for outer
function findContainerFromNameElement(nameElement) {
    let current = nameElement;
    for (let i = 0; i < 4; i++) {
        if (!current || !current.parentElement) return null;
        current = current.parentElement;
    }
    return current;
}

function ensureTimerInjected(nameElement) {
    if (injectedTimerEl) return;
    if (!nameElement) return;

    const container = findContainerFromNameElement(nameElement);
    if (!container) return;

    // hold my spot
    const buttons = container.querySelectorAll("button");
    let holdButton = null;
    for (const button of buttons) {
        if (button.textContent.includes("Hold my spot")) {
            holdButton = button;
            break;
        }
    }
    if (!holdButton) return;

    injectedTimerEl = document.createElement("div");
    injectedTimerEl.className = "mt3 mb3 f5 mid-gray tc";
    injectedTimerEl.textContent = "Calculating wait time...";

    holdButton.parentNode.insertBefore(injectedTimerEl, holdButton);
}

function startCountdown(unixTimestamp) {
    clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        const diff = unixTimestamp - Date.now();

        if (diff <= 0) {
            injectedTimerEl.textContent = "It's almost your turn!";
            clearInterval(countdownInterval);
            return;
        }

        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);

        injectedTimerEl.textContent = `Estimated wait time: ${minutes}m ${seconds}s`;
    }, 1000);
}