const appContainer = document.getElementById('app-container');
let fullMarketData = null; // 缓存全市场数据

// --- 路由系统 (保持不变) ---
async function router() {
    showLoading();
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const symbol = params.get('symbol');
    const sector = params.get('sector');

    if (page === 'stock' && symbol) {
        await renderStockDetailPage(symbol);
    } else if (page === 'sector' && sector) {
        // 对于全局Treemap，点击板块的逻辑需要重新设计，暂时先跳转回首页
        await renderHomePage(); 
    } else {
        await renderHomePage();
    }
}

// --- 页面渲染模块 ---

function showLoading() {
    appContainer.innerHTML = `
        <div class="loading-indicator">
            <div class="spinner"></div>
            <p>数据加载中...</p>
        </div>`;
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
            <header class="header">
                <h1>股票热力图</h1>
                <div class="data-source">标普500指数 (S&P 500)</div>
            </header>
            <main class="heatmap-container"></main> <!-- 渲染容器简化 -->
            <footer class="legend">
                <!-- 图例保持不变 -->
                <div class="legend-item"><div class="legend-color-box loss-strong"></div><span>< -2%</span></div>
                <div class="legend-item"><div class="legend-color-box loss-medium"></div><span>-1%</span></div>
                <div class="legend-item"><div class="legend-color-box flat"></div><span>0%</span></div>
                <div class="legend-item"><div class="legend-color-box gain-medium"></div><span>+1%</span></div>
                <div class="legend-item"><div class="legend-color-box gain-strong"></div><span>> +2%</span></div>
            </footer>
            `;
        renderGlobalHeatmap(fullMarketData, appContainer.querySelector('.heatmap-container'));
    } catch (error) {
        appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
    }
}

// **核心重构：渲染全局热力图**
function renderGlobalHeatmap(allStocks, container) {
    container.innerHTML = ''; // 清空容器
    
    // 按市值降序排列所有股票
    allStocks.sort((a, b) => b.market_cap - a.market_cap);
    
    // 按板块对股票进行分组，以便后续为它们添加板块标签
    const stocksBySector = groupDataBySector(allStocks);

    // 渲染每个板块及其中的股票
    for (const sectorName in stocksBySector) {
        const sectorData = stocksBySector[sectorName];
        
        // 为每个股票创建DOM元素
        sectorData.stocks.forEach(stock => {
            const stockLink = document.createElement('a');
            stockLink.className = 'stock-link global-view'; // 使用新的CSS类
            stockLink.href = `/?page=stock&symbol=${stock.ticker}`;
            stockLink.onclick = (e) => navigate(e, stockLink.href);
            // flex-grow的值现在是全局比较的
            stockLink.style.setProperty('--market-cap-weight', stock.market_cap); 

            const stockDiv = document.createElement('div');
            const change = parseFloat(stock.change_percent);
            stockDiv.className = `stock ${getColorClass(change)}`;
            
            // 在方块内部显示板块名称
            stockDiv.innerHTML = `
                <span class="stock-sector-label">${sectorName}</span>
                <span class="stock-ticker">${stock.ticker}</span>
                <span class="stock-name-zh">${stock.name_zh}</span>
                <span class="stock-change">${change >= 0 ? '+' : ''}${change ? change.toFixed(2) : '0.00'}%</span>`;
            
            stockLink.appendChild(stockDiv);
            container.appendChild(stockLink); // 直接将股票方块添加到主容器
        });
    }
}


// --- 保持不变的函数 ---

// 修复行业名分组的bug
function groupDataBySector(data) {
    const grouped = data.reduce((acc, stock) => {
        // 使用已翻译的sector字段进行分组
        const sector = stock.sector || '其他'; 
        if (!acc[sector]) acc[sector] = { stocks: [], total_market_cap: 0 };
        acc[sector].stocks.push(stock);
        acc[sector].total_market_cap += stock.market_cap;
        return acc;
    }, {});
    // 排序是为了在渲染时，让大板块的股票先出现，视觉上更聚合
    return Object.entries(grouped)
        .sort(([, a], [, b]) => b.total_market_cap - a.total_market_cap)
        .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
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
    // 这个函数保持不变
    try {
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