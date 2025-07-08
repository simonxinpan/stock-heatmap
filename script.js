const appContainer = document.getElementById('app-container');
let fullMarketData = null; 

// --- 路由系统 ---
// 根据URL参数决定渲染哪个页面
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
        
        // 使用setTimeout确保容器已挂载到DOM，可以获取其尺寸
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
    const totalMarketCap = allStocks.reduce((sum, stock) => sum + stock.market_cap, 0);

    const stocksBySector = groupDataBySector(allStocks);

    let sectors = Object.entries(stocksBySector).map(([sectorName, sectorData]) => ({
        name: sectorName,
        value: sectorData.total_market_cap, // 使用通用'value'字段
        items: sectorData.stocks.map(s => ({ ...s, value: s.market_cap })) // 股票也用'value'
    })).sort((a, b) => b.value - a.value);

    // 启动布局
    layout(sectors, 0, 0, totalWidth, totalHeight, true); // true表示这是第一层(板块)

    function layout(items, x, y, width, height, isSectorLevel) {
        if (!items.length) return;
        
        const totalValue = items.reduce((sum, item) => sum + item.value, 0);
        if (totalValue === 0) return;

        let currentItem = items[0];
        let itemProportion = currentItem.value / totalValue;
        
        // 决定是横向分割还是纵向分割
        let isHorizontal = width > height;
        
        let itemEl;
        
        if (isSectorLevel) {
            // --- 渲染板块 ---
            itemEl = document.createElement('div');
            itemEl.className = 'treemap-sector';
            
            const titleEl = document.createElement('h2');
            titleEl.className = 'treemap-title';
            titleEl.textContent = currentItem.name;
            itemEl.appendChild(titleEl);
            
            // 递归渲染板块内的股票
            const titleHeight = 30; // 假设标题栏高度为30px
            layout(currentItem.items, 0, titleHeight, width, height - titleHeight, false);

        } else {
            // --- 渲染股票 ---
            itemEl = createStockElement(currentItem);
        }
        
        // 设置位置和尺寸
        container.appendChild(itemEl); // 先添加才能计算
        if (isHorizontal) {
            let itemWidth = width * itemProportion;
            itemEl.style.left = `${x}px`;
            itemEl.style.top = `${y}px`;
            itemEl.style.width = `${itemWidth}px`;
            itemEl.style.height = `${height}px`;
            // 递归处理剩余部分
            layout(items.slice(1), x + itemWidth, y, width - itemWidth, height, isSectorLevel);
        } else {
            let itemHeight = height * itemProportion;
            itemEl.style.left = `${x}px`;
            itemEl.style.top = `${y}px`;
            itemEl.style.width = `${width}px`;
            itemEl.style.height = `${itemHeight}px`;
            // 递归处理剩余部分
            layout(items.slice(1), x, y + itemHeight, width, height - itemHeight, isSectorLevel);
        }
    }
}

function createStockElement(stock) {
    const stockLink = document.createElement('a');
    stockLink.className = 'treemap-stock';
    stockLink.href = `/?page=stock&symbol=${stock.ticker}`;
    stockLink.onclick = (e) => navigate(e, stockLink.href);

    const stockDiv = document.createElement('div');
    const change = parseFloat(stock.change_percent);
    stockDiv.className = `stock ${getColorClass(change)}`;
    stockDiv.innerHTML = `
        <span class="stock-ticker">${stock.ticker}</span>
        <span class="stock-name-zh">${stock.name_zh}</span>
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
// 监听窗口大小变化，重新渲染treemap
window.addEventListener('resize', () => {
    // 使用一个简单的debounce来防止过于频繁的重绘
    let timeout;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        if (fullMarketData && !new URLSearchParams(window.location.search).get('page')) {
            const container = document.getElementById('heatmap-container-final');
            if(container) generateTreemap(fullMarketData, container);
        }
    }, 200);
});