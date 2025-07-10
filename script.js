const appContainer = document.getElementById('app-container');
let clientDataCache = {}; 
let currentView = { type: 'homepage', key: 'homepage' }; 

// --- 路由和数据控制中心 (无修改) ---
async function router() {
    showLoading();
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const symbol = params.get('symbol');
    const sector = params.get('sector');

    if (page === 'stock' && symbol) {
        currentView = { type: 'detail', key: symbol };
        await renderStockDetailPage(symbol);
    } else if (sector) {
        const decodedSector = decodeURIComponent(sector);
        currentView = { type: 'sector', key: decodedSector };
        document.title = `${decodedSector} - 行业热力图`;

        if (clientDataCache[decodedSector]) {
            renderHomePage(clientDataCache[decodedSector], decodedSector);
        } else {
            try {
                const res = await fetch(`/api/stocks?sector=${encodeURIComponent(decodedSector)}`);
                if (!res.ok) {
                     const errorData = await res.json();
                     throw new Error(errorData.error || '获取行业数据失败');
                }
                const sectorData = await res.json();
                clientDataCache[decodedSector] = sectorData;
                renderHomePage(sectorData, decodedSector);
            } catch (error) {
                appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
            }
        }
    } else {
        currentView = { type: 'homepage', key: 'homepage' };
        document.title = '股票热力图 - 全景图';
        
        if (clientDataCache['homepage']) {
            renderHomePage(clientDataCache['homepage'], null);
        } else {
            try {
                const res = await fetch('/api/stocks');
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || '获取市场数据失败');
                }
                const homepageData = await res.json();
                clientDataCache['homepage'] = homepageData;
                renderHomePage(homepageData, null);
            } catch (error) {
                appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
            }
        }
    }
}

// --- 页面渲染模块 (无修改) ---
function showLoading() {
    appContainer.innerHTML = `<div class="loading-indicator"><div class="spinner"></div><p>数据加载中...</p></div>`;
}

function renderHomePage(dataToRender, sectorName = null) {
    let headerHtml;

    if (sectorName) {
        headerHtml = `
            <header class="header">
                <h1>${sectorName}</h1>
                <a href="/" class="back-link" onclick="navigate(event, '/')">← 返回全景图</a>
            </header>`;
    } else {
        headerHtml = `<header class="header"><h1>股票热力图 - 全景图</h1><div class="data-source">标普500 (S&P 500)</div></header>`;
    }

    appContainer.innerHTML = `
        <div class="view-container">
            ${headerHtml}
            <main id="heatmap-container-final" class="heatmap-container-final"></main>
            <footer class="legend">
                <div class="legend-item"><div class="legend-color-box loss-5"></div></div>
                <div class="legend-item"><div class="legend-color-box loss-3"></div></div>
                <div class="legend-item"><div class="legend-color-box flat"></div></div>
                <div class="legend-item"><div class="legend-color-box gain-3"></div></div>
                <div class="legend-item"><div class="legend-color-box gain-5"></div></div>
            </footer>
        </div>
    `;
    
    if (sectorName) {
        appContainer.querySelector('.legend').style.display = 'none';
    }

    setTimeout(() => {
        const container = document.getElementById('heatmap-container-final');
        if (container) {
            const shouldGroup = !sectorName; 
            generateTreemap(dataToRender, container, shouldGroup);
        }
    }, 0);
}

// --- Treemap布局算法和渲染 ---
function generateTreemap(data, container, groupIntoSectors = true) {
    container.innerHTML = '';
    const { clientWidth: totalWidth, clientHeight: totalHeight } = container;
    if (totalWidth === 0 || totalHeight === 0 || !data || data.length === 0) {
        container.innerHTML = `<div class="loading-indicator">没有可显示的数据。</div>`;
        return;
    };

    let itemsToLayout;
    if (groupIntoSectors) {
        // 首页全景图逻辑
        const stocksBySector = groupDataBySector(data);
        const totalMarketCap = Object.values(stocksBySector).reduce((sum, sector) => sum + sector.total_market_cap, 0);
        const capRatio = 0.15; // 首页：单个行业板块面积上限为15%
        const capValue = totalMarketCap * capRatio;

        itemsToLayout = Object.entries(stocksBySector).map(([sectorName, sectorData]) => ({
            name: sectorName,
            value: Math.min(sectorData.total_market_cap, capValue),
            original_name: sectorData.original_name, 
            items: sectorData.stocks.map(s => ({ ...s, value: s.market_cap }))
        })).sort((a, b) => b.value - a.value);

    } else {
        // 【修正2: 行业龙头面积上限】开始
        // 这是行业视图的逻辑
        const totalMarketCap = data.reduce((sum, stock) => sum + stock.market_cap, 0);
        const capRatio = 0.35; // 行业页：单只股票面积上限为35%，您可以调整这个值
        const capValue = totalMarketCap * capRatio;

        itemsToLayout = data.map(s => ({ 
            ...s, 
            value: Math.min(s.market_cap, capValue) 
        })).sort((a,b) => b.value - a.value);
        // 【修正2: 行业龙头面积上限】结束
    }
    
    // 【修正1: 使用更稳健的布局算法】
    // 调用全新的、修正后的布局函数
    layout({
        items: itemsToLayout,
        x: 0, y: 0,
        width: totalWidth, height: totalHeight
    }, container, groupIntoSectors);
}

// --- 【修正1: 全新的、更稳健的布局算法】 ---
function layout(area, parentEl, isSectorLevel) {
    let items = area.items;
    if (!items.length) return;

    // 按价值降序排列
    items.sort((a, b) => b.value - a.value);

    const totalValue = items.reduce((sum, item) => sum + item.value, 0);
    if (totalValue <= 0) return;

    const isHorizontal = area.width >= area.height;
    let line = [];
    let lineValue = 0;
    
    // 找到最佳分割点
    let i = 0;
    for (i = 0; i < items.length; i++) {
        const newItem = items[i];
        if (line.length === 0) {
            line.push(newItem);
            lineValue += newItem.value;
            continue;
        }

        const newLine = [...line, newItem];
        const newLineValue = lineValue + newItem.value;

        // 计算当前行和新行的长宽比
        const currentRatio = calculateAspectRatio(line, lineValue, isHorizontal ? area.height : area.width);
        const newRatio = calculateAspectRatio(newLine, newLineValue, isHorizontal ? area.height : area.width);

        if (newRatio < currentRatio) {
            line.push(newItem);
            lineValue = newLineValue;
        } else {
            break; // 找到分割点
        }
    }

    const currentLine = items.slice(0, i);
    const remainingItems = items.slice(i);
    const currentLineValue = currentLine.reduce((sum, item) => sum + item.value, 0);

    const lineAreaRatio = currentLineValue / totalValue;
    const lineLength = isHorizontal ? area.width * lineAreaRatio : area.height * lineAreaRatio;

    let subArea;
    if (isHorizontal) {
        // 水平分割，垂直排列
        subArea = { items: currentLine, x: area.x, y: area.y, width: lineLength, height: area.height };
        area.x += lineLength;
        area.width -= lineLength;
    } else {
        // 垂直分割，水平排列
        subArea = { items: currentLine, x: area.x, y: area.y, width: area.width, height: lineLength };
        area.y += lineLength;
        area.height -= lineLength;
    }
    
    renderLine(subArea, parentEl, isSectorLevel);

    area.items = remainingItems;
    layout(area, parentEl, isSectorLevel);
}

function renderLine(area, parentEl, isSectorLevel) {
    const isHorizontal = area.width >= area.height;
    const totalValue = area.items.reduce((sum, item) => sum + item.value, 0);
    if (totalValue <= 0) return;

    let currentPos = isHorizontal ? area.y : area.x;

    area.items.forEach(item => {
        const itemRatio = item.value / totalValue;
        const itemLength = (isHorizontal ? area.height : area.width) * itemRatio;
        
        const x = isHorizontal ? area.x : currentPos;
        const y = isHorizontal ? currentPos : area.y;
        const width = isHorizontal ? area.width : itemLength;
        const height = isHorizontal ? itemLength : area.height;

        if (isSectorLevel) {
            const sectorEl = document.createElement('div');
            sectorEl.className = 'treemap-sector';
            sectorEl.style.left = `${x}px`;
            sectorEl.style.top = `${y}px`;
            sectorEl.style.width = `${width}px`;
            sectorEl.style.height = `${height}px`;

            const titleLink = document.createElement('a');
            titleLink.className = 'treemap-title-link';
            titleLink.href = `/?sector=${encodeURIComponent(item.original_name)}`;
            titleLink.onclick = (e) => navigate(e, titleLink.href);
            titleLink.innerHTML = `<h2 class="treemap-title">${item.name}</h2>`;
            sectorEl.appendChild(titleLink);
            parentEl.appendChild(sectorEl);

            const titleHeight = titleLink.offsetHeight > 0 ? titleLink.offsetHeight : 28;
            // 递归调用 layout 布局行业内部
            layout({
                items: item.items,
                x: 0, y: titleHeight,
                width: width - 4, height: height - titleHeight - 4
            }, sectorEl, false);
        } else {
            const stockEl = createStockElement(item, width, height);
            stockEl.style.left = `${x}px`;
            stockEl.style.top = `${y}px`;
            parentEl.appendChild(stockEl);
        }
        
        currentPos += itemLength;
    });
}

function calculateAspectRatio(line, lineValue, sideLength) {
    if (!line.length || lineValue <= 0) return Infinity;
    const totalArea = sideLength * (lineValue / line.reduce((s,i) => s + i.value, lineValue)); // This is an approximation
    let maxRatio = 0;
    line.forEach(item => {
        const itemArea = (item.value / lineValue) * totalArea;
        const ratio = Math.max(sideLength/itemArea, itemArea/sideLength);
        if (ratio > maxRatio) maxRatio = ratio;
    });
    return maxRatio;
}
// --- 算法修正结束 ---

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
    if (area > 10000) stockDiv.classList.add('detail-xl'); else if (area > 4000) stockDiv.classList.add('detail-lg');
    else if (area > 1500) stockDiv.classList.add('detail-md'); else if (area > 600) stockDiv.classList.add('detail-sm');
    else stockDiv.classList.add('detail-xs');
    
    stockDiv.innerHTML = `<span class="stock-ticker">${stock.ticker}</span><span class="stock-name-zh">${stock.name_zh}</span><span class="stock-change">${change >= 0 ? '+' : ''}${change ? change.toFixed(2) : '0.00'}%</span>`;
    stockLink.appendChild(stockDiv);
    return stockLink;
}

function groupDataBySector(data) {
    if (!data) return {};
    return data.reduce((acc, stock) => {
        const sector = stock.sector || '其他';
        if (!acc[sector]) {
            acc[sector] = { stocks: [], total_market_cap: 0, original_name: stock.original_sector };
        }
        acc[sector].stocks.push(stock);
        acc[sector].total_market_cap += stock.market_cap;
        return acc;
    }, {});
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
    if(window.location.pathname + window.location.search === path) return;
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
        const nameZh = profile.name_zh || ''; 
        document.title = `${nameZh} ${profile.name} (${profile.ticker}) - 股票详情`;

        appContainer.innerHTML = `<div class="view-container"><header class="header"><h1>${nameZh} ${profile.name} (${profile.ticker})</h1><a href="javascript:history.back()" class="back-link" onclick="event.preventDefault(); window.history.back();">← 返回上一页</a></header><div class="stock-detail-page"><main class="main-content"><div class="card"><div class="stock-header"><div class="stock-identity"><img src="${profile.logo}" alt="${profile.name} Logo" class="stock-logo" onerror="this.style.display='none'"><div class="stock-name"><h1>${profile.name}</h1><p>${profile.exchange}: ${profile.ticker}</p></div></div><div class="stock-price-info"><div class="current-price">${(quote.c || 0).toFixed(2)} <span class="price-change ${changeClass}">${change >= 0 ? '+' : ''}${changeAmount.toFixed(2)} (${change.toFixed(2)}%)</span></div><div class="market-status">数据来源: Finnhub</div></div></div></div><section class="chart-section"><div class="chart-svg-container" style="display:flex; align-items:center; justify-content:center; min-height: 400px; background-color: #f8f9fa;"><p style="color: #999;">K线图功能正在开发中...</p></div></section></main><aside class="right-sidebar"><div class="card"><h2 class="card-title">关于 ${nameZh}</h2><p class="company-info-text">${profile.description || '暂无公司简介。'}</p><div class="summary-item"><span class="label">市值</span><span class="value">${marketCapBillion}B USD</span></div><div class="summary-item"><span class="label">行业</span><span class="value">${profile.finnhubIndustry || 'N/A'}</span></div><div class="summary-item"><span class="label">官网</span><span class="value"><a href="${profile.weburl}" target="_blank" rel="noopener noreferrer">${profile.weburl ? profile.weburl.replace(/^(https?:\/\/)?(www\.)?/, '') : 'N/A'}</a></span></div></div></aside></div></div>`;
    } catch (error) {
        console.error('Error rendering stock detail page:', error);
        appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
    }
}

window.addEventListener('popstate', router);
document.addEventListener('DOMContentLoaded', router);
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const data = clientDataCache[currentView.key];
        if (data && (currentView.type === 'homepage' || currentView.type === 'sector')) {
            const container = document.getElementById('heatmap-container-final');
            if (container) {
                const isHomepage = currentView.type === 'homepage';
                generateTreemap(data, container, isHomepage);
            }
        }
    }, 250);
});