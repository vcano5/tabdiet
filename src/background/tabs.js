import { updateIcon } from './icon.js';

let alarmInterval = null;
let isClosingInProgress = false;
let countdownTimeout = null;
let isAutoClosing = false; // Flag to prevent onRemoved from triggering during auto-close

// Extract domain from URL
const getDomain = (url) => {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        return null;
    }
};

// Check if tab should be ignored (pinned or chrome internal)
const shouldIgnoreTab = (tab) => {
    return tab.pinned || 
           tab.url.startsWith('chrome://') || 
           tab.url.startsWith('chrome-extension://') ||
           tab.url.startsWith('edge://') ||
           tab.url.startsWith('about:');
};

// Check if domain is whitelisted
const isWhitelisted = (url, whitelist) => {
    const domain = getDomain(url);
    if (!domain) return false;
    return whitelist.some(whitelistedDomain => 
        domain === whitelistedDomain || domain.endsWith('.' + whitelistedDomain)
    );
};

// Group tabs by domain and find duplicates
const analyzeTabsByDomain = (tabs, whitelist) => {
    const nonWhitelisted = tabs.filter(tab => 
        !isWhitelisted(tab.url, whitelist) && !shouldIgnoreTab(tab)
    );
    const domainGroups = {};
    
    nonWhitelisted.forEach(tab => {
        const domain = getDomain(tab.url);
        if (domain) {
            if (!domainGroups[domain]) {
                domainGroups[domain] = [];
            }
            domainGroups[domain].push(tab);
        }
    });
    
    // Find domains with duplicates (more than 1 tab)
    const duplicateDomains = Object.entries(domainGroups)
        .filter(([_, tabs]) => tabs.length > 1);
    
    return { nonWhitelisted, domainGroups, duplicateDomains };
};

// Select tab to close based on strategy
const selectTabToClose = (tabs, strategy) => {
    if (tabs.length === 0) return null;
    
    switch(strategy) {
        case 'newest':
            return tabs.reduce((newest, tab) => 
                (tab.id > newest.id) ? tab : newest, tabs[0]);
        case 'random':
            return tabs[Math.floor(Math.random() * tabs.length)];
        case 'oldest':
        default:
            return tabs.reduce((oldest, tab) => 
                (tab.id < oldest.id) ? tab : oldest, tabs[0]);
    }
};

const checkTabLimit = async () => {
    // Prevent multiple simultaneous closing processes
    if (isClosingInProgress) return;
    
    const tabs = await chrome.tabs.query({});
    const closableTabs = tabs.filter(tab => !shouldIgnoreTab(tab));
    
    const settings = await chrome.storage.sync.get([
        'tabLimit', 
        'closeStrategy', 
        'warningTime', 
        'prioritizeDuplicates',
        'whitelist'
    ]);
    
    const limit = settings.tabLimit || 5;
    const strategy = settings.closeStrategy || 'oldest';
    const warningTime = (settings.warningTime || 20) * 1000; // Convert to milliseconds
    const prioritizeDuplicates = settings.prioritizeDuplicates !== undefined ? 
        settings.prioritizeDuplicates : true;
    const whitelist = settings.whitelist || [];
    
    console.log('Current closable tabs:', closableTabs.length, 'Limit:', limit);
    
    if (closableTabs.length > limit) {
        isClosingInProgress = true;
        
        // Trigger alarm and wait (non-blocking)
        updateAlarmIcon(warningTime / 1000);
        
        // Use a cancellable timeout
        countdownTimeout = setTimeout(async () => {
            // Clear only the visual alarm interval, not the timeout
            if (alarmInterval) {
                clearInterval(alarmInterval);
                alarmInterval = null;
            }
            await updateIcon();
            
            // Check again after waiting (user might have closed tabs manually)
            const currentTabs = await chrome.tabs.query({});
            const currentClosable = currentTabs.filter(tab => !shouldIgnoreTab(tab));
            
            if (currentClosable.length <= limit) {
                isClosingInProgress = false;
                countdownTimeout = null;
                await updateIcon();
                return;
            }
            
            // Analyze tabs
            const { nonWhitelisted, duplicateDomains } = analyzeTabsByDomain(currentClosable, whitelist);
            
            let tabToClose = null;
            
            // Hybrid strategy: prioritize duplicates if enabled
            if (prioritizeDuplicates && duplicateDomains.length > 0) {
                // Close from duplicate domains first
                const [domain, duplicateTabs] = duplicateDomains[0];
                tabToClose = selectTabToClose(duplicateTabs, strategy);
                console.log(`Closing duplicate from ${domain}`);
            } else {
                // No duplicates or priority disabled, close from all non-whitelisted tabs
                tabToClose = selectTabToClose(nonWhitelisted, strategy);
            }
            
            if (tabToClose) {
                // Set flag before closing
                isAutoClosing = true;
                
                // Track stats
                const stats = await chrome.storage.local.get({ closedTabs: 0, firstUse: Date.now() });
                await chrome.storage.local.set({ 
                    closedTabs: stats.closedTabs + 1,
                    firstUse: stats.firstUse
                });
                
                await chrome.tabs.remove(tabToClose.id);
                
                // Small delay before unsetting flag
                setTimeout(async () => {
                    isAutoClosing = false;
                    await updateIcon();
                }, 100);
            }
            
            isClosingInProgress = false;
            countdownTimeout = null;
            
            // Check again ONLY if still over limit (only 1 tab closed per cycle)
            const finalTabs = await chrome.tabs.query({});
            const finalClosable = finalTabs.filter(tab => !shouldIgnoreTab(tab));
            if (finalClosable.length > limit) {
                setTimeout(() => checkTabLimit(), 500);
            }
        }, warningTime);
        
        return; // Exit early, timeout will continue the process
    }
    
    isClosingInProgress = false;
};

const updateAlarmIcon = (warningSeconds) => {
    // Clear any existing alarm interval (but NOT the timeout)
    if (alarmInterval) {
        clearInterval(alarmInterval);
        alarmInterval = null;
    }
    
    let advertencia = Math.floor(warningSeconds);
    
    alarmInterval = setInterval(() => {
        const canvas = new OffscreenCanvas(128, 128);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 128, 128);
        
        // Pulsating red background (alternate between bright and dark red)
        if (Date.now() % 1000 < 500) {
            ctx.fillStyle = "#EF4444";  // Bright red
        } else {
            ctx.fillStyle = "#7F1D1D";  // Dark red
        }
        ctx.fillRect(0, 0, 128, 128);
        
        // Warning emoji
        ctx.font = '92px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚠️', 64, 68);
        
        // Countdown number overlay
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, 128, 40);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 28px Arial';
        ctx.fillText(advertencia.toString(), 64, 22);
        
        const imgData = ctx.getImageData(0, 0, 128, 128);
        chrome.action.setIcon({ imageData: imgData }, () => {});
        advertencia--;
        
        if (advertencia <= 0) {
            // Only clear the interval, not the timeout
            if (alarmInterval) {
                clearInterval(alarmInterval);
                alarmInterval = null;
            }
        }
    }, 1000);
}

const clearAlarmIcon = async () => {
    if (alarmInterval) {
        clearInterval(alarmInterval);
        alarmInterval = null;
    }
    if (countdownTimeout) {
        clearTimeout(countdownTimeout);
        countdownTimeout = null;
    }
    // Cancel the closing process if it was in progress
    if (isClosingInProgress) {
        isClosingInProgress = false;
    }
    await updateIcon();
}

chrome.runtime.onInstalled.addListener(async(details) => {
    // Initialize stats on first install
    const stats = await chrome.storage.local.get(['firstUse', 'closedTabs', 'hasSeenWelcome']);
    if (!stats.firstUse) {
        await chrome.storage.local.set({
            firstUse: Date.now(),
            closedTabs: 0
        });
    }
    
    // Show welcome page on first install
    if (details.reason === 'install' && !stats.hasSeenWelcome) {
        chrome.tabs.create({ url: 'welcome/welcome.html' });
    }
    
    await updateIcon();
    checkTabLimit();
});

chrome.tabs.onCreated.addListener(async() => {
    await updateIcon();
    checkTabLimit();
});

chrome.tabs.onRemoved.addListener(async() => {
    // Don't trigger if we're auto-closing (prevents infinite loop)
    if (isAutoClosing) return;
    
    await updateIcon();
    
    // If user manually closed tabs during warning, cancel the countdown
    const tabs = await chrome.tabs.query({});
    const closableTabs = tabs.filter(tab => !shouldIgnoreTab(tab));
    const settings = await chrome.storage.sync.get(['tabLimit']);
    const limit = settings.tabLimit || 5;
    
    if (closableTabs.length <= limit) {
        await clearAlarmIcon(); // This will cancel the countdown and reset flags
    }
});