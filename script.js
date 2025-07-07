// --- 模拟API数据 ---
// 真实项目中，这些数据会从服务器获取
const stockDatabase = [
    { ticker: 'AAPL', name_zh: '苹果', sector: '信息技术', market_cap: 2980, base_change: 1.25 },
    { ticker: 'MSFT', name_zh: '微软', sector: '信息技术', market_cap: 2810, base_change: -0.45 },
    { ticker: 'NVDA', name_zh: '英伟达', sector: '信息技术', market_cap: 2200, base_change: 3.10 },
    { ticker: 'GOOGL', name_zh: '谷歌', sector: '通讯服务', market_cap: 1700, base_change: 0.05 },
    { ticker: 'AMZN', name_zh: '亚马逊', sector: '非必需消费品', market_cap: 1800, base_change: -3.50 },
    { ticker: 'TSLA', name_zh: '特斯拉', sector: '非必需消费品', market_cap: 850, base_change: 4.20 },
    { ticker: 'LLY', name_zh: '礼来', sector: '医疗健康', market_cap: 740, base_change: 0.60 },
    { ticker: 'JPM', name_zh: '摩根大通', sector: '金融', market_cap: 530, base_change: -1.90 },
    { ticker: 'XOM', name_zh: '埃克森美孚', sector: '能源', market_cap: 470, base_change: 2.5 },
    { ticker: 'V', name_zh: 'Visa', sector: '金融', market_cap: 460, base_change: 0.88 },
    { ticker: 'UNH', name_zh: '联合健康', sector: '医疗健康', market_cap: 450, base_change: 1.30 },
    { ticker: 'HD', name_zh: '家得宝', sector: '非必需消费品', market_cap: 350, base_change: 0.90 },
    { ticker: 'AVGO', name_zh: '博通', sector: '信息技术', market_cap: 610, base_change: -1.2 },
    { ticker: 'PG', name_zh: '宝洁', sector: '必需消费品', market_cap: 380, base_change: 0.2 },
];

// 模拟API调用，每次调用都会在基础涨跌幅上增加一点随机波动
async function fetchStockData() {
    console.log("正在获取最新模拟数据...");
    await new Promise(resolve => setTimeout(resolve, 300)); // 模拟网络延迟
    
    return stockDatabase.map(stock => ({
        ...stock,
        change_percent: (stock.base_change + (Math.random() - 0.5)).toFixed(2)
    }));
}

// --- 核心渲染逻辑 ---

// 1. 数据分组
function groupDataBySector(data) {
    const grouped = data.reduce((acc, stock) => {
        const sector = stock.sector;
        if (!acc[sector]) {
            acc[sector] = { stocks: [], total_market_cap: 0 };
        }
        acc[sector].stocks.push(stock);
        acc[sector].total_market_cap += stock.market_cap;
        return acc;
    }, {});
    
    // 按板块总市值降序排序
    return Object.entries(grouped)
        .sort(([, a], [, b]) => b.total_market_cap - a.total_market_cap)
        .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
}

// 2. 决定方块颜色
function getColorClass(change) {
    if (change > 2) return 'gain-strong';
    if (change > 0.5) return 'gain-medium';
    if (change > 0) return 'gain-weak';
    if (change < -2) return 'loss-strong';
    if (change < -0.5) return 'loss-medium';
    if (change < 0) return 'loss-weak';
    return 'flat';
}

// 3. 渲染整个热力图
function renderHeatmap(groupedData) {
    const container = document.getElementById('heatmap-container');
    container.innerHTML = ''; // 清空旧内容或加载提示

    for (const sectorName in groupedData) {
        const sectorData = groupedData[sectorName];
        
        const sectorEl = document.createElement('div');
        sectorEl.className = 'sector';
        sectorEl.style.setProperty('--sector-weight', sectorData.total_market_cap);
        
        const titleEl = document.createElement('h2');
        titleEl.className = 'sector-title';
        titleEl.textContent = `${sectorName} (${sectorData.stocks.length}支)`;
        sectorEl.appendChild(titleEl);
        
        const stockContainerEl = document.createElement('div');
        stockContainerEl.className = 'stock-container';
        
        // 按个股市值排序
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
            changeSpan.textContent = `${change > 0 ? '+' : ''}${stock.change_percent}%`;

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
            '<div class="loading-indicator">数据加载失败，请刷新页面。</div>';
    }
}

// 首次加载
main();

// 每10秒自动刷新数据
setInterval(main, 10000);