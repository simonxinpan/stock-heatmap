// --- 模拟API数据 (V2.0 - 扩大版) ---
const stockDatabase = [
    // 信息技术
    { ticker: 'AAPL', name_zh: '苹果', sector: '信息技术', market_cap: 2980, base_change: 1.25 },
    { ticker: 'MSFT', name_zh: '微软', sector: '信息技术', market_cap: 2810, base_change: -0.45 },
    { ticker: 'NVDA', name_zh: '英伟达', sector: '信息技术', market_cap: 2200, base_change: 3.10 },
    { ticker: 'AVGO', name_zh: '博通', sector: '信息技术', market_cap: 610, base_change: -1.2 },
    { ticker: 'ORCL', name_zh: '甲骨文', sector: '信息技术', market_cap: 340, base_change: 0.8 },
    { ticker: 'CRM', name_zh: '赛富时', sector: '信息技术', market_cap: 290, base_change: -2.1 },
    { ticker: 'AMD', name_zh: '超威半导体', sector: '信息技术', market_cap: 285, base_change: 2.5 },
    { ticker: 'QCOM', name_zh: '高通', sector: '信息技术', market_cap: 180, base_change: 1.1 },
    { ticker: 'INTC', name_zh: '英特尔', sector: '信息技术', market_cap: 175, base_change: -0.8 },

    // 通讯服务
    { ticker: 'GOOGL', name_zh: '谷歌', sector: '通讯服务', market_cap: 1700, base_change: 0.05 },
    { ticker: 'META', name_zh: 'Meta', sector: '通讯服务', market_cap: 1200, base_change: 1.5 },
    { ticker: 'NFLX', name_zh: '奈飞', sector: '通讯服务', market_cap: 260, base_change: -1.8 },
    { ticker: 'DIS', name_zh: '迪士尼', sector: '通讯服务', market_cap: 210, base_change: 0.3 },

    // 非必需消费品
    { ticker: 'AMZN', name_zh: '亚马逊', sector: '非必需消费品', market_cap: 1800, base_change: -2.50 },
    { ticker: 'TSLA', name_zh: '特斯拉', sector: '非必需消费品', market_cap: 850, base_change: 4.20 },
    { ticker: 'HD', name_zh: '家得宝', sector: '非必需消费品', market_cap: 350, base_change: 0.90 },
    { ticker: 'MCD', name_zh: '麦当劳', sector: '非必需消费品', market_cap: 210, base_change: -0.1 },
    { ticker: 'NKE', name_zh: '耐克', sector: '非必需消费品', market_cap: 160, base_change: 1.4 },

    // 医疗健康
    { ticker: 'LLY', name_zh: '礼来', sector: '医疗健康', market_cap: 740, base_change: 0.60 },
    { ticker: 'UNH', name_zh: '联合健康', sector: '医疗健康', market_cap: 450, base_change: 1.30 },
    { ticker: 'JNJ', name_zh: '强生', sector: '医疗健康', market_cap: 380, base_change: -0.2 },
    { ticker: 'MRK', name_zh: '默克', sector: '医疗健康', market_cap: 310, base_change: 0.9 },
    { ticker: 'PFE', name_zh: '辉瑞', sector: '医疗健康', market_cap: 160, base_change: -1.1 },

    // 金融
    { ticker: 'JPM', name_zh: '摩根大通', sector: '金融', market_cap: 530, base_change: -1.90 },
    { ticker: 'V', name_zh: 'Visa', sector: '金融', market_cap: 460, base_change: 0.88 },
    { ticker: 'MA', name_zh: '万事达', sector: '金融', market_cap: 430, base_change: 1.2 },
    { ticker: 'BAC', name_zh: '美国银行', sector: '金融', market_cap: 280, base_change: -2.3 },
    { ticker: 'WFC', name_zh: '富国银行', sector: '金融', market_cap: 200, base_change: -2.8 },
    
    // 能源
    { ticker: 'XOM', name_zh: '埃克森美孚', sector: '能源', market_cap: 470, base_change: 2.5 },
    { ticker: 'CVX', name_zh: '雪佛龙', sector: '能源', market_cap: 290, base_change: 2.1 },
    
    // 必需消费品
    { ticker: 'PG', name_zh: '宝洁', sector: '必需消费品', market_cap: 380, base_change: 0.2 },
    { ticker: 'COST', name_zh: '好市多', sector: '必需消费品', market_cap: 320, base_change: 0.7 },
    { ticker: 'KO', name_zh: '可口可乐', sector: '必需消费品', market_cap: 260, base_change: 0.1 },
    { ticker: 'WMT', name_zh: '沃尔玛', sector: '必需消费品', market_cap: 480, base_change: -0.3 },

    // 工业
    { ticker: 'CAT', name_zh: '卡特彼勒', sector: '工业', market_cap: 180, base_change: -0.5 },
    { ticker: 'BA', name_zh: '波音', sector: '工业', market_cap: 120, base_change: -3.2 },
];

// 模拟API调用
async function fetchStockData() {
    console.log("正在获取最新模拟数据...");
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return stockDatabase.map(stock => ({
        ...stock,
        change_percent: (stock.base_change + (Math.random() - 0.5)).toFixed(2)
    }));
}

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
    container.innerHTML = ''; 

    for (const sectorName in groupedData) {
        const sectorData = groupedData[sectorName];
        
        const sectorEl = document.createElement('div');
        sectorEl.className = 'sector';
        sectorEl.style.setProperty('--sector-weight', sectorData.total_market_cap);
        
        // === 功能更新：创建可点击的板块标题 ===
        const titleLink = document.createElement('a');
        titleLink.className = 'sector-title-link';
        // 暂时指向'#'，为第二步功能做准备
        titleLink.href = '#'; 
        titleLink.onclick = (e) => {
            e.preventDefault(); // 阻止页面跳转
            alert(`您点击了【${sectorName}】板块，该功能将在第二步中实现！`);
        };
        
        const titleEl = document.createElement('h2');
        titleEl.className = 'sector-title';
        titleEl.textContent = `${sectorName} (${sectorData.stocks.length}支)`;
        
        titleLink.appendChild(titleEl); // 把h2放入a标签中
        sectorEl.appendChild(titleLink); // 把a标签放入板块容器
        
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
            changeSpan.textContent = `${change >= 0 ? '+' : ''}${stock.change_percent}%`;

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