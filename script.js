// 全局变量
const appContainer = document.getElementById('app-container');
let fullMarketData = null;
let animationInterval = null;

// --- 辅助函数 (确保所有函数都已定义) ---
function showLoading() {
    appContainer.innerHTML = `<div class="loading-indicator"><div class="spinner"></div><p>数据加载中...</p></div>`;
}

function navigate(event, path) {
    event.preventDefault();
    window.history.pushState({}, '', path);
    router();
}

function getColorClass(change) {
    if (isNaN(change) || (change > -0.01 && change < 0.01)) return 'flat';
    if (change > 3) return 'gain-5'; if (change > 2) return 'gain-4'; if (change > 1) return 'gain-3';
    if (change > 0.25) return 'gain-2'; if (change > 0) return 'gain-1';
    if (change < -3) return 'loss-5'; if (change < -2) return 'loss-4'; if (change < -1) return 'loss-3';
    if (change < -0.25) return 'loss-2'; if (change <= 0) return 'loss-1';
    return 'flat';
}

function groupDataBySector(data) {
    if (!data) return {};
    const grouped = data.reduce((acc, stock) => {
        const sector = stock.sector || '其他';
        if (!acc[sector]) { acc[sector] = { stocks: [], total_market_cap: 0 }; }
        acc[sector].stocks.push(stock);
        acc[sector].total_market_cap += stock.market_cap;
        return acc;
    }, {});
    for (const sector in grouped) { grouped[sector].stocks.sort((a, b) => b.market_cap - a.market_cap); }
    return grouped;
}

// --- 动画控制函数 ---
function toggleAnimation() {
    const btn = document.getElementById('animation-toggle');
    if (animationInterval) {
        stopAnimation();
        btn.textContent = '启动"霓虹灯计划"';
        btn.classList.remove('active');
    } else {
        startAnimation();
        btn.textContent = '停止动画';
        btn.classList.add('active');
    }
}

function startAnimation() {
    if (animationInterval) return;
    fetchAndUpdateQuotes();
    animationInterval = setInterval(fetchAndUpdateQuotes, 15000);
}

function stopAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
}

async function fetchAndUpdateQuotes() {
    const currentViewStocks = getCurrentViewStocks();
    if (!currentViewStocks || currentViewStocks.length === 0) return;
    const tickers = currentViewStocks.map(s => s.ticker);
    try {
        const res = await fetch('/api/quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tickers })
        });
        if (!res.ok) throw new Error('Failed to fetch quotes');
        const latestQuotes = await res.json();
        latestQuotes.forEach(quote => {
            const stockToUpdate = fullMarketData.find(s => s.ticker === quote.ticker);
            if (stockToUpdate && typeof quote.dp === 'number') {
                stockToUpdate.change_percent = quote.dp;
                updateStockDOM(stockToUpdate);
            }
        });
    } catch (error) { console.error(error); }
}

function updateStockDOM(stock) {
    const stockLink = document.querySelector(`a[href*="symbol=${stock.ticker}"]`);
    if (!stockLink) return;
    const stockDiv = stockLink.querySelector('.stock');
    if (!stockDiv) return;
    const changeEl = stockDiv.querySelector('.stock-change');
    if (changeEl) {
        changeEl.textContent = `${stock.change_percent >= 0 ? '+' : ''}${stock.change_percent.toFixed(2)}%`;
    }
    const newColorClass = getColorClass(stock.change_percent);
    const detailClass = stockDiv.className.match(/detail-\w+/);
    stockDiv.className = `stock ${newColorClass} ${detailClass ? detailClass[0] : ''}`;
}

function getCurrentViewStocks() {
    const params = new URLSearchParams(window.location.search);
    const sector = params.get('sector');
    return sector ? fullMarketData.filter(s => s.sector === decodeURIComponent(sector)) : fullMarketData;
}


// --- 核心渲染函数 ---
function createStockElement(stock, width, height) { /* ... (此函数与上一版相同) ... */ }
function generateTreemap(data, container, groupIntoSectors) { /* ... (此函数与上一版相同) ... */ }
async function renderStockDetailPage(symbol) { /* ... (此函数与上一版相同) ... */ }

// --- 主程序逻辑 ---
async function router() {
    stopAnimation();
    showLoading();
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page'), symbol = params.get('symbol'), sector = params.get('sector');
    if (page === 'stock' && symbol) {
        await renderStockDetailPage(symbol);
    } else {
        document.title = '股票热力图';
        await renderHomePage(sector ? decodeURIComponent(sector) : null);
    }
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
            headerHtml = `<header class="header"><h1>股票热力图</h1><div><button id="animation-toggle" class="demo-button">启动"霓虹灯计划"</button><span class="data-source">标普500指数 (S&P 500)</span></div></header>`;
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


// --- 粘贴完整的、未省略的函数定义 ---
const nameDictionary = { 'AAPL': '苹果', 'MSFT': '微软', 'GOOGL': '谷歌', 'AMZN': '亚马逊', 'NVDA': '英伟达', 'TSLA': '特斯拉', 'META': 'Meta', 'BRK-B': '伯克希尔', 'LLY': '礼来', 'V': 'Visa', 'JPM': '摩根大通', 'XOM': '埃克森美孚', 'WMT': '沃尔玛', 'UNH': '联合健康', 'MA': '万事达', 'JNJ': '强生', 'PG': '宝洁', 'ORCL': '甲骨文', 'HD': '家得宝', 'AVGO': '博通', 'MRK': '默克', 'CVX': '雪佛龙', 'PEP': '百事', 'COST': '好市多', 'ADBE': 'Adobe', 'KO': '可口可乐', 'BAC': '美国银行', 'CRM': '赛富时', 'MCD': "麦当劳", 'PFE': '辉瑞', 'NFLX': '奈飞', 'AMD': '超威半导体', 'DIS': '迪士尼', 'INTC': '英特尔', 'NKE': '耐克', 'CAT': '卡特彼勒', 'BA': '波音', 'CSCO': '思科', 'T': 'AT&T', 'UBER': '优步', 'PYPL': 'PayPal', 'QCOM': '高通', 'SBUX': '星巴克', 'IBM': 'IBM', 'GE': '通用电气', 'F': '福特汽车', 'GM': '通用汽车', 'DAL': '达美航空', 'UAL': '联合航空', 'AAL': '美国航空', 'MAR': '万豪国际', 'HLT': '希尔顿', 'BKNG': '缤客', 'EXPE': '亿客行', 'CCL': '嘉年华邮轮' };

window.addEventListener('popstate', router);
document.addEventListener('DOMContentLoaded', router);
window.addEventListener('resize', () => { /* ... */ });