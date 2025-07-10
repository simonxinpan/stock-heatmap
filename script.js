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
        document.title = `${decodedSector} - 行业热力图`;

        if (clientDataCache[decodedSector]) {
            renderHomePage(clientDataCache[decodedSector], decodedSector);
        } else {
            try {
                const res = await fetch(`/api/stocks?sector=${sector}`);
                if (!res.ok) throw new Error('获取行业数据失败');
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

// --- 页面渲染模块 ---
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

    //【动画修改】在最外层包裹一个 .view-container 用于动画
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
        const stocksBySector = groupDataBySector(data);
        
        // 【面积上限修改】开始
        const totalMarketCap = Object.values(stocksBySector).reduce((sum, sector) => sum + sector.total_market_cap, 0);
        const capRatio = 0.15; // 设置上限为总市值的15% (即总面积的1/6.6)，可以调整这个值
        const capValue = totalMarketCap * capRatio;
        // 【面积上限修改】结束

        itemsToLayout = Object.entries(stocksBySector).map(([sectorName, sectorData]) => ({
            name: sectorName,
            // 【面积上限修改】应用上限
            value: Math.min(sectorData.total_market_cap, capValue),
            original_name: sectorData.original_name, 
            items: sectorData.stocks.map(s => ({ ...s, value: s.market_cap }))
        })).sort((a, b) => b.value - a.value);
    } else {
        itemsToLayout = data.map(s => ({ ...s, value: s.market_cap })).sort((a,b) => b.market_cap - a.market_cap);
    }
    
    // 使用 Squarified Treemap 算法
    squarify(itemsToLayout, 0, 0, totalWidth, totalHeight, container, groupIntoSectors);
}

// --- Squarified Treemap 核心算法 ---
function squarify(items, x, y, width, height, parentEl, isSectorLevel) {
    if (!items.length) return;

    let row = [];
    let i = 0;
    const totalValue = items.reduce((sum, item) => sum + item.value, 0);

    // 确定是水平分割还是垂直分割
    const isHorizontal = width >= height;

    while (i < items.length) {
        const remainingItems = items.slice(i);
        const item = remainingItems[0];
        
        // 计算当前行和添加新项目后的行的最差长宽比
        const worstCurrent = worstAspectRatio(row, isHorizontal ? height : width, totalValue);
        const worstWithNew = worstAspectRatio([...row, item], isHorizontal ? height : width, totalValue);

        if (row.length > 0 && worstWithNew > worstCurrent) {
            // 如果添加新项目会使长宽比变差，则先布局当前行
            const rowValue = row.reduce((sum, item) => sum + item.value, 0);
            const rowSize = (rowValue / totalValue) * (isHorizontal ? width : height);
            
            if (isHorizontal) {
                layoutRow(row, x, y, rowSize, height, parentEl, isSectorLevel);
                x += rowSize;
                width -= rowSize;
            } else {
                layoutRow(row, x, y, width, rowSize, parentEl, isSectorLevel);
                y += rowSize;
                height -= rowSize;
            }
            break; // 结束当前循环，让外层函数用剩余项目再次调用 squarify
        } else {
            row.push(item);
            i++;
        }
    }

    // 布局剩余的行（或者第一行）
    if (row.length > 0) {
        layoutRow(row, x, y, width, height, parentEl, isSectorLevel);
    }
}

function layoutRow(row, x, y, width, height, parentEl, isSectorLevel) {
    const totalValue = row.reduce((sum, item) => sum + item.value, 0);
    if (totalValue <= 0) return;

    const isHorizontal = width >= height;
    
    for (const item of row) {
        const itemProportion = item.value / totalValue;
        const itemWidth = isHorizontal ? width : width * itemProportion;
        const itemHeight = isHorizontal ? height * itemProportion : height;

        if (isSectorLevel) {
            const sectorEl = document.createElement('div');
            sectorEl.className = 'treemap-sector';
            sectorEl.style.left = `${x}px`;
            sectorEl.style.top = `${y}px`;
            sectorEl.style.width = `${itemWidth}px`;
            sectorEl.style.height = `${itemHeight}px`;

            const titleLink = document.createElement('a');
            titleLink.className = 'treemap-title-link';
            titleLink.href = `/?sector=${encodeURIComponent(item.original_name)}`;
            titleLink.onclick = (e) => navigate(e, titleLink.href);
            titleLink.innerHTML = `<h2 class="treemap-title">${item.name}</h2>`;
            sectorEl.appendChild(titleLink);
            parentEl.appendChild(sectorEl);

            const titleHeight = titleLink.offsetHeight > 0 ? titleLink.offsetHeight : 28;
            // 递归调用 squarify 布局行业内部
            squarify(item.items, 0, titleHeight, itemWidth - 4, itemHeight - titleHeight - 4, sectorEl, false);
        } else {
            const stockEl = createStockElement(item, itemWidth, itemHeight);
            stockEl.style.left = `${x}px`;
            stockEl.style.top = `${y}px`;
            parentEl.appendChild(stockEl);
        }

        if (isHorizontal) {
            y += itemHeight;
        } else {
            x += itemWidth;
        }
    }
}

function worstAspectRatio(row, fixedSide, totalValue) {
    if (!row.length) return Infinity;
    const rowValue = row.reduce((sum, item) => sum + item.value, 0);
    if (rowValue <= 0) return Infinity;

    const rowArea = (rowValue / totalValue) * fixedSide * fixedSide;
    let maxRatio = 0;
    
    for (const item of row) {
        const itemArea = (item.value / rowValue) * rowArea;
        const ratio = Math.max(
            (fixedSide * fixedSide * item.value) / (rowArea * rowValue),
            (rowArea * rowValue) / (fixedSide * fixedSide * item.value)
        );
        if (ratio > maxRatio) maxRatio = ratio;
    }
    return maxRatio;
}
// --- Squarified Treemap 算法结束 ---

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
    
    stockDiv.innerHTML = `
        <span class="stock-ticker">${stock.ticker}</span>
        <span class="stock-name-zh">${stock.name_zh}</span>
        <span class="stock-change">${change >= 0 ? '+' : ''}${change ? change.toFixed(2) : '0.00'}%</span>`;
    
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
    if(window.location.pathname + window.location.search === path) return; // 避免重复导航
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

        //【动画修改】在最外层包裹一个 .view-container 用于动画
        appContainer.innerHTML = `
            <div class="view-container">
                <header class="header">
                    <h1>${nameZh} ${profile.name} (${profile.ticker})</h1>
                    <a href="javascript:history.back()" class="back-link" onclick="event.preventDefault(); window.history.back();">← 返回上一页</a>
                </header>
                <div class="stock-detail-page">
                    <main class="main-content">
                        <div class="card">
                            <div class="stock-header">
                                <div class="stock-identity">
                                    <img src="${profile.logo}" alt="${profile.name} Logo" class="stock-logo" onerror="this.style.display='none'">
                                    <div class="stock-name"><h1>${profile.name}</h1><p>${profile.exchange}: ${profile.ticker}</p></div>
                                </div>
                                <div class="stock-price-info">
                                    <div class="current-price">${(quote.c || 0).toFixed(2)} <span class="price-change ${changeClass}">${change >= 0 ? '+' : ''}${changeAmount.toFixed(2)} (${change.toFixed(2)}%)</span></div>
                                    <div class="market-status">数据来源: Finnhub</div>
                                </div>
                            </div>
                        </div>
                        <section class="chart-section">
                           <div class="chart-svg-container" style="display:flex; align-items:center; justify-content:center; min-height: 400px; background-color: #f8f9fa;">
                             <p style="color: #999;">K线图功能正在开发中...</p>
                           </div>
                         </section>
                    </main>
                    <aside class="right-sidebar">
                        <div class="card"><h2 class="card-title">关于 ${nameZh}</h2><p class="company-info-text">${profile.description || '暂无公司简介。'}</p><div class="summary-item"><span class="label">市值</span><span class="value">${marketCapBillion}B USD</span></div><div class="summary-item"><span class="label">行业</span><span class="value">${profile.finnhubIndustry || 'N/A'}</span></div><div class="summary-item"><span class="label">官网</span><span class="value"><a href="${profile.weburl}" target="_blank" rel="noopener noreferrer">${profile.weburl ? profile.weburl.replace(/^(https?:\/\/)?(www\.)?/, '') : 'N/A'}</a></span></div></div>
                    </aside>
                </div>
            </div>`;
    } catch (error) {
        console.error('Error rendering stock detail page:', error);
        appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
    }
}

// --- 程序入口与事件监听 ---
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