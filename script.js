const appContainer = document.getElementById('app-container');
let fullMarketData = null; // 缓存全市场数据

// --- 路由系统 ---
// 页面加载或浏览器历史变化时，决定显示哪个页面
async function router() {
    showLoading();
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const symbol = params.get('symbol');
    const sector = params.get('sector');

    if (page === 'stock' && symbol) {
        await renderStockDetailPage(symbol);
    } else if (page === 'sector' && sector) {
        await renderSectorPage(sector);
    } else {
        await renderHomePage();
    }
}

// --- 页面渲染模块 ---

// 渲染加载动画
function showLoading() {
    appContainer.innerHTML = `
        <div class="loading-indicator">
            <div class="spinner"></div>
            <p>数据加载中...</p>
        </div>`;
}

// 1. 渲染主页
async function renderHomePage() {
    try {
        if (!fullMarketData) {
            fullMarketData = await fetch('/api/stocks');
            if (!fullMarketData.ok) throw new Error('Failed to fetch market data');
            fullMarketData = await fullMarketData.json();
        }
        const groupedData = groupDataBySector(fullMarketData);
        appContainer.innerHTML = `
            <header class="header">
                <h1>股票热力图</h1>
                <div class="data-source">美股发发发</div>
            </header>
            <div class="heatmap-page-container">
                <main class="heatmap-container"></main>
                <footer class="legend">
                    <div class="legend-item"><span>跌幅</span></div>
                    <div class="legend-item"><div class="legend-color-box loss-strong"></div><span>< -2%</span></div>
                    <div class="legend-item"><div class="legend-color-box loss-medium"></div><span>-1%</span></div>
                    <div class="legend-item"><div class="legend-color-box flat"></div><span>0%</span></div>
                    <div class="legend-item"><div class="legend-color-box gain-medium"></div><span>+1%</span></div>
                    <div class="legend-item"><div class="legend-color-box gain-strong"></div><span>> +2%</span></div>
                    <div class="legend-item"><span>涨幅</span></div>
                </footer>
            </div>`;
        renderHeatmap(groupedData, appContainer.querySelector('.heatmap-container'));
    } catch (error) {
        appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
    }
}

// 2. 渲染板块页
async function renderSectorPage(sectorName) {
     try {
        if (!fullMarketData) {
            fullMarketData = await fetch('/api/stocks').then(res => res.json());
        }
        const sectorData = fullMarketData.filter(stock => stock.sector === sectorName);
        const groupedData = { [sectorName]: { stocks: sectorData, total_market_cap: sectorData.reduce((acc, s) => acc + s.market_cap, 0) } };
        
        appContainer.innerHTML = `
            <header class="header">
                <h1>${decodeURIComponent(sectorName)} - 板块热力图</h1>
                <a href="/" class="back-link" onclick="navigate(event, '/')">返回全市场</a>
            </header>
            <div class="heatmap-page-container">
                <main class="heatmap-container"></main>
            </div>`;
        renderHeatmap(groupedData, appContainer.querySelector('.heatmap-container'));
    } catch (error) {
        appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
    }
}

// 3. 渲染个股详情页
async function renderStockDetailPage(symbol) {
    try {
        const res = await fetch(`/api/stocks?ticker=${symbol}`);
        if (!res.ok) throw new Error('Failed to fetch stock detail');
        const { profile, quote } = await res.json();
        
        const change = quote.dp;
        const changeAmount = quote.d;
        const changeClass = change >= 0 ? 'gain' : 'loss';

        appContainer.innerHTML = `
            <header class="header">
                 <h1>${profile.name} (${profile.ticker})</h1>
                 <a href="/" class="back-link" onclick="navigate(event, '/')">返回全市场</a>
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


// --- 渲染辅助函数 ---

// 渲染热力图的通用函数
function renderHeatmap(groupedData, container) {
    container.innerHTML = ''; 
    for (const sectorName in groupedData) {
        const sectorData = groupedData[sectorName];
        const sectorEl = document.createElement('div');
        sectorEl.className = 'sector';
        sectorEl.style.setProperty('--sector-weight', sectorData.total_market_cap);
        
        const titleLink = document.createElement('a');
        titleLink.className = 'sector-title-link';
        titleLink.href = `/?page=sector§or=${encodeURIComponent(sectorName)}`;
        titleLink.onclick = (e) => navigate(e, titleLink.href);

        const titleEl = document.createElement('h2');
        titleEl.className = 'sector-title';
        titleEl.textContent = `${sectorName} (${sectorData.stocks.length}支)`;
        titleLink.appendChild(titleEl);
        sectorEl.appendChild(titleLink);
        
        const stockContainerEl = document.createElement('div');
        stockContainerEl.className = 'stock-container';
        sectorData.stocks.sort((a,b) => b.market_cap - a.market_cap).forEach(stock => {
            const stockLink = document.createElement('a');
            stockLink.className = 'stock-link';
            stockLink.href = `/?page=stock&symbol=${stock.ticker}`;
            stockLink.onclick = (e) => navigate(e, stockLink.href);
            stockLink.style.setProperty('--market-cap-weight', stock.market_cap);

            const stockDiv = document.createElement('div');
            const change = parseFloat(stock.change_percent);
            stockDiv.className = `stock ${getColorClass(change)}`;
            stockDiv.innerHTML = `
                <span class="stock-ticker">${stock.ticker}</span>
                <span class="stock-name-zh">${stock.name_zh}</span>
                <span class="stock-change">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span>`;
            stockLink.appendChild(stockDiv);
            stockContainerEl.appendChild(stockLink);
        });
        sectorEl.appendChild(stockContainerEl);
        container.appendChild(sectorEl);
    }
}

function groupDataBySector(data) {
    const grouped = data.reduce((acc, stock) => {
        const sector = stock.sector || '其他';
        if (!acc[sector]) acc[sector] = { stocks: [], total_market_cap: 0 };
        acc[sector].stocks.push(stock);
        acc[sector].total_market_cap += stock.market_cap;
        return acc;
    }, {});
    return Object.entries(grouped)
        .sort(([, a], [, b]) => b.total_market_cap - a.total_market_cap)
        .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
}

function getColorClass(change) {
    if (change > 2) return 'gain-strong';
    if (change > 0.5) return 'gain-medium';
    if (change > 0) return 'gain-weak';
    if (change < -2) return 'loss-strong';
    if (change < -0.5) return 'loss-medium';
    if (change < 0) return 'loss-weak';
    return 'flat';
}


// --- SPA导航函数 ---
function navigate(event, path) {
    event.preventDefault();
    window.history.pushState({}, '', path);
    router();
}

// --- 程序入口 ---
window.addEventListener('popstate', router); // 监听浏览器前进/后退
document.addEventListener('DOMContentLoaded', router); // 首次加载