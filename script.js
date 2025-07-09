const appContainer = document.getElementById('app-container');
let fullMarketData = null;
let animationInterval = null; // 用于控制动画的定时器

// *** 路由系统 (增加停止动画逻辑) ***
async function router() {
    stopAnimation(); // 切换页面时，确保停止动画
    showLoading();
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page'); const symbol = params.get('symbol'); const sector = params.get('sector');

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
async function renderStockDetailPage(symbol) { /* (此函数保持不变) */ }
const nameDictionary = { /* (此对象保持不变) */ };
window.addEventListener('popstate', router);
document.addEventListener('DOMContentLoaded', router);
let resizeTimeout;
window.addEventListener('resize', () => { /* (此函数保持不变) */ });