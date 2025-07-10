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
        
        if (clientDataCache[decodedSector]) {
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

// --- 【UI优化】为底部的图例(Legend)添加文字说明 ---
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
                <div class="legend-item"><div class="legend-color-box loss-5"></div><span>< -3%</span></div>
                <div class="legend-item"><div class="legend-color-box loss-3"></div><span>-1%</span></div>
                <div class="legend-item"><div class="legend-color-box flat"></div><span>0%</span></div>
                <div class="legend-item"><div class="legend-color-box gain-3"></div><span>+1%</span></div>
                <div class="legend-item"><div class="legend-color-box gain-5"></div><span>> +3%</span></div>
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
        const totalMarketCap = data.reduce((sum, stock) => sum + stock.market_cap, 0);
        const capRatio = 0.22;
        const capValue = totalMarketCap * capRatio;

        itemsToLayout = data.map(s => ({ 
            ...s, 
            value: Math.min(s.market_cap, capValue) 
        })).sort((a,b) => b.value - a.value);
    }
    
    squarify(itemsToLayout, { x: 0, y: 0, width: totalWidth, height: totalHeight }, container, groupIntoSectors);
}

// --- 【代码优化】为复杂的布局算法添加清晰的注释 ---
/**
 * 主布局函数，递归地将项目填充到给定的矩形区域中
 * @param {Array} items - 需要布局的对象数组 (每个对象必须有 .value 属性)
 * @param {Object} rect - 当前可用矩形区域 {x, y, width, height}
 * @param {HTMLElement} parentEl - 用于放置生成元素的父容器
 * @param {boolean} isSectorLevel - 标记当前是否在布局行业板块
 */
function squarify(items, rect, parentEl, isSectorLevel) {
    // 递归终止条件
    if (!items.length) return;

    let row = [];
    let i = 0;
    // 判断当前矩形是宽的还是高的
    const isHorizontal = rect.width >= rect.height;
    // 获取较短的边长，用于计算长宽比
    const side = isHorizontal ? rect.height : rect.width;

    // Squarify 算法的核心：迭代地找到能组成“最佳”行/列的元素集合
    while (i < items.length) {
        const item = items[i];
        const newRow = [...row, item];
        // 如果当前行是空的，或者加入新元素后，行的“方块化”程度没有变差，则继续添加
        if (row.length === 0 || worst(row, side) >= worst(newRow, side)) {
            row.push(item);
            i++;
        } else {
            break; // 否则，说明找到了最佳分割点，停止添加
        }
    }

    const rowValue = row.reduce((sum, item) => sum + item.value, 0);
    const totalValueInRect = items.reduce((sum, item) => sum + item.value, 0);
    // 根据当前行的总价值，计算它应占用的长度（宽或高）
    const rowSize = (rowValue / totalValueInRect) * (isHorizontal ? rect.width : rect.height);
    
    let rowRect;
    let remainingRect;

    // 计算当前行和剩余区域的矩形范围
    if (isHorizontal) {
        rowRect = { x: rect.x, y: rect.y, width: rowSize, height: rect.height };
        remainingRect = { x: rect.x + rowSize, y: rect.y, width: rect.width - rowSize, height: rect.height };
    } else {
        rowRect = { x: rect.x, y: rect.y, width: rect.width, height: rowSize };
        remainingRect = { x: rect.x, y: rect.y + rowSize, width: rect.width, height: rect.height - rowSize };
    }

    // 渲染当前行/列的所有元素
    layoutRow(row, rowRect, parentEl, isSectorLevel);
    // 对剩余的区域和项目进行递归布局
    squarify(items.slice(i), remainingRect, parentEl, isSectorLevel);
}

/**
 * 布局单行/单列内的所有元素
 * @param {Array} row - 一行/一列中的所有元素
 * @param {Object} rect - 分配给这一行/一列的矩形区域
 * @param {HTMLElement} parentEl - 父容器
 * @param {boolean} isSectorLevel - 是否是行业层级
 */
function layoutRow(row, rect, parentEl, isSectorLevel) {
    const totalValue = row.reduce((sum, item) => sum + item.value, 0);
    if (totalValue <= 0) return;

    // 在行内，方向是与外层相反的
    const isHorizontal = rect.width < rect.height; 

    for (const item of row) {
        const proportion = item.value / totalValue;
        const itemWidth = isHorizontal ? rect.width : rect.width * proportion;
        const itemHeight = isHorizontal ? rect.height * proportion : rect.height;
        
        // 创建并渲染DOM元素
        if (isSectorLevel) {
            const sectorEl = document.createElement('div');
            sectorEl.className = 'treemap-sector';
            sectorEl.style.left = `${rect.x}px`;
            sectorEl.style.top = `${rect.y}px`;
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
            // 对行业内部进行递归布局
            squarify(item.items, { x: 0, y: titleHeight, width: itemWidth - 4, height: itemHeight - titleHeight - 4 }, sectorEl, false);
        } else {
            const stockEl = createStockElement(item, itemWidth, itemHeight);
            stockEl.style.left = `${rect.x}px`;
            stockEl.style.top = `${rect.y}px`;
            parentEl.appendChild(stockEl);
        }

        // 更新下一个元素的位置
        if (isHorizontal) {
            rect.y += itemHeight;
        } else {
            rect.x += itemWidth;
        }
    }
}

/**
 * 计算一组矩形在给定边长下的最差长宽比
 * @param {Array} row - 一组元素
 * @param {number} side - 固定的边长
 * @returns {number} - 最大的长宽比 (越接近1越好)
 */
function worst(row, side) {
    if (!row.length) return Infinity;
    const sum = row.reduce((s, item) => s + item.value, 0);
    if(sum <= 0) return Infinity;
    
    const s2 = sum * sum;
    const side2 = side * side;
    let max = 0;
    let min = Infinity;

    for (const item of row) {
        if (item.value > max) max = item.value;
        if (item.value < min) min = item.value;
    }
    
    return Math.max( (side2 * max) / s2, s2 / (side2 * min) );
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
    if (area > 9000) {
        stockDiv.classList.add('font-size-xl');
    } else if (area > 3500) {
        stockDiv.classList.add('font-size-lg');
    } else if (area > 1200) {
        stockDiv.classList.add('font-size-md');
    } else if (area > 500) {
        stockDiv.classList.add('font-size-sm');
    } else {
        stockDiv.classList.add('font-size-xs');
    }
    
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