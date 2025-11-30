export const updateIcon = async () => {
    const tabs = await chrome.tabs.query({});
    // Filter out pinned and chrome internal pages
    const validTabs = tabs.filter(t => 
        !t.pinned && 
        !t.url.startsWith('chrome://') && 
        !t.url.startsWith('chrome-extension://') &&
        !t.url.startsWith('edge://') &&
        !t.url.startsWith('about:')
    );
    const count = validTabs.length;
    
    const { tabLimit = 5 } = await chrome.storage.sync.get('tabLimit');
    const ratio = count / tabLimit;

    let emoji, bgColor;

    // Progressive tie states based on saturation
    if (ratio <= 0.3) {
        emoji = '👔';  // Relaxed - perfect tie
        bgColor = '#10B981';  // Green
    } else if (ratio <= 0.55) {
        emoji = '😅';  // Slightly tight - light sweat
        bgColor = '#F59E0B';  // Amber
    } else if (ratio <= 0.8) {
        emoji = '😰';  // About to burst - red face + sweat
        bgColor = '#F97316';  // Orange
    } else if (ratio < 1) {
        emoji = '🤯';  // Critical - face exploding
        bgColor = '#EF4444';  // Red
    } else {
        emoji = '💥';  // Burst - explosion
        bgColor = '#7C2D12';  // Dark brown/red
    }

    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 128, 128);

    // Emoji
    ctx.font = '92px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 68);

    // Number badge on top for counts > 9
    if (count > 9) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, 0, 128, 34);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(count > 99 ? '99+' : count.toString(), 64, 18);
    }

    const imgData = ctx.getImageData(0, 0, 128, 128);
    chrome.action.setIcon({ imageData: imgData });
};