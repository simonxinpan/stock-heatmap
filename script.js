const appContainer = document.getElementById('app-container');
let fullMarketData = null;
let animationInterval = null;

function showLoading() { appContainer.innerHTML = `<div class="loading-indicator"><div class="spinner"></div><p>数据加载中...</p></div>`; }

async function router() {
    stopAnimation();
    showLoading();
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page'), symbol = params.get('symbol'), sector = params.get('sector');
    if (page === 'stock' && symbol) { await renderStockDetailPage(symbol); } 
    else { document.title = '股票热力图'; await renderHomePage(sector ? decodeURIComponent(sector) : null); }
}

async function renderHomePage(sectorName = null) {
    try {
        if (!fullMarketData) {
            const res = await fetch('/api/stocks');
            if (!res.ok) { const errorData = await res.json(); throw new Error(errorData.error || '获取市场数据失败'); }
            fullMarketData = await res.json();
        }
        let dataToRender = fullMarketData;
        let headerHtml;
        if (sectorName) {
            dataToRender = fullMarketData.filter(stock => stock.sector === sectorName);
            document.title = `${sectorName} - 行业热力图`;
            headerHtml = `<header class="header"><h1>${sectorName}</h1><a href="/" class="back-link" onclick="navigate(event, '/')">← 返回全景图</a></header>`;
        } else {
            headerHtml = `<header class="header"><h1>股票热力图</h1><div>
                <button id="animation-toggle" class="demo-button">启动"霓虹灯计划"</button>
                <span class="data-source">标普500指数 (S&P 500)</span></div></header>`;
        }
        appContainer.innerHTML = `${headerHtml}<main id="heatmap-container-final" class="heatmap-container-final"></main><footer class="legend"><div class="legend-item"><div style="background-color: var(--loss-5);" class="legend-color-box"></div></div><div class="legend-item"><div style="background-color: var(--loss-3);" class="legend-color-box"></div></div><div class="legend-item"><div style="background-color: var(--flat-bg);" class="legend-color-box"></div></div><div class="legend-item"><div style="background-color: var(--gain-3);" class="legend-color-box"></div></div><div class="legend-item"><div style="background-color: var(--gain-5);" class="legend-color-box"></div></div></footer>`;
        if(sectorName) appContainer.querySelector('.legend').style.display = 'none';
        
        const toggleBtn = document.getElementById('animation-toggle');
        if (toggleBtn) toggleBtn.addEventListener('click', toggleAnimation);

        setTimeout(() => {
            const container = document.getElementById('heatmap-container-final');
            if (container) { generateTreemap(dataToRender, container, !sectorName); }
        }, 0);
    } catch (error) { appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`; }
}

function toggleAnimation() { const btn = document.getElementById('animation-toggle'); if (animationInterval) { stopAnimation(); btn.textContent = '启动"霓虹灯计划"'; btn.classList.remove('active'); } else { startAnimation(); btn.textContent = '停止动画'; btn.classList.add('active'); } }
function startAnimation() { if (animationInterval) return; fetchAndUpdateQuotes(); animationInterval = setInterval(fetchAndUpdateQuotes, 15000); }
function stopAnimation() { if (animationInterval) { clearInterval(animationInterval); animationInterval = null; } }

async function fetchAndUpdateQuotes() {
    const currentViewStocks = getCurrentViewStocks();
    if (!currentViewStocks || currentViewStocks.length === 0) return;
    const tickers = currentViewStocks.map(s => s.ticker);
    try {
        const res = await fetch('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickers }) });
        if (!res.ok) throw new Error('Failed to fetch quotes');
        const latestQuotes = await res.json();
        latestQuotes.forEach(quote => {
            const stockToUpdate = fullMarketData.find(s => s.ticker === quote.ticker);
            if (stockToUpdate && typeof quote.dp === 'number') { stockToUpdate.change_percent = quote.dp; updateStockDOM(stockToUpdate); }
        });
    } catch (error) { console.error(error); }
}

function updateStockDOM(stock) { const stockLink = document.querySelector(`a[href*="symbol=${stock.ticker}"]`); if (!stockLink) return; const stockDiv = stockLink.querySelector('.stock'); if (!stockDiv) return; const changeEl = stockDiv.querySelector('.stock-change'); if(changeEl) { changeEl.textContent = `${stock.change_percent >= 0 ? '+' : ''}${stock.change_percent.toFixed(2)}%`; } const newColorClass = getColorClass(stock.change_percent); const detailClass = stockDiv.className.match(/detail-\w+/); stockDiv.className = `stock ${newColorClass} ${detailClass ? detailClass[0] : ''}`; }
function getCurrentViewStocks() { const params = new URLSearchParams(window.location.search); const sector = params.get('sector'); return sector ? fullMarketData.filter(s => s.sector === decodeURIComponent(sector)) : fullMarketData; }
function generateTreemap(data, container, groupIntoSectors) { /* ... (保持不变) ... */ }
function createStockElement(stock, width, height) { /* ... (保持不变) ... */ }
function groupDataBySector(data) { /* ... (保持不变) ... */ }
function getColorClass(change) { /* ... (保持不变) ... */ }
function navigate(event, path) { /* ... (保持不变) ... */ }
async function renderStockDetailPage(symbol) { /* ... (保持不变) ... */ }
const nameDictionary = { /* ... (保持不变) ... */ };
window.addEventListener('popstate', router);
document.addEventListener('DOMContentLoaded', router);
window.addEventListener('resize', () => { /* ... (保持不变) ... */ });