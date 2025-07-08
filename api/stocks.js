import { Redis } from '@upstash/redis';

// --- 配置 ---
const CACHE_KEY = 'stock_heatmap_data_v-final-fix'; // 再次更新缓存键，确保万无一失
const CACHE_TTL_SECONDS = 300; // 缓存5分钟

// *** 关键修正：不再使用 fromEnv()，而是明确指定环境变量 ***
// 这样可以确保代码能正确找到Vercel提供的数据库密钥
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// --- 中英文字典 ---
const sectorDictionary = {
    "Communication Services": "通讯服务",
    "Consumer Discretionary": "非必需消费品",
    "Consumer Staples": "必需消费品",
    "Energy": "能源",
    "Financials": "金融",
    "Health Care": "医疗健康",
    "Industrials": "工业",
    "Information Technology": "信息技术",
    "Materials": "原材料",
    "Real Estate": "房地产",
    "Utilities": "公用事业",
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
        // 如果redis读取失败，不影响继续执行，直接去获取新数据
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
            // 即使写入缓存失败，也应该返回数据给用户
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
        const chineseSector = sectorDictionary[englishSector] || englishSector;
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