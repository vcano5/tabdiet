// Open settings popup when button is clicked
document.getElementById('openSettings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
});

// Track that user has seen welcome page
chrome.storage.local.set({ hasSeenWelcome: true });
