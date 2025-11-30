// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', async () => {
    const settings = await chrome.storage.sync.get([
        'tabLimit', 
        'closeStrategy', 
        'warningTime', 
        'prioritizeDuplicates',
        'whitelist'
    ]);
    
    const stats = await chrome.storage.local.get({ closedTabs: 0, firstUse: Date.now() });
    
    // Set tab limit
    document.getElementById('tabLimit').value = settings.tabLimit || 5;
    
    // Set warning time
    const warningTime = settings.warningTime || 20;
    document.getElementById('warningTime').value = warningTime;
    document.getElementById('warningTimeValue').textContent = warningTime + 's';
    
    // Set close strategy
    const strategy = settings.closeStrategy || 'oldest';
    document.querySelector(`input[name="closeStrategy"][value="${strategy}"]`).checked = true;
    
    // Set prioritize duplicates
    document.getElementById('prioritizeDuplicates').checked = 
        settings.prioritizeDuplicates !== undefined ? settings.prioritizeDuplicates : true;
    
    // Set whitelist
    document.getElementById('whitelist').value = 
        (settings.whitelist || []).join('\n');
    
    // Display stats
    document.getElementById('closedCount').textContent = stats.closedTabs || 0;
});

// Update warning time value display
document.getElementById('warningTime').addEventListener('input', (e) => {
    document.getElementById('warningTimeValue').textContent = e.target.value + 's';
});

// Save settings when button is clicked
document.getElementById('saveBtn').addEventListener('click', async () => {
    const tabLimit = parseInt(document.getElementById('tabLimit').value);
    const closeStrategy = document.querySelector('input[name="closeStrategy"]:checked').value;
    const warningTime = parseInt(document.getElementById('warningTime').value);
    const prioritizeDuplicates = document.getElementById('prioritizeDuplicates').checked;
    const whitelistText = document.getElementById('whitelist').value;
    
    // Validate tab limit
    if (isNaN(tabLimit) || tabLimit < 1 || tabLimit > 100) {
        showStatus('Please enter a valid number between 1 and 100', true);
        return;
    }
    
    // Parse whitelist
    const whitelist = whitelistText
        .split('\n')
        .map(domain => domain.trim())
        .filter(domain => domain.length > 0);
    
    // Save to Chrome storage
    await chrome.storage.sync.set({
        tabLimit: tabLimit,
        closeStrategy: closeStrategy,
        warningTime: warningTime,
        prioritizeDuplicates: prioritizeDuplicates,
        whitelist: whitelist
    });
    
    showStatus('Settings saved! ✓');
});

function showStatus(message, isError = false) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#EF4444' : '#10B981';
    
    if (!isError) {
        setTimeout(() => {
            statusEl.textContent = '';
        }, 2000);
    }
}
