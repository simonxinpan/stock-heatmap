const appContainer = document.getElementById('app-container');
let fullMarketData = null;

// --- 路由系统 ---
async function router() {
    showLoading();
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const symbol = params.get('symbol');

    if (page === 'stock' && symbol) {
        await renderStockDetailPage(symbol);
    } else {
        await renderHomePage();
    }
}

// --- 页面渲染模块 ---

function showLoading() {
    appContainer.innerHTML = `<div class="loading-indicator"><div class="spinner"></div><p>数据加载中...</p></div>`;
}

async function renderHomePage() {
    try {
        if (!fullMarketData) {
            const res = await fetch('/api/stocks');
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || '获取市场数据失败');
            }
            fullMarketData = await res.json();
        }

        appContainer.innerHTML = `
            <header class="header"><h1>股票热力图</h1><div class="data-source">标普500指数 (S&P 500)</div></header>
            <main id="heatmap-container-final" class="heatmap-container-final"></main>
            <footer class="legend">
                <div class="legend-item"><div class="legend-color-box loss-strong"></div><span>< -2%</span></div>
                <div class="legend-item"><div class="legend-color-box loss-medium"></div><span>-1%</span></div>
                <div class="legend-item"><div class="legend-color-box flat"></div><span>0%</span></div>
                <div class="legend-item"><div class="legend-color-box gain-medium"></div><span>+1%</span></div>
                <div class="legend-item"><div class="legend-color-box gain-strong"></div><span>> +2%</span></div>
            </footer>
        `;

        setTimeout(() => {
            const container = document.getElementById('heatmap-container-final');
            if (container) {
                generateTreemap(fullMarketData, container);
            }
        }, 0);
    } catch (error) {
        appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
    }
}

// --- 核心：Treemap布局算法和渲染 ---
function generateTreemap(allStocks, container) {
    container.innerHTML = '';
    const { clientWidth: totalWidth, clientHeight: totalHeight } = container;
    if (totalWidth === 0 || totalHeight === 0) return;
    const totalMarketCap = allStocks.reduce((sum, stock) => sum + stock.market_cap, 0);

    const stocksBySector = groupDataBySector(allStocks);

    let sectors = Object.entries(stocksBySector).map(([sectorName, sectorData]) => ({
        name: sectorName,
        value: sectorData.total_market_cap,
        items: sectorData.stocks.map(s => ({ ...s, value: s.market_cap }))
    })).sort((a, b) => b.value - a.value);
    
    layout(sectors, 0, 0, totalWidth, totalHeight, container, true);

    function layout(items, x, y, width, height, parentEl, isSectorLevel) {
        if (!items.length || width <= 0 || height <= 0) return;

        const totalValue = items.reduce((sum, item) => sum + item.value, 0);
        if (totalValue <= 0) return;

        let currentItem = items[0];
        let itemProportion = currentItem.value / totalValue;
        let isHorizontal = width > height;
        let itemEl;

        if (isSectorLevel) {
            itemEl = document.createElement('div');
            itemEl.className = 'treemap-sector';

            const titleEl = document.createElement('h2');
            titleEl.className = 'treemap-title';
            titleEl.textContent = currentItem.name;
            itemEl.appendChild(titleEl);

            const titleHeight = 28;
            const contentWidth = width - 4;
            const contentHeight = height - titleHeight - 2;

            if (contentWidth > 0 && contentHeight > 0) {
                layout(currentItem.items, 0, titleHeight, contentWidth, contentHeight, itemEl, false);
            }
        } else {
            let itemWidth = isHorizontal ? width * itemProportion : width;
            let itemHeight = isHorizontal ? height : height * itemProportion;
            itemEl = createStockElement(currentItem, itemWidth, itemHeight);
        }

        parentEl.appendChild(itemEl);

        let itemWidth, itemHeight;
        if (isHorizontal) {
            itemWidth = width * itemProportion;
            itemHeight = height;
            itemEl.style.left = `${x}px`;
            itemEl.style.top = `${y}px`;
            itemEl.style.width = `${itemWidth}px`;
            itemEl.style.height = `${itemHeight}px`;
            layout(items.slice(1), x + itemWidth, y, width - itemWidth, height, parentEl, isSectorLevel);
        } else {
            itemWidth = width;
            itemHeight = height * itemProportion;
            itemEl.style.left = `${x}px`;
            itemEl.style.top = `${y}px`;
            itemEl.style.width = `${itemWidth}px`;
            itemEl.style.height = `${itemHeight}px`;
            layout(items.slice(1), x, y + itemHeight, width, height - itemHeight, parentEl, isSectorLevel);
        }
    }
}

function createStockElement(stock, width, height) {
    const stockLink = document.createElement('a');
    stockLink.className = 'treemap-stock';
    stockLink.href = `/?page=stock&symbol=${stock.ticker}`;
    stockLink.onclick = (e) => navigate(e, stockLink.href);

    const stockDiv = document.createElement('div');
    const change = parseFloat(stock.change_percent);
    stockDiv.className = `stock ${getColorClass(change)}`;
    
    const area = width * height;
    if (area > 8000) {
        stockDiv.classList.add('detail-full');
    } else if (area > 3000) {
        stockDiv.classList.add('detail-medium');
    } else {
        stockDiv.classList.add('detail-small');
    }
    
    const sectorName = stock.sector || '其他';

    stockDiv.innerHTML = `
        <div class="stock-content">
            <span class="sector-label">${sectorName}</span>
            <span class="stock-ticker">${stock.ticker}</span>
            <span class="stock-name-zh">${stock.name_zh}</span>
        </div>
        <span class="stock-change">${change >= 0 ? '+' : ''}${change ? change.toFixed(2) : '0.00'}%</span>`;
    stockLink.appendChild(stockDiv);
    return stockLink;
}

// --- 辅助函数 ---
function groupDataBySector(data) {
    const grouped = data.reduce((acc, stock) => {
        const sector = stock.sector || '其他';
        if (!acc[sector]) {
            acc[sector] = { stocks: [], total_market_cap: 0 };
        }
        acc[sector].stocks.push(stock);
        acc[sector].total_market_cap += stock.market_cap;
        return acc;
    }, {});
    return grouped;
}

function getColorClass(change) {
    if (isNaN(change)) return 'flat';
    if (change > 2) return 'gain-strong';
    if (change > 1) return 'gain-medium';
    if (change > 0.2) return 'gain-weak';
    if (change < -2) return 'loss-strong';
    if (change < -1) return 'loss-medium';
    if (change < -0.2) return 'loss-weak';
    return 'flat';
}

function navigate(event, path) {
    event.preventDefault();
    window.history.pushState({}, '', path);
    router();
}

async function renderStockDetailPage(symbol) {
    try {
        showLoading();
        const res = await fetch(`/api/stocks?ticker=${symbol}`);
        if (!res.ok) throw new Error('获取股票详情失败');
        const { profile, quote } = await res.json();

        const change = quote.dp;
        const changeAmount = quote.d;
        const changeClass = change >= 0 ? 'gain' : 'loss';

        appContainer.innerHTML = `
            <header class="header">
                 <h1>${profile.name} (${profile.ticker})</h1>
                 <a href="/" class="back-link" onclick="navigate(event, '/')">返回首页</a>
            </header>
            <div class="stock-detail-page">
                <main class="main-content">
                    <div class="stock-header">
                        <div class="stock-identity">
                            <img src="${profile.logo}" alt="${profile.name} Logo" class="stock-logo">
                            <div class="stock-name">
                                <h1>${profile.name}</h1>
                                <p>${profile.exchange}: ${profile.ticker}</p>
                            </div>
                        </div>
                        <div class="stock-price-info">
                            <div class="current-price">${quote.c.toFixed(2)} <span class="price-change ${changeClass}">${change >= 0 ? '+' : ''}${changeAmount.toFixed(2)} (${change.toFixed(2)}%)</span></div>
                        </div>
                    </div>
                    <img src="https://i.imgur.com/8QeD6n2.png" alt="静态K线图" class="chart-image">
                </main>
                <aside class="right-sidebar">
                    <div class="card">
                        <h2 class="card-title">估值指标</h2>
                        <div class="summary-item"><span class="label">市值</span><span class="value">${(profile.marketCapitalization / 1000).toFixed(2)}B USD</span></div>
                        <div class="summary-item"><span class="label">总股本</span><span class="value">${(profile.shareOutstanding).toFixed(2)}B</span></div>
                        <div class="summary-item"><span class="label">52周最高</span><span class="value">${quote.h.toFixed(2)}</span></div>
                        <div class="summary-item"><span class="label">52周最低</span><span class="value">${quote.l.toFixed(2)}</span></div>
                    </div>
                </aside>
            </div>`;
    } catch (error) {
        appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
    }
}

// --- 程序入口 ---
window.addEventListener('popstate', router);
document.addEventListener('DOMContentLoaded', router);

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (fullMarketData && !new URLSearchParams(window.location.search).get('page')) {
            const container = document.getElementById('heatmap-container-final');
            if(container) {
                generateTreemap(fullMarketData, container);
            }
        }
    }, 250);
});