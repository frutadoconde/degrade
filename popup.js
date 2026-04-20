$(function () {
    $("#applyGradient").on("click", applyEvent);
    $("#clear").on("click", resetEvent);
    $("#modeChange").on("click", modeEvent);
});

async function sendMessage(message) {
    const tabs = await browser.tabs.query({ currentWindow: true, active: true });
    tabs.forEach((tab) => {
        browser.tabs.sendMessage(tab.id, message).catch((err) => {
            console.warn(`Error sending message to tab ${tab.id}: ${err.message}`);
        });
    });
}

async function applyEvent() {
    const tabs = await browser.tabs.query({ currentWindow: true, active: true });
    tabs.forEach(async (tab) => {
        try {
            browser.tabs.sendMessage(tab.id, { action: "applyGradient" });
            await browser.tabs.executeScript(tab.id, {
                file: "jquery-4.0.0.slim.min.js",
            });
            await browser.tabs.executeScript(tab.id, { file: "content.js" });
        } catch (error) {
            console.warn(`Error ${tab.id}: ${error.message}`);
        }
    });
}

async function modeEvent() {
    const getMode = await browser.storage.local.get("lightMode");
    let storedMode = getMode.lightMode;

    if (Object.keys(getMode).length === 0) {
        storedMode = true;
    } else {
        storedMode = !storedMode;
    }

    await browser.storage.local.set({ lightMode: storedMode });
    const mode = storedMode ? "light" : "dark";

    sendMessage({ action: "changeMode", mode });
}

async function resetEvent() {
    await browser.storage.local.remove("lightMode");

    sendMessage({ action: "resetStyle" });
}
