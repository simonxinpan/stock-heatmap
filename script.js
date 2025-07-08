const appContainer = document.getElementById('app-container');
let fullMarketData = null; 

// --- 路由系统 (保持不变) ---
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
            <main class="heatmap-grid-container"></main> <!-- 使用新的容器类 -->
            <footer class="legend">
                <div class="legend-item"><div class="legend-color-box loss-strong"></div><span>< -2%</span></div>
                <div class="legend-item"><div class="legend-color-box loss-medium"></div><span>-1%</span></div>
                <div class="legend-item"><div class="legend-color-box flat"></div><span>0%</span></div>
                <div class="legend-item"><div class="legend-color-box gain-medium"></div><span>+1%</span></div>
                <div class="legend-item"><div class="legend-color-box gain-strong"></div><span>> +2%</span></div>
            </footer>`;
        renderAdvancedHeatmap(fullMarketData, appContainer.querySelector('.heatmap-grid-container'));
    } catch (error) {
        appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
    }
}

// **核心重构：使用CSS Grid的先进布局**
function renderAdvancedHeatmap(allStocks, container) {
    container.innerHTML = '';
    
    // 按市值降序排列
    allStocks.sort((a, b) => b.market_cap - a.market_cap);

    // 动态计算每个股票的Grid跨度
    const totalMarketCap = allStocks.reduce((sum, stock) => sum + stock.market_cap, 0);
    const baseGridSize = 100; // 假设我们的网格有100x100个单元

    allStocks.forEach(stock => {
        const proportion = stock.market_cap / totalMarketCap;
        // 简化的算法来决定跨度，保证大公司更大
        const area = Math.max(proportion * baseGridSize * 5, 1); // 乘以一个系数放大差距，最小为1
        const span = Math.round(Math.sqrt(area)); // 开方来得到大致的行列跨度

        const stockLink = document.createElement('a');
        stockLink.className = 'stock-link grid-view';
        stockLink.href = `/?page=stock&symbol=${stock.ticker}`;
        stockLink.onclick = (e) => navigate(e, stockLink.href);
        // 通过CSS变量传递grid跨度
        stockLink.style.setProperty('--grid-span', span);

        const stockDiv = document.createElement('div');
        const change = parseFloat(stock.change_percent);
        stockDiv.className = `stock ${getColorClass(change)}`;
        
        // **BUG修复**: 从stock对象里直接获取已翻译的sector
        const sectorName = stock.sector || '其他';
        
        stockDiv.innerHTML = `
            <span class="stock-sector-label">${sectorName}</span>
            <span class="stock-ticker">${stock.ticker}</span>
            <span class="stock-name-zh">${stock.name_zh}</span>
            <span class="stock-change">${change >= 0 ? '+' : ''}${change ? change.toFixed(2) : '0.00'}%</span>`;
        
        stockLink.appendChild(stockDiv);
        container.appendChild(stockLink);
    });
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
    // 这个函数保持不变
    try {
        showLoading(); // 添加加载提示
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