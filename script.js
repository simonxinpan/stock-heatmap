const appContainer = document.getElementById('app-container');
// *** 1. 引入前端数据缓存 ***
// 我们将在这里存储已加载的数据（全景图或特定行业数据），避免重复请求
let clientDataCache = {}; 
let currentView = { type: 'homepage', key: 'homepage' }; // 跟踪当前视图

// --- 路由和数据控制中心 ---
async function router() {
    showLoading();
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const symbol = params.get('symbol');
    const sector = params.get('sector');

    if (page === 'stock' && symbol) {
        // 渲染股票详情页
        currentView = { type: 'detail', key: symbol };
        await renderStockDetailPage(symbol);
    } else if (sector) {
        // *** 2. 渲染行业热力图页 ***
        const decodedSector = decodeURIComponent(sector);
        currentView = { type: 'sector', key: decodedSector };
        document.title = `${decodedSector} - 行业热力图`;

        if (clientDataCache[decodedSector]) {
            // 如果缓存中有数据，直接渲染
            renderHomePage(clientDataCache[decodedSector], decodedSector);
        } else {
            // 否则，从API获取该行业数据
            try {
                const res = await fetch(`/api/stocks?sector=${sector}`);
                if (!res.ok) throw new Error('获取行业数据失败');
                const sectorData = await res.json();
                clientDataCache[decodedSector] = sectorData; // 存入缓存
                renderHomePage(sectorData, decodedSector);
            } catch (error) {
                appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
            }
        }
    } else {
        // *** 3. 渲染主页“全景图” ***
        currentView = { type: 'homepage', key: 'homepage' };
        document.title = '股票热力图 - 全景图';
        
        if (clientDataCache['homepage']) {
            // 如果缓存中有数据，直接渲染
            renderHomePage(clientDataCache['homepage'], null);
        } else {
            // 否则，从API获取主页数据
            try {
                const res = await fetch('/api/stocks');
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || '获取市场数据失败');
                }
                const homepageData = await res.json();
                clientDataCache['homepage'] = homepageData; // 存入缓存
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

// *** 4. 升级主页渲染函数，使其只负责“渲染”，不负责“获取” ***
function renderHomePage(dataToRender, sectorName = null) {
    let headerHtml;

    if (sectorName) {
        // 行业视图的标题
        headerHtml = `
            <header class="header">
                <h1>${sectorName}</h1>
                <a href="/" class="back-link" onclick="navigate(event, '/')">← 返回全景图</a>
            </header>`;
    } else {
        // 主页“全景图”的标题
        headerHtml = `<header class="header"><h1>股票热力图 - 全景图</h1><div class="data-source">S&P 500 精选</div></header>`;
    }

    appContainer.innerHTML = `
        ${headerHtml}
        <main id="heatmap-container-final" class="heatmap-container-final"></main>
        <footer class="legend">
            <div class="legend-item"><div class="legend-color-box loss-5"></div></div>
            <div class="legend-item"><div class="legend-color-box loss-3"></div></div>
            <div class="legend-item"><div class="legend-color-box flat"></div></div>
            <div class="legend-item"><div class="legend-color-box gain-3"></div></div>
            <div class="legend-item"><div class="legend-color-box gain-5"></div></div>
        </footer>
    `;
    
    // 行业视图不显示图例说明
    if (sectorName) {
        appContainer.querySelector('.legend').style.display = 'none';
    }

    // 延迟渲染以确保容器已就位
    setTimeout(() => {
        const container = document.getElementById('heatmap-container-final');
        if (container) {
            // 主页需要分组，行业页不需要
            const shouldGroup = !sectorName; 
            generateTreemap(dataToRender, container, shouldGroup);
        }
    }, 0);
}

// --- Treemap布局算法和渲染 (这部分代码几乎不变，只是行业链接的逻辑微调) ---
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
        itemsToLayout = Object.entries(stocksBySector).map(([sectorName, sectorData]) => ({
            name: sectorName,
            value: sectorData.total_market_cap,
            // 注意这里我们传递了原始的英文行业名，用于URL
            original_name: sectorData.original_name, 
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

        // 对第一行/列进行特殊处理，确保它们能填满空间
        let i = 1;
        let sum = 0;
        let row = [];
        const isHorizontal = width > height;
        const length = isHorizontal ? width : height;

        while(i <= items.length){
            const newRow = items.slice(0, i);
            const newSum = newRow.reduce((s, item) => s + item.value, 0);
            
            // 使用Squarified Treemap的优化算法，找到最佳分割点
            const newAspectRatio = calculateWorstAspectRatio(newRow, length, newSum / totalValue);
            const oldAspectRatio = calculateWorstAspectRatio(row, length, sum / totalValue);
            
            if(row.length > 0 && newAspectRatio > oldAspectRatio) {
                break;
            }
            row = newRow;
            sum = newSum;
            i++;
        }

        const remainingItems = items.slice(row.length);
        const proportion = sum / totalValue;
        
        let rowX = x, rowY = y;
        let rowWidth = isHorizontal ? width : width * proportion;
        let rowHeight = isHorizontal ? height * proportion : height;
        
        // 递归布局当前行/列
        layoutRow(row, rowX, rowY, rowWidth, rowHeight, parentEl, isSectorLevel);

        // 递归布局剩余部分
        if (remainingItems.length > 0) {
            if (isHorizontal) {
                layout(remainingItems, x, y + rowHeight, width, height - rowHeight, parentEl, isSectorLevel);
            } else {
                layout(remainingItems, x + rowWidth, y, width - rowWidth, height, parentEl, isSectorLevel);
            }
        }
    }
    
    function layoutRow(row, x, y, width, height, parentEl, isSectorLevel) {
        const totalValue = row.reduce((sum, item) => sum + item.value, 0);
        if (totalValue <= 0) return;
        
        const isHorizontal = width > height;

        for (let i = 0; i < row.length; i++) {
            const item = row[i];
            const proportion = item.value / totalValue;
            
            let itemX = x, itemY = y;
            let itemWidth = isHorizontal ? width * proportion : width;
            let itemHeight = isHorizontal ? height : height * proportion;

            if (isSectorLevel) {
                const sectorEl = document.createElement('div');
                sectorEl.className = 'treemap-sector';
                sectorEl.style.left = `${itemX}px`;
                sectorEl.style.top = `${itemY}px`;
                sectorEl.style.width = `${itemWidth}px`;
                sectorEl.style.height = `${itemHeight}px`;

                // 链接到行业页，使用英文名作为URL参数
                const titleLink = document.createElement('a');
                titleLink.className = 'treemap-title-link';
                // *** 5. 使用原始英文名创建URL ***
                titleLink.href = `/?sector=${encodeURIComponent(item.original_name)}`;
                titleLink.onclick = (e) => navigate(e, titleLink.href);
                titleLink.innerHTML = `<h2 class="treemap-title">${item.name}</h2>`; // 显示中文名
                sectorEl.appendChild(titleLink);
                parentEl.appendChild(sectorEl);

                const titleHeight = titleLink.offsetHeight > 0 ? titleLink.offsetHeight : 28;
                layout(item.items, 0, titleHeight, itemWidth - 4, itemHeight - titleHeight - 4, sectorEl, false);
            } else {
                const stockEl = createStockElement(item, itemWidth, itemHeight);
                stockEl.style.left = `${itemX}px`;
                stockEl.style.top = `${itemY}px`;
                parentEl.appendChild(stockEl);
            }
            
            if (isHorizontal) {
                x += itemWidth;
            } else {
                y += itemHeight;
            }
        }
    }
    
    function calculateWorstAspectRatio(row, length, proportion) {
        if(row.length === 0) return Infinity;
        const area = length * length * proportion;
        const rowValue = row.reduce((sum, item) => sum + item.value, 0);
        if(rowValue === 0) return Infinity;
        
        let maxRatio = 0;
        for(let item of row){
            const itemArea = area * (item.value / rowValue);
            const w = Math.sqrt(itemArea * (length/length));
            const h = itemArea / w;
            maxRatio = Math.max(maxRatio, w/h, h/w);
        }
        return maxRatio;
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
    
    stockDiv.innerHTML = `
        <span class="stock-ticker">${stock.ticker}</span>
        <span class="stock-name-zh">${stock.name_zh}</span>
        <span class="stock-change">${change >= 0 ? '+' : ''}${change ? change.toFixed(2) : '0.00'}%</span>`;
    
    stockLink.appendChild(stockDiv);
    return stockLink;
}

function groupDataBySector(data) {
    if (!data) return {};
    const sectorOriginalNameMap = {};
    const grouped = data.reduce((acc, stock) => {
        // 假设stock.sector是中文名，我们需要找到它对应的原始英文名
        // 在这个新架构下，API返回的数据已经有sector字段了
        const sector = stock.sector || '其他';
        if (!acc[sector]) {
            acc[sector] = { stocks: [], total_market_cap: 0, original_name: findOriginalSectorName(sector, data) };
        }
        acc[sector].stocks.push(stock);
        acc[sector].total_market_cap += stock.market_cap;
        return acc;
    }, {});
    
    for (const sector in grouped) {
        grouped[sector].stocks.sort((a,b) => b.market_cap - a.market_cap);
    }
    
    return grouped;
}

// 辅助函数，帮助在分组时找到原始英文行业名
// 注意：这个逻辑比较tricky，依赖于API返回的数据格式。
// 一个更稳妥的方法是让API在返回数据时同时提供中英文行业名。
// 我们的新API做到了这一点，但前端还是需要一个映射来反查。
// 在我们的新架构下，这个函数其实用处不大，因为我们直接用 sector 字段分组了。
// 为了点击链接正确，我们需要一个从中文名反查到英文名的方法。
// 最简单的办法是在 `generateTreemap` 中处理。
const sectorNameMapping = {
    "能源": "Energy", "原材料": "Materials", "工业": "Industrials",
    "非必需消费品": "Consumer Discretionary", "必需消费品": "Consumer Staples",
    "医疗健康": "Health Care", "金融": "Financials", "信息技术": "Information Technology",
    "通讯服务": "Communication Services", "公用事业": "Utilities", "房地产": "Real Estate"
};
function findOriginalSectorName(chineseName, data) {
    // 这是一个简化的实现，实际应用中可能需要更稳健的方式
    return sectorNameMapping[chineseName] || chineseName;
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

// 详情页函数（从缓存获取中文名）
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
        const high = quote.h || 0; const low = quote.l || 0;
        const currentPrice = quote.c || 0; const openPrice = quote.o || 0;
        const nameZh = profile.name_zh || ''; // 从API获取中文名

        document.title = `${nameZh} ${profile.name} (${profile.ticker}) - 股票详情`;

        appContainer.innerHTML = `
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
                                <div class="current-price">${currentPrice.toFixed(2)} <span class="price-change ${changeClass}">${change >= 0 ? '+' : ''}${changeAmount.toFixed(2)} (${change.toFixed(2)}%)</span></div>
                                <div class="market-status">数据来源: Finnhub</div>
                            </div>
                        </div>
                    </div>
                    <!-- Chart and other details here, unchanged -->
                     <section class="chart-section">
                       <div class="chart-svg-container" style="display:flex; align-items:center; justify-content:center; min-height: 400px; background-color: #f8f9fa;">
                         <p style="color: #999;">K线图功能正在开发中...</p>
                       </div>
                     </section>
                </main>
                <aside class="right-sidebar">
                    <div class="card"><h2 class="card-title">关于 ${nameZh}</h2><p class="company-info-text">${profile.description || '暂无公司简介。'}</p><div class="summary-item"><span class="label">市值</span><span class="value">${marketCapBillion}B USD</span></div><div class="summary-item"><span class="label">行业</span><span class="value">${profile.finnhubIndustry || 'N/A'}</span></div><div class="summary-item"><span class="label">官网</span><span class="value"><a href="${profile.weburl}" target="_blank" rel="noopener noreferrer">${profile.weburl ? profile.weburl.replace(/^(https?:\/\/)?(www\.)?/, '') : 'N/A'}</a></span></div></div>
                </aside>
            </div>`;
    } catch (error) {
        console.error('Error rendering stock detail page:', error);
        appContainer.innerHTML = `<div class="loading-indicator">${error.message}</div>`;
    }
}

// --- 程序入口与事件监听 ---
window.addEventListener('popstate', router);
document.addEventListener('DOMContentLoaded', router);

// *** 6. 升级 Resize 事件处理，使用前端缓存 ***
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const data = clientDataCache[currentView.key];
        if (data) {
            const container = document.getElementById('heatmap-container-final');
            if (container) {
                const isHomepage = currentView.type === 'homepage';
                generateTreemap(data, container, isHomepage);
            }
        }
    }, 250);
});

// 使用 history.back() 替代原有的 navigate(event, '/')，体验更好
window.addEventListener('popstate', (event) => {
  router();
});

// Squarified Treemap 布局算法的实现
// (由于代码较长，且您原来的代码是简化的，我这里提供一个更健壮的 squarified treemap 实现，并集成到 generateTreemap 中)
// 上面的 generateTreemap 已被一个更优化的版本替代。