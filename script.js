// --- 配置 ---
const config = {
    // 现在我们调用自己的API代理，而不是直接调用Finnhub
    apiEndpoint: '/api/stocks', 
    updateInterval: 60000, // 每60秒刷新一次
};

// --- 前端数据获取模块 ---
async function fetchStockData() {
    try {
        // 请求我们自己的服务器端函数
        const response = await fetch(config.apiEndpoint);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch stock data from server.');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching data from our API:', error);
        // 将错误信息传递出去，以便在UI上显示
        throw error; 
    }
}

// --- 渲染逻辑 (与之前版本完全一致, 无需修改) ---
function groupDataBySector(data) {
    const grouped = data.reduce((acc, stock) => {
        const sector = stock.sector || '其他';
        if (!acc[sector]) {
            acc[sector] = { stocks: [], total_market_cap: 0 };
        }
        acc[sector].stocks.push(stock);
        acc[sector].total_market_cap += stock.market_cap;
        return acc;
    }, {});

    return Object.entries(grouped)
        .sort(([, a], [, b]) => b.total_market_cap - a.total_market_cap)
        .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
}

function getColorClass(change) {
    if (change > 2) return 'gain-strong';
    if (change > 0.5) return 'gain-medium';
    if (change > 0) return 'gain-weak';
    if (change < -2) return 'loss-strong';
    if (change < -0.5) return 'loss-medium';
    if (change < 0) return 'loss-weak';
    return 'flat';
}

function renderHeatmap(groupedData) {
    const container = document.getElementById('heatmap-container');
    container.innerHTML = ''; 

    for (const sectorName in groupedData) {
        const sectorData = groupedData[sectorName];
        
        const sectorEl = document.createElement('div');
        sectorEl.className = 'sector';
        sectorEl.style.setProperty('--sector-weight', sectorData.total_market_cap);
        
        const titleLink = document.createElement('a');
        titleLink.className = 'sector-title-link';
        titleLink.href = '#'; 
        titleLink.onclick = (e) => {
            e.preventDefault();
            alert(`您点击了【${sectorName}】板块，该功能将在下一阶段实现！`);
        };
        
        const titleEl = document.createElement('h2');
        titleEl.className = 'sector-title';
        titleEl.textContent = `${sectorName} (${sectorData.stocks.length}支)`;
        
        titleLink.appendChild(titleEl);
        sectorEl.appendChild(titleLink);
        
        const stockContainerEl = document.createElement('div');
        stockContainerEl.className = 'stock-container';
        
        sectorData.stocks.sort((a,b) => b.market_cap - a.market_cap);
        
        sectorData.stocks.forEach(stock => {
            const stockLink = document.createElement('a');
            stockLink.className = 'stock-link';
            stockLink.href = `https://www.tradingview.com/chart/?symbol=${stock.ticker}`;
            stockLink.target = '_blank';
            stockLink.style.setProperty('--market-cap-weight', stock.market_cap);

            const stockDiv = document.createElement('div');
            const change = parseFloat(stock.change_percent);
            stockDiv.className = `stock ${getColorClass(change)}`;
            
            const tickerSpan = document.createElement('span');
            tickerSpan.className = 'stock-ticker';
            tickerSpan.textContent = stock.ticker;

            const nameZhSpan = document.createElement('span');
            nameZhSpan.className = 'stock-name-zh';
            nameZhSpan.textContent = stock.name_zh;

            const changeSpan = document.createElement('span');
            changeSpan.className = 'stock-change';
            changeSpan.textContent = `${change >= 0 ? '+' : ''}${change ? change.toFixed(2) : 'N/A'}%`;

            stockDiv.appendChild(tickerSpan);
            stockDiv.appendChild(nameZhSpan);
            stockDiv.appendChild(changeSpan);
            stockLink.appendChild(stockDiv);
            stockContainerEl.appendChild(stockLink);
        });
        
        sectorEl.appendChild(stockContainerEl);
        container.appendChild(sectorEl);
    }
}


// --- 主程序入口 ---
async function main() {
    try {
        const rawData = await fetchStockData();
        const groupedData = groupDataBySector(rawData);
        renderHeatmap(groupedData);
    } catch (error) {
        console.error("加载热力图失败:", error);
        document.getElementById('heatmap-container').innerHTML = 
            `<div class="loading-indicator">${error.message}</div>`;
    }
}

// 首次加载
main();

// 定时刷新
setInterval(main, config.updateInterval);