import { Redis } from '@upstash/redis';

// --- 配置 ---
// *** 终极必杀技：使用全新的、充满胜利喜悦的缓存键，确保万无一失！***
const CACHE_KEY = 'stock_heatmap_data_v-grand-finale'; 
const CACHE_TTL_SECONDS = 300; // 缓存5分钟

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// --- 中英文字典 (终极完整版) ---
const sectorDictionary = {
    // GICS Sector Level (主要行业)
    "Energy": "能源",
    "Materials": "原材料",
    "Industrials": "工业",
    "Consumer Discretionary": "非必需消费品",
    "Consumer Staples": "必需消费品",
    "Health Care": "医疗健康",
    "Financials": "金融",
    "Information Technology": "信息技术",
    "Technology": "信息技术", // 同义词
    "Communication Services": "通讯服务",
    "Communications": "通讯服务", // 同义词
    "Utilities": "公用事业",
    "Real Estate": "房地产",

    // Finnhub & User's List (补充的详细行业名)
    "Aerospace & Defense": "航空航天与国防",
    "Aerospace": "航空航天",
    "Airlines": "航空公司",
    "Automobiles & Components": "汽车",
    "Automobiles": "汽车",
    "Banks": "银行业",
    "Banking": "银行业",
    "Beverages": "饮料",
    "Capital Goods": "资本品",
    "Commercial & Professional Services": "商业服务",
    "Consumer goods": "消费品",
    "Consumer products": "消费品",
    "Diversified Financials": "多元化金融",
    "Financial Services": "金融服务",
    "Food & Staples Retailing": "食品零售",
    "Food, Beverage & Tobacco": "食品与烟草",
    "Health Care Equipment & Services": "医疗设备与服务",
    "Hotels, Restaurants & Leisure": "酒店与休闲",
    "Household & Personal Products": "家庭与个人用品",
    "Insurance": "保险",
    "Machinery": "机械",
    "Media & Entertainment": "媒体与娱乐",
    "Media": "媒体",
    "Pharmaceuticals, Biotechnology & Life Sciences": "制药与生物科技",
    "Pharmaceuticals": "制药",
    "Retailing": "零售业", 
    "Retail": "零售业",    
    "Road & Rail": "陆路运输",
    "Semiconductors & Semiconductor Equipment": "半导体",
    "Semiconductors": "半导体",
    "Software & Services": "软件与服务",
    "Technology Hardware & Equipment": "技术硬件",
    "Telecommunication Services": "电信服务",
    "Telecommunication": "电信服务", // 同义词
    "Textiles, Apparel & Luxury Goods": "纺织品与服装",
    "Textiles": "纺织品",
    "Transportation": "交通运输",
};

const nameDictionary = {
    'AAPL': '苹果', 'MSFT': '微软', 'GOOGL': '谷歌', 'AMZN': '亚马逊', 'NVDA': '英伟达',
    'TSLA': '特斯拉', 'META': 'Meta', 'BRK-B': '伯克希尔', 'LLY': '礼来', 'V': 'Visa',
    'JPM': '摩根大通', 'XOM': '埃克森美孚', 'WMT': '沃尔玛', 'UNH': '联合健康', 'MA': '万事达',
    'JNJ': '强生', 'PG': '宝洁', 'ORCL': '甲骨文', 'HD': '家得宝', 'AVGO': '博通',
    'MRK': '默克', 'CVX': '雪佛龙', 'PEP': '百事', 'COST': '好市多', 'ADBE': 'Adobe',
    'KO': '可口可乐', 'BAC': '美国银行', 'CRM': '赛富时', 'MCD': "麦当劳", 'PFE': '辉瑞',
    'NFLX': '奈飞', 'AMD': '超威半导体', 'DIS': '迪士尼', 'INTC': '英特尔', 'NKE': '耐克',
    'CAT': '卡特彼勒', 'BA': '波音', 'CSCO': '思科', 'T': 'AT&T', 'UBER': '优步',
    'PYPL': 'PayPal', 'QCOM': '高通', 'SBUX': '星巴克', 'IBM': 'IBM', 'GE': '通用电气',
    'F': '福特汽车', 'GM': '通用汽车', 'DAL': '达美航空', 'UAL': '联合航空', 'AAL': '美国航空',
    'MAR': '万豪国际', 'HLT': '希尔顿', 'BKNG': '缤客', 'EXPE': '亿客行', 'CCL': '嘉年华邮轮'
};

// --- 主处理函数 ---
export default async function handler(request, response) {
    const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
    const ticker = searchParams.get('ticker');

    try {
        if (ticker) {
            const data = await fetchSingleStockData(ticker);
            return response.status(200).json(data);
        } else {
            const data = await fetchHeatmapData();
            return response.status(200).json(data);
        }
    } catch (error) {
        console.error(`API Handler Error:`, error);
        return response.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}

// --- 辅助函数 ---
async function fetchHeatmapData() {
    try {
        let cachedData = await redis.get(CACHE_KEY);
        if (cachedData) {
            console.log("Serving heatmap data from Upstash Redis cache.");
            return cachedData;
        }
    } catch (e) {
        console.error("Redis GET error:", e.message);
    }

    console.log("Cache miss. Fetching fresh data with batching strategy.");
    const tickers = Object.keys(nameDictionary);
    const batchSize = 15;
    const delay = 2000;
    let allStockData = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        console.log(`Fetching batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(tickers.length / batchSize)}...`);
        
        const batchPromises = batch.map(t => fetchApiDataForTicker(t));
        const batchResult = (await Promise.all(batchPromises)).filter(Boolean);
        allStockData.push(...batchResult);
        
        if (i + batchSize < tickers.length) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    if (allStockData.length > 0) {
        try {
            await redis.set(CACHE_KEY, allStockData, { ex: CACHE_TTL_SECONDS });
            console.log(`Fetched and stored ${allStockData.length} stocks in cache.`);
        } catch(e) {
            console.error("Redis SET error:", e.message);
        }
    }
    return allStockData;
}

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
        
        const englishSector = profile.finnhubIndustry;
        const chineseSector = sectorDictionary[englishSector] || englishSector; // 使用我们完备的字典
        const chineseName = nameDictionary[ticker] || profile.name.split(' ')[0];

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
    
    return { profile: { ...profile, description }, quote };
}