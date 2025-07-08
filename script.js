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
            <main class="heatmap-container-v3"></main> <!-- 使用新的、最终版容器类 -->
            <footer class="legend">
                <div class="legend-item"><div class="legend-color-box loss-strong"></div><span>< -2%</span></div>
                <div class="legend-item"><div class="legend-color-box loss-medium"></div><span>-1%</span></div>
                <div class="legend-item"><div class="legend-color-box flat"></div><span>0%</span></div>
                <div class="legend-item"><div class="legend-color-box gain-medium"></div><span>+1%</span></div>
                <div class="legend-item"><div class="legend-color-box gain-strong"></div><span>> +2%</span></div>
            </footer>
            `;
        renderFinalHeatmap(fullMarketData, appContainer.querySelector('.heatmap-container-v3'));
    } catch (error) {
        appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
    }
}

// **最终版热力图渲染逻辑**
function renderFinalHeatmap(allStocks, container) {
    container.innerHTML = '';
    
    // 1. 按行业分组
    const stocksBySector = groupDataBySector(allStocks);

    // 2. 遍历每个板块并渲染
    for (const sectorName in stocksBySector) {
        const sectorData = stocksBySector[sectorName];

        // 创建板块容器
        const sectorEl = document.createElement('div');
        sectorEl.className = 'sector-v3';
        // 板块的面积由其总市值决定
        sectorEl.style.flexGrow = sectorData.total_market_cap;

        // 创建板块标题
        const titleEl = document.createElement('h2');
        titleEl.className = 'sector-title-v3';
        titleEl.textContent = sectorName; // 直接使用已翻译的中文名
        sectorEl.appendChild(titleEl);

        // 创建板块内的股票容器
        const stockContainerEl = document.createElement('div');
        stockContainerEl.className = 'stock-container-v3';
        
        // 渲染板块内的每只股票
        sectorData.stocks.forEach(stock => {
            const stockLink = document.createElement('a');
            stockLink.className = 'stock-link-v3';
            stockLink.href = `/?page=stock&symbol=${stock.ticker}`;
            stockLink.onclick = (e) => navigate(e, stockLink.href);
            // 股票在板块内的面积由其市值决定
            stockLink.style.flexGrow = stock.market_cap;

            const stockDiv = document.createElement('div');
            const change = parseFloat(stock.change_percent);
            stockDiv.className = `stock ${getColorClass(change)}`;
            
            stockDiv.innerHTML = `
                <span class="stock-ticker">${stock.ticker}</span>
                <span class="stock-name-zh">${stock.name_zh}</span>
                <span class="stock-change">${change >= 0 ? '+' : ''}${change ? change.toFixed(2) : '0.00'}%</span>`;
            
            stockLink.appendChild(stockDiv);
            stockContainerEl.appendChild(stockLink);
        });

        sectorEl.appendChild(stockContainerEl);
        container.appendChild(sectorEl);
    }
}


// **BUG修复：按中文行业名分组**
function groupDataBySector(data) {
    const grouped = data.reduce((acc, stock) => {
        // 使用已翻译的sector字段进行分组
        const sector = stock.sector || '其他'; 
        if (!acc[sector]) {
            acc[sector] = { stocks: [], total_market_cap: 0 };
        }
        acc[sector].stocks.push(stock);
        acc[sector].total_market_cap += stock.market_cap;
        return acc;
    }, {});
    
    // 按板块总市值排序
    return Object.entries(grouped)
        .sort(([, a], [, b]) => b.total_market_cap - a.total_market_cap)
        .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
}


// --- 保持不变的函数 ---

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
    // 省略，与上一版完全相同
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