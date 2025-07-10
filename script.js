const appContainer = document.getElementById('app-container');
let clientDataCache = {}; 
let currentView = { type: 'homepage', key: 'homepage' }; 

// --- 路由和数据控制中心 ---
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
        
        if (clientDataCache[decodedSector]) {
            // 【修正2: 从缓存数据中获取中文名】
            const cachedData = clientDataCache[decodedSector];
            const chineseSectorName = cachedData.length > 0 ? cachedData[0].sector : decodedSector;
            document.title = `${chineseSectorName} - 行业热力图`;
            renderHomePage(cachedData, chineseSectorName);
        } else {
            try {
                const res = await fetch(`/api/stocks?sector=${encodeURIComponent(decodedSector)}`);
                if (!res.ok) {
                     const errorData = await res.json();
                     throw new Error(errorData.error || '获取行业数据失败');
                }
                const sectorData = await res.json();
                clientDataCache[decodedSector] = sectorData;
                
                // 【修正2: 从新获取的数据中获取中文名】
                const chineseSectorName = sectorData.length > 0 ? sectorData[0].sector : decodedSector;
                document.title = `${chineseSectorName} - 行业热力图`;
                renderHomePage(sectorData, chineseSectorName);

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

function showLoading() {
    appContainer.innerHTML = `<div class="loading-indicator"><div class="spinner"></div><p>数据加载中...</p></div>`;
}

// 现在的 sectorName 参数将总是中文名
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
        const capRatio = 0.12;
        const capValue = totalMarketCap * capRatio;

        itemsToLayout = Object.entries(stocksBySector).map(([englishSectorName, sectorData]) => ({
            name: sectorData.chinese_name,
            value: Math.min(sectorData.total_market_cap, capValue),
            original_name: englishSectorName,
            items: sectorData.stocks.map(s => ({ ...s, value: s.market_cap }))
        })).sort((a, b) => b.value - a.value);

    } else {
        // 行业视图逻辑
        const totalMarketCap = data.reduce((sum, stock) => sum + stock.market_cap, 0);
        
        // 【修正3: 龙头面积进一步压缩】
        const capRatio = 0.22; // 行业页：单只股票面积上限从 25% 调整为 22%
        const capValue = totalMarketCap * capRatio;

        itemsToLayout = data.map(s => ({ 
            ...s, 
            value: Math.min(s.market_cap, capValue) 
        })).sort((a,b) => b.value - a.value);
    }
    
    // 【修正1: 使用全新的、更稳健的布局算法】
    squarify(container, itemsToLayout, totalWidth, totalHeight, groupIntoSectors);
}

// --- 【修正1: 全新的、迭代式Squarified Treemap算法】 ---
function squarify(container, children, width, height, isSectorLevel) {
    const totalValue = children.reduce((sum, child) => sum + child.value, 0);

    function layout(nodes, x, y, w, h) {
        if (!nodes || nodes.length === 0) return;

        // 标准化节点值
        const total = nodes.reduce((sum, node) => sum + node.value, 0);
        if (total <= 0) return;
        nodes.forEach(node => node.normalizedValue = node.value / total * w * h);

        nodes.sort((a, b) => b.normalizedValue - a.normalizedValue);
        
        letcurrentRow = [];
        let remainingNodes = [...nodes];

        while (remainingNodes.length > 0) {
            const isHorizontal = w > h;
            const side = isHorizontal ? h : w;
            const row = findBestRow(remainingNodes, side);
            
            const rowValue = row.reduce((sum, node) => sum + node.normalizedValue, 0);
            const rowLength = rowValue / side;
            
            let currentX = x;
            let currentY = y;

            for (const node of row) {
                const nodeLength = node.normalizedValue / rowLength;
                const nodeRect = {
                    x: isHorizontal ? currentX : x,
                    y: isHorizontal ? y : currentY,
                    w: isHorizontal ? nodeLength : rowLength,
                    h: isHorizontal ? rowLength : nodeLength,
                };
                
                renderNode(container, node, nodeRect, isSectorLevel);

                if(isHorizontal) currentX += nodeLength;
                else currentY += nodeLength;
            }

            if(isHorizontal) {
                y += rowLength;
                h -= rowLength;
            } else {
                x += rowLength;
                w -= rowLength;
            }
            
            remainingNodes = remainingNodes.slice(row.length);
        }
    }

    function findBestRow(nodes, side) {
        let bestRow = [nodes[0]];
        let remaining = nodes.slice(1);
        if (remaining.length === 0) return bestRow;

        let bestRatio = worstAspectRatio(bestRow, side);

        for (let i = 1; i <= remaining.length; i++) {
            const currentRow = nodes.slice(0, i + 1);
            const currentRatio = worstAspectRatio(currentRow, side);
            if (currentRatio <= bestRatio) {
                bestRatio = currentRatio;
                bestRow = currentRow;
            } else {
                break;
            }
        }
        return bestRow;
    }

    function worstAspectRatio(row, side) {
        const sum = row.reduce((s, node) => s + node.normalizedValue, 0);
        const sum_sq = sum * sum;
        const side_sq = side * side;
        let max = 0;
        let min = Infinity;
        for(const node of row) {
             if (node.normalizedValue > max) max = node.normalizedValue;
             if (node.normalizedValue < min) min = node.normalizedValue;
        }
        return Math.max(
            (side_sq * max) / sum_sq,
            sum_sq / (side_sq * min)
        );
    }
    
    layout(children, 0, 0, width, height);
}

function renderNode(parentEl, node, rect, isSectorLevel) {
     if (isSectorLevel) {
        const sectorEl = document.createElement('div');
        sectorEl.className = 'treemap-sector';
        sectorEl.style.left = `${rect.x}px`;
        sectorEl.style.top = `${rect.y}px`;
        sectorEl.style.width = `${rect.w}px`;
        sectorEl.style.height = `${rect.h}px`;

        const titleLink = document.createElement('a');
        titleLink.className = 'treemap-title-link';
        titleLink.href = `/?sector=${encodeURIComponent(node.original_name)}`;
        titleLink.onclick = (e) => navigate(e, titleLink.href);
        titleLink.innerHTML = `<h2 class="treemap-title">${node.name}</h2>`; // 使用 node.name (中文名)
        sectorEl.appendChild(titleLink);
        parentEl.appendChild(sectorEl);

        const titleHeight = titleLink.offsetHeight > 0 ? titleLink.offsetHeight : 28;
        // 递归调用 squarify 布局行业内部
        squarify(sectorEl, node.items, rect.w - 4, rect.h - titleHeight - 4, false);
    } else {
        const stockEl = createStockElement(node, rect.w, rect.h);
        stockEl.style.left = `${rect.x}px`;
        stockEl.style.top = `${rect.y}px`;
        parentEl.appendChild(stockEl);
    }
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
        const key = stock.original_sector || '其他';
        if (!acc[key]) {
            acc[key] = { 
                stocks: [], 
                total_market_cap: 0, 
                chinese_name: stock.sector
            };
        }
        acc[key].stocks.push(stock);
        acc[key].total_market_cap += stock.market_cap;
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