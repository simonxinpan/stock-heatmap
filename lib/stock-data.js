// === 1. 数据源：去重后的精细化行业数据库 ===
export const industryStockList = {
    "Software & Services": [
        { "ticker": "MSFT", "name_zh": "微软" }, { "ticker": "ORCL", "name_zh": "甲骨文" },
        // ... (此处省略了所有行业和股票，请确保您是从旧文件完整剪切过来的)
    ],
    // ...
    "Utilities": [
        { "ticker": "NEE", "name_zh": "新纪元能源" }, { "ticker": "DUK", "name_zh": "杜克能源" },
        // ...
    ]
};

// === 2. 行业中英文字典 ===
export const sectorDictionary = {
    "Energy": "能源",
    "Materials": "原材料",
    // ... (此处省略了所有字典项，请确保您是从旧文件完整剪切过来的)
    "Transportation": "交通运输",
};


// === 3. 动态生成的列表和映射 ===
export const homepageTickers = [];
const tempFullTickerNameMap = new Map();

for (const sector in industryStockList) {
    const stocksInSector = industryStockList[sector];
    homepageTickers.push(...stocksInSector.slice(0, 5).map(s => ({...s, sector})));
    stocksInSector.forEach(stock => {
        tempFullTickerNameMap.set(stock.ticker, stock.name_zh);
    });
}
export const fullTickerNameMap = tempFullTickerNameMap;