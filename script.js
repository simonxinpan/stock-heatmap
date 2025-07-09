const appContainer = document.getElementById('app-container');
let fullMarketData = null;
let animationInterval = null; // 用于控制动画的定时器

// *** 1. 补全 showLoading 函数定义 ***
function showLoading() {
    appContainer.innerHTML = `<div class="loading-indicator"><div class="spinner"></div><p>数据加载中...</p></div>`;
}

// *** 2. 路由系统 (现在可以正常工作了) ***
async function router() {
    stopAnimation(); // 切换页面时，确保停止动画
    showLoading(); // 现在可以找到这个函数了
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const symbol = params.get('symbol');
    const sector = params.get('sector');

    if (page === 'stock' && symbol) {
        await renderStockDetailPage(symbol);
    } else if (sector) {
        await renderHomePage(decodeURIComponent(sector));
    } else {
        document.title = '股票热力图';
        await renderHomePage();
    }
}

// *** 主页渲染函数 (增加动画开关按钮) ***
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
        appContainer.innerHTML = `
            ${headerHtml}
            <main id="heatmap-container-final" class="heatmap-container-final"></main>
            <footer class="legend">
                <div class="legend-item"><div style="background-color: var(--loss-5);" class="legend-color-box"></div></div>
                <div class="legend-item"><div style="background-color: var(--loss-3);" class="legend-color-box"></div></div>
                <div class="legend-item"><div style="background-color: var(--flat-bg);" class="legend-color-box"></div></div>
                <div class="legend-item"><div style="background-color: var(--gain-3);" class="legend-color-box"></div></div>
                <div class="legend-item"><div style="background-color: var(--gain-5);" class="legend-color-box"></div></div>
            </footer>`;
        if(sectorName) appContainer.querySelector('.legend').style.display = 'none';
        
        const toggleBtn = document.getElementById('animation-toggle');
        if (toggleBtn) toggleBtn.addEventListener('click', toggleAnimation);

        setTimeout(() => {
            const container = document.getElementById('heatmap-container-final');
            if (container) {
                generateTreemap(dataToRender, container, !sectorName);
            }
        }, 0);
    } catch (error) {
        appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
    }
}

// *** START: 动画控制函数 ***
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
    console.log('Project Neon: Activated!');
    fetchAndUpdateQuotes();
    animationInterval = setInterval(fetchAndUpdateQuotes, 15000); // 每15秒轮询一次
}

function stopAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
        console.log('Project Neon: Deactivated!');
    }
}

async function fetchAndUpdateQuotes() {
    const currentViewStocks = getCurrentViewStocks();
    if (!currentViewStocks || currentViewStocks.length === 0) return;
    console.log(`Fetching latest quotes for ${currentViewStocks.length} stocks...`);
    
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
        console.log('Heatmap updated with latest quotes.');
    } catch (error) { console.error(error); }
}

function updateStockDOM(stock) {
    const stockLink = document.querySelector(`a[href*="symbol=${stock.ticker}"]`);
    if (!stockLink) return;
    const stockDiv = stockLink.querySelector('.stock');
    if (!stockDiv) return;
    const changeEl = stockDiv.querySelector('.stock-change');
    if(changeEl) {
        changeEl.textContent = `${stock.change_percent >= 0 ? '+' : ''}${stock.change_percent.toFixed(2)}%`;
    }
    const newColorClass = getColorClass(stock.change_percent);
    const detailClass = stockDiv.className.match(/detail-\w+/);
    stockDiv.className = `stock ${newColorClass} ${detailClass ? detailClass[0] : ''}`;
}

function getCurrentViewStocks() {
    const params = new URLSearchParams(window.location.search);
    const sector = params.get('sector');
    if (sector) {
        return fullMarketData.filter(s => s.sector === decodeURIComponent(sector));
    }
    return fullMarketData;
}
// *** END: 动画控制函数 ***


// *** 3. 补全所有其他辅助函数 ***
function generateTreemap(data, container, groupIntoSectors = true) {
    container.innerHTML = '';
    const { clientWidth: totalWidth, clientHeight: totalHeight } = container;
    if (totalWidth === 0 || totalHeight === 0 || !data) return;
    let itemsToLayout;
    if (groupIntoSectors) {
        const stocksBySector = groupDataBySector(data);
        itemsToLayout = Object.entries(stocksBySector).map(([sectorName, sectorData]) => ({
            name: sectorName, value: sectorData.total_market_cap,
            items: sectorData.stocks.map(s => ({ ...s, value: s.market_cap }))
        })).sort((a, b) => b.value - a.value);
    } else {
        itemsToLayout = data.map(s => ({ ...s, value: s.market_cap })).sort((a,b) => b.market_cap - a.market_cap);
    }
    layout(itemsToLayout, 0, 0, totalWidth, totalHeight, container, groupIntoSectors);
    function layout(items, x, y, width, height, parentEl, isSectorLevel) {
        if (!items.length || width <= 1 || height <= 1) return;
        const totalValue = items.reduce((sum, item) => sum + item.value, 0);
        if (totalValue <= 0) return;
        const currentItem = items[0];
        const itemProportion = currentItem.value / totalValue;
        const isHorizontal = width > height;
        if (isSectorLevel) {
            const sectorEl = document.createElement('div');
            sectorEl.className = 'treemap-sector';
            let itemWidth = isHorizontal ? width * itemProportion : width;
            let itemHeight = isHorizontal ? height : height * itemProportion;
            sectorEl.style.cssText = `left:${x}px; top:${y}px; width:${itemWidth}px; height:${itemHeight}px;`;
            const titleLink = document.createElement('a');
            titleLink.className = 'treemap-title-link';
            titleLink.href = `/?sector=${encodeURIComponent(currentItem.name)}`;
            titleLink.onclick = (e) => navigate(e, titleLink.href);
            titleLink.innerHTML = `<h2 class="treemap-title">${currentItem.name}</h2>`;
            sectorEl.appendChild(titleLink);
            parentEl.appendChild(sectorEl);
            const titleHeight = titleLink.offsetHeight > 0 ? titleLink.offsetHeight : 28;
            layout(currentItem.items, 0, titleHeight, itemWidth - 4, itemHeight - titleHeight - 4, sectorEl, false);
            if (isHorizontal) { layout(items.slice(1), x + itemWidth, y, width - itemWidth, height, parentEl, true); } 
            else { layout(items.slice(1), x, y + itemHeight, width, height - itemHeight, parentEl, true); }
        } else {
            let itemWidth = isHorizontal ? width * itemProportion : width;
            let itemHeight = isHorizontal ? height : height * itemProportion;
            const stockEl = createStockElement(currentItem, itemWidth, itemHeight);
            stockEl.style.cssText = `left:${x}px; top:${y}px;`;
            parentEl.appendChild(stockEl);
            if (isHorizontal) { layout(items.slice(1), x + itemWidth, y, width - itemWidth, height, parentEl, false); } 
            else { layout(items.slice(1), x, y + itemHeight, width, height - itemHeight, parentEl, false); }
        }
    }
}

function createStockElement(stock, width, height) {
    const stockLink = document.createElement('a');
    stockLink.className = 'treemap-stock';
    stockLink.href = `/?page=stock&symbol=${stock.ticker}`;
    stockLink.onclick = (e) => navigate(e, stockLink.href);
    stockLink.style.width = `${width}px`;
    stockLink.style.height = `${height}px`;
    const stockDiv = document.createElement('div');
    const change = parseFloat(stock.change_percent);
    stockDiv.className = `stock ${getColorClass(change)}`;
    const area = width * height;
    if (area > 10000) stockDiv.classList.add('detail-xl');
    else if (area > 4000) stockDiv.classList.add('detail-lg');
    else if (area > 1500) stockDiv.classList.add('detail-md');
    else if (area > 600) stockDiv.classList.add('detail-sm');
    else stockDiv.classList.add('detail-xs');
    stockDiv.innerHTML = `<span class="stock-ticker">${stock.ticker}</span><span class="stock-name-zh">${stock.name_zh}</span><span class="stock-change">${change >= 0 ? '+' : ''}${change ? change.toFixed(2) : '0.00'}%</span>`;
    stockLink.appendChild(stockDiv);
    return stockLink;
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
    for (const sector in grouped) {
        grouped[sector].stocks.sort((a,b) => b.market_cap - a.market_cap);
    }
    return grouped;
}

function getColorClass(change) {
    if (isNaN(change) || (change > -0.01 && change < 0.01)) return 'flat';
    if (change > 3) return 'gain-5'; if (change > 2) return 'gain-4'; if (change > 1) return 'gain-3';
    if (change > 0.25) return 'gain-2'; if (change > 0) return 'gain-1';
    if (change < -3) return 'loss-5'; if (change < -2) return 'loss-4'; if (change < -1) return 'loss-3';
    if (change < -0.25) return 'loss-2'; if (change <= 0) return 'loss-1';
    return 'flat';
}

function navigate(event, path) {
    event.preventDefault();
    window.history.pushState({}, '', path);
    router();
}

async function renderStockDetailPage(symbol) {
    try {
        appContainer.innerHTML = `<div class="loading-indicator"><div class="spinner"></div><p>正在加载 ${symbol} 的详细数据...</p></div>`;
        const res = await fetch(`/api/stocks?ticker=${symbol}`);
        if (!res.ok) throw new Error('获取股票详情失败');
        const { profile, quote } = await res.json();
        const change = quote.dp || 0;
        const changeAmount = quote.d || 0;
        const changeClass = change >= 0 ? 'gain' : 'loss';
        const marketCapBillion = (profile.marketCapitalization / 1000).toFixed(2);
        const shareBillion = (profile.shareOutstanding).toFixed(2);
        const high = quote.h || 0;
        const low = quote.l || 0;
        const currentPrice = quote.c || 0;
        const openPrice = quote.o || 0;
        const nameZh = nameDictionary[symbol] || '';
        document.title = `${nameZh} ${profile.name} (${symbol}) - 股票详情`;
        appContainer.innerHTML = `<header class="header"><h1>${nameZh} ${profile.name} (${symbol})</h1><a href="/" class="back-link" onclick="navigate(event, '/')">← 返回热力图</a></header><div class="stock-detail-page"><main class="main-content"><div class="card"><div class="stock-header"><div class="stock-identity"><img src="${profile.logo}" alt="${profile.name} Logo" class="stock-logo" onerror="this.style.display='none'"><div class="stock-name"><h1>${profile.name}</h1><p>${profile.exchange}: ${symbol}</p></div></div><div class="stock-price-info"><div class="current-price">${currentPrice.toFixed(2)} <span class="price-change ${changeClass}">${change >= 0 ? '+' : ''}${changeAmount.toFixed(2)} (${change.toFixed(2)}%)</span></div><div class="market-status">数据来源: Finnhub</div></div></div></div><section class="chart-section"><div class="chart-toolbar"><a href="#" class="active">日线</a><a href="#">周线</a><a href="#">月线</a></div><div class="chart-svg-container"><svg class="chart-svg" viewBox="0 0 900 500"><g class="grid"><line x1="0" y1="50" x2="900" y2="50"></line><line x1="0" y1="125" x2="900" y2="125"></line><line x1="0" y1="200" x2="900" y2="200"></line><line x1="0" y1="275" x2="900" y2="275"></line><line x1="0" y1="350" x2="900" y2="350"></line><line x1="150" y1="0" x2="150" y2="350"></line><line x1="300" y1="0" x2="300" y2="350"></line><line x1="450" y1="0" x2="450" y2="350"></line><line x1="600" y1="0" x2="600" y2="350"></line><line x1="750" y1="0" x2="750" y2="350"></line></g><text class="watermark" x="50%" y="40%">${symbol}</text><g transform="translate(50,0)"><g class="candlestick gain"><line x1="20" y1="210" x2="20" y2="280" class="wick"></line><rect x="15" y="240" width="10" height="30" class="body"></rect></g><rect class="volume-bar gain" x="15" y="420" width="10" height="30"></rect><g class="candlestick gain" transform="translate(40, 0)"><line x1="20" y1="180" x2="20" y2="250" class="wick"></line><rect x="15" y="200" width="10" height="40" class="body"></rect></g><rect class="volume-bar gain" x="55" y="410" width="10" height="40"></rect><g class="candlestick loss" transform="translate(80, 0)"><line x1="20" y1="170" x2="20" y2="210" class="wick"></line><rect x="15" y="190" width="10" height="15" class="body"></rect></g><rect class="volume-bar loss" x="95" y="430" width="10" height="20"></rect><g class="candlestick loss" transform="translate(200, 0)"><line x1="20" y1="120" x2="20" y2="180" class="wick"></line><rect x="15" y="150" width="10" height="20" class="body"></rect></g><rect class="volume-bar loss" x="215" y="400" width="10" height="50"></rect><g class="candlestick gain" transform="translate(240, 0)"><line x1="20" y1="140" x2="20" y2="220" class="wick"></line><rect x="15" y="160" width="10" height="50" class="body"></rect></g><rect class="volume-bar gain" x="255" y="380" width="10" height="70"></rect><g class="candlestick gain" transform="translate(480, 0)"><line x1="20" y1="50" x2="20" y2="120" class="wick"></line><rect x="15" y="70" width="10" height="40" class="body"></rect></g><rect class="volume-bar gain" x="495" y="410" width="10" height="40"></rect><g class="candlestick loss" transform="translate(700, 0)"><line x1="20" y1="60" x2="20" y2="150" class="wick"></line><rect x="15" y="80" width="10" height="60" class="body"></rect></g><rect class="volume-bar loss" x="715" y="420" width="10" height="30"></rect></g><path class="ma-line-1" d="M 70 250 C 150 200, 300 180, 450 150 S 600 100, 750 80"></path><path class="ma-line-2" d="M 70 260 C 150 230, 300 220, 450 180 S 600 150, 750 110"></path><g class="axis-labels"><text class="axis-label" x="905" y="55">${(high * 1.02).toFixed(2)}</text><text class="axis-label" x="905" y="130">${(high).toFixed(2)}</text><text class="axis-label" x="905" y="205">${(currentPrice).toFixed(2)}</text><text class="axis-label" x="905" y="280">${(low).toFixed(2)}</text><text class="axis-label" x="905" y="355">${(low * 0.98).toFixed(2)}</text></g><g class="time-axis-labels"><text class="time-axis-label" x="150" y="370">10月</text><text class="time-axis-label" x="300" y="370">11月</text><text class="time-axis-label" x="450" y="370">12月</text><text class="time-axis-label" x="600" y="370">1月</text><text class="time-axis-label" x="750" y="370">2月</text></g></svg></div></section></main><aside class="right-sidebar"><div class="card"><h2 class="card-title">交易面板</h2><div class="btn-group"><button class="btn sell">卖出</button><button class="btn buy">买入</button></div><div class="summary-item"><span class="label">开盘价</span><span class="value">${openPrice.toFixed(2)}</span></div><div class="summary-item"><span class="label">最高价</span><span class="value">${high.toFixed(2)}</span></div><div class="summary-item"><span class="label">最低价</span><span class="value">${low.toFixed(2)}</span></div></div><div class="card"><h2 class="card-title">关于 ${nameZh}</h2><p class="company-info-text">${profile.description || '暂无公司简介。'}</p><div class="summary-item"><span class="label">市值</span><span class="value">${marketCapBillion}B USD</span></div><div class="summary-item"><span class="label">总股本</span><span class="value">${shareBillion}B</span></div><div class="summary-item"><span class="label">行业</span><span class="value">${profile.finnhubIndustry || 'N/A'}</span></div><div class="summary-item"><span class="label">官网</span><span class="value"><a href="${profile.weburl}" target="_blank" rel="noopener noreferrer">${profile.weburl ? profile.weburl.replace(/^(https?:\/\/)?(www\.)?/, '') : 'N/A'}</a></span></div></div></aside></div>`;
    } catch (error) {
        console.error('Error rendering stock detail page:', error);
        appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
    }
}
const nameDictionary = { 'AAPL': '苹果', 'MSFT': '微软', 'GOOGL': '谷歌', 'AMZN': '亚马逊', 'NVDA': '英伟达', 'TSLA': '特斯拉', 'META': 'Meta', 'BRK-B': '伯克希尔', 'LLY': '礼来', 'V': 'Visa', 'JPM': '摩根大通', 'XOM': '埃克森美孚', 'WMT': '沃尔玛', 'UNH': '联合健康', 'MA': '万事达', 'JNJ': '强生', 'PG': '宝洁', 'ORCL': '甲骨文', 'HD': '家得宝', 'AVGO': '博通', 'MRK': '默克', 'CVX': '雪佛龙', 'PEP': '百事', 'COST': '好市多', 'ADBE': 'Adobe', 'KO': '可口可乐', 'BAC': '美国银行', 'CRM': '赛富时', 'MCD': "麦当劳", 'PFE': '辉瑞', 'NFLX': '奈飞', 'AMD': '超威半导体', 'DIS': '迪士尼', 'INTC': '英特尔', 'NKE': '耐克', 'CAT': '卡特彼勒', 'BA': '波音', 'CSCO': '思科', 'T': 'AT&T', 'UBER': '优步', 'PYPL': 'PayPal', 'QCOM': '高通', 'SBUX': '星巴克', 'IBM': 'IBM', 'GE': '通用电气', 'F': '福特汽车', 'GM': '通用汽车', 'DAL': '达美航空', 'UAL': '联合航空', 'AAL': '美国航空', 'MAR': '万豪国际', 'HLT': '希尔顿', 'BKNG': '缤客', 'EXPE': '亿客行', 'CCL': '嘉年华邮轮' };

window.addEventListener('popstate', router);
document.addEventListener('DOMContentLoaded', router);
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        const sector = params.get('sector');
        if (fullMarketData) {
            const container = document.getElementById('heatmap-container-final');
            if(container) {
                if (sector) {
                    const dataToRender = fullMarketData.filter(stock => stock.sector === decodeURIComponent(sector));
                    generateTreemap(dataToRender, container, false);
                } else {
                    generateTreemap(fullMarketData, container, true);
                }
            }
        }
    }, 250);
});