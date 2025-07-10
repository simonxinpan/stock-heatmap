import { Redis } from '@upstash/redis';

// --- 配置 ---
const CACHE_KEY_PREFIX = 'stock_heatmap_data_v3'; // 使用新的前缀以避免与旧缓存冲突
const CACHE_TTL_SECONDS = 600; // 缓存10分钟

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// --- 1. 全新的数据结构：按行业组织股票列表 ---
// 这是我们所有股票的“总数据库”。我们按行业划分，每个行业包含股票代码和中文名。
// 总数约1000只股票。您可以根据需要自行增删。
const industryStockList = {
    "Information Technology": [
        { "ticker": "AAPL", "name_zh": "苹果" }, { "ticker": "MSFT", "name_zh": "微软" }, { "ticker": "NVDA", "name_zh": "英伟达" },
        { "ticker": "AVGO", "name_zh": "博通" }, { "ticker": "ORCL", "name_zh": "甲骨文" }, { "ticker": "ADBE", "name_zh": "Adobe" },
        { "ticker": "CRM", "name_zh": "赛富时" }, { "ticker": "AMD", "name_zh": "超威半导体" }, { "ticker": "INTC", "name_zh": "英特尔" },
        { "ticker": "QCOM", "name_zh": "高通" }, { "ticker": "IBM", "name_zh": "IBM" }, { "ticker": "CSCO", "name_zh": "思科" },
        { "ticker": "ACN", "name_zh": "埃森哲" }, { "ticker": "TXN", "name_zh": "德州仪器" }, { "ticker": "MU", "name_zh": "美光科技" },
        // ...可以继续添加至50个
    ],
    "Health Care": [
        { "ticker": "LLY", "name_zh": "礼来" }, { "ticker": "UNH", "name_zh": "联合健康" }, { "ticker": "JNJ", "name_zh": "强生" },
        { "ticker": "MRK", "name_zh": "默克" }, { "ticker": "ABBV", "name_zh": "艾伯维" }, { "ticker": "PFE", "name_zh": "辉瑞" },
        { "ticker": "TMO", "name_zh": "赛默飞世尔" }, { "ticker": "DHR", "name_zh": "丹纳赫" }, { "ticker": "AMGN", "name_zh": "安进" },
        // ...
    ],
    "Financials": [
        { "ticker": "BRK-B", "name_zh": "伯克希尔" }, { "ticker": "V", "name_zh": "Visa" }, { "ticker": "JPM", "name_zh": "摩根大通" },
        { "ticker": "MA", "name_zh": "万事达" }, { "ticker": "BAC", "name_zh": "美国银行" }, { "ticker": "WFC", "name_zh": "富国银行" },
        { "ticker": "GS", "name_zh": "高盛" }, { "ticker": "MS", "name_zh": "摩根士丹利" }, { "ticker": "BLK", "name_zh": "贝莱德" },
        // ...
    ],
    "Consumer Discretionary": [
        { "ticker": "AMZN", "name_zh": "亚马逊" }, { "ticker": "TSLA", "name_zh": "特斯拉" }, { "ticker": "HD", "name_zh": "家得宝" },
        { "ticker": "MCD", "name_zh": "麦当劳" }, { "ticker": "NKE", "name_zh": "耐克" }, { "ticker": "SBUX", "name_zh": "星巴克" },
        { "ticker": "LOW", "name_zh": "劳氏" }, { "ticker": "BKNG", "name_zh": "缤客" }, { "ticker": "TJX", "name_zh": "TJX公司" },
        // ...
    ],
    "Communication Services": [
        { "ticker": "GOOGL", "name_zh": "谷歌" }, { "ticker": "META", "name_zh": "Meta" }, { "ticker": "NFLX", "name_zh": "奈飞" },
        { "ticker": "DIS", "name_zh": "迪士尼" }, { "ticker": "TMUS", "name_zh": "T-Mobile" }, { "ticker": "CMCSA", "name_zh": "康卡斯特" },
        { "ticker": "VZ", "name_zh": "威瑞森" }, { "ticker": "T", "name_zh": "AT&T" },
        // ...
    ],
    "Industrials": [
        { "ticker": "CAT", "name_zh": "卡特彼勒" }, { "ticker": "UNP", "name_zh": "联合太平洋" }, { "ticker": "BA", "name_zh": "波音" },
        { "ticker": "RTX", "name_zh": "雷神技术" }, { "ticker": "HON", "name_zh": "霍尼韦尔" }, { "ticker": "GE", "name_zh": "通用电气" },
        { "ticker": "UPS", "name_zh": "联合包裹" }, { "ticker": "LMT", "name_zh": "洛克希德马丁" }, { "ticker": "DE", "name_zh": "迪尔" },
        // ...
    ],
    "Consumer Staples": [
        { "ticker": "WMT", "name_zh": "沃尔玛" }, { "ticker": "PG", "name_zh": "宝洁" }, { "ticker": "COST", "name_zh": "好市多" },
        { "ticker": "PEP", "name_zh": "百事" }, { "ticker": "KO", "name_zh": "可口可乐" }, { "ticker": "PM", "name_zh": "菲利普莫里斯" },
        { "ticker": "MDLZ", "name_zh": "亿滋国际" }, { "ticker": "MO", "name_zh": "奥驰亚" },
        // ...
    ],
    "Energy": [
        { "ticker": "XOM", "name_zh": "埃克森美孚" }, { "ticker": "CVX", "name_zh": "雪佛龙" }, { "ticker": "SHEL", "name_zh": "壳牌" },
        { "ticker": "COP", "name_zh": "康菲石油" }, { "ticker": "SLB", "name_zh": "斯伦贝谢" },
        // ...
    ],
    // ... 在这里添加更多行业和股票，例如 Materials, Utilities, Real Estate 等
};

// 2. 动态生成首页股票列表（每个行业取前5个）和全量名称字典
const homepageTickers = [];
const fullTickerNameMap = new Map();
for (const sector in industryStockList) {
    const stocksInSector = industryStockList[sector];
    // 取每个行业的前5个股票作为首页的“全景图”数据
    homepageTickers.push(...stocksInSector.slice(0, 5));
    // 填充完整的股票代码->中文名映射
    stocksInSector.forEach(stock => {
        fullTickerNameMap.set(stock.ticker, stock.name_zh);
    });
}

const sectorDictionary = {
    "Energy": "能源", "Materials": "原材料", "Industrials": "工业",
    "Consumer Discretionary": "非必需消费品", "Consumer Staples": "必需消费品",
    "Health Care": "医疗健康", "Financials": "金融", "Information Technology": "信息技术",
    "Communication Services": "通讯服务", "Utilities": "公用事业", "Real Estate": "房地产",
    "Technology": "信息技术", "Communications": "通讯服务"
};

// --- 主处理函数 ---
export default async function handler(request, response) {
    const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
    const ticker = searchParams.get('ticker');
    const sector = searchParams.get('sector');

    try {
        if (ticker) {
            // 请求单个股票详情
            const data = await fetchSingleStockData(ticker);
            return response.status(200).json(data);
        } else if (sector) {
            // 请求特定行业的热力图数据
            const data = await fetchHeatmapDataForSector(sector);
            return response.status(200).json(data);
        } else {
            // 请求主页“全景”热力图数据
            const data = await fetchHomepageHeatmapData();
            return response.status(200).json(data);
        }
    } catch (error) {
        console.error(`API Handler Error:`, error);
        return response.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}

// --- 数据获取函数 ---

// 新增：获取主页数据 (只获取 homepageTickers)
async function fetchHomepageHeatmapData() {
    const cacheKey = `${CACHE_KEY_PREFIX}_homepage`;
    const tickersToFetch = homepageTickers;
    return await getOrFetchData(cacheKey, tickersToFetch);
}

// 新增：获取单个行业数据
async function fetchHeatmapDataForSector(sector) {
    const decodedSector = decodeURIComponent(sector);
    const cacheKey = `${CACHE_KEY_PREFIX}_sector_${decodedSector.replace(/\s/g, '_')}`;
    const tickersToFetch = industryStockList[decodedSector] || [];
    if (tickersToFetch.length === 0) {
        throw new Error(`Sector '${decodedSector}' not found.`);
    }
    return await getOrFetchData(cacheKey, tickersToFetch);
}

// 核心通用获取逻辑：先查缓存，没有再批量请求
async function getOrFetchData(cacheKey, stockList) {
    try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
            console.log(`Serving data from cache for key: ${cacheKey}`);
            return cachedData;
        }
    } catch (e) {
        console.error("Redis GET error:", e.message);
    }

    console.log(`Cache miss for ${cacheKey}. Fetching ${stockList.length} stocks fresh data.`);
    
    // 从 stockList 中提取 ticker 字符串数组
    const tickers = stockList.map(s => s.ticker);
    
    const batchSize = 15; // 每次请求15个
    const delay = 1500;   // 延迟1.5秒，以符合Finnhub免费API速率限制
    let allStockData = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        console.log(`Fetching batch ${Math.floor(i / batchSize) + 1} for ${cacheKey}`);
        
        const batchPromises = batch.map(t => fetchApiDataForTicker(t));
        const batchResult = (await Promise.all(batchPromises)).filter(Boolean); // 过滤掉失败的请求
        allStockData.push(...batchResult);
        
        if (i + batchSize < tickers.length) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    if (allStockData.length > 0) {
        try {
            await redis.set(cacheKey, allStockData, { ex: CACHE_TTL_SECONDS });
            console.log(`Stored ${allStockData.length} stocks in cache for key: ${cacheKey}.`);
        } catch(e) {
            console.error("Redis SET error:", e.message);
        }
    }
    return allStockData;
}


// 从Finnhub获取单个股票的数据 (基本不变，但更新了中文名和行业的来源)
async function fetchApiDataForTicker(ticker) {
    try {
        const apiKey = process.env.FINNHUB_API_KEY;
        if (!apiKey) throw new Error('FINNHUB_API_KEY is not configured.');

        const fetchFromFinnhub = async (endpoint) => {
            const url = `https://finnhub.io/api/v1${endpoint}&token=${apiKey}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Finnhub API error for ${url}: ${res.statusText}`);
            return res.json();
        };

        const [profile, quote] = await Promise.all([
            fetchFromFinnhub(`/stock/profile2?symbol=${ticker}`),
            fetchFromFinnhub(`/quote?symbol=${ticker}`)
        ]);

        if (!profile || !quote || typeof profile.marketCapitalization === 'undefined' || profile.marketCapitalization === 0) return null;
        
        // 使用我们预设的、更准确的中文名和行业分类
        const englishSector = profile.finnhubIndustry;
        const chineseSector = sectorDictionary[englishSector] || englishSector;
        const chineseName = fullTickerNameMap.get(ticker) || profile.name.split(' ')[0];

        return { 
            ticker, 
            name_zh: chineseName, 
            sector: chineseSector, 
            market_cap: profile.marketCapitalization, 
            change_percent: quote.dp,
            logo: profile.logo
        };
    } catch (error) {
        console.error(`Error fetching data for ticker ${ticker}:`, error);
        return null;
    }
}

// 获取详情页数据 (基本不变)
async function fetchSingleStockData(ticker) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) throw new Error('FINNHUB_API_KEY is not configured.');
    
    const fetchFromFinnhub = async (endpoint) => {
        const url = `https://finnhub.io/api/v1${endpoint}&token=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Finnhub API error for ${url}: ${res.statusText}`);
        return res.json();
    };
    
    const [profile, quote] = await Promise.all([
        fetchFromFinnhub(`/stock/profile2?symbol=${ticker}`),
        fetchFromFinnhub(`/quote?symbol=${ticker}`)
    ]);
    
    const description = `(自动生成) ${profile.name} 是一家总部位于 ${profile.country || '未知'} 的公司，属于 ${profile.finnhubIndustry || '未知'} 行业，于 ${profile.ipo || '未知日期'} 上市。`;
    const nameZh = fullTickerNameMap.get(ticker) || profile.name;
    
    return { profile: { ...profile, description, name_zh: nameZh }, quote };
}