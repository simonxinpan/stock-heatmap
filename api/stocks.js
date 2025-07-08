import { Redis } from '@upstash/redis';

// --- 配置 ---
const CACHE_KEY = 'stock_heatmap_data';
const CACHE_TTL_SECONDS = 300; // 缓存5分钟

// --- 初始化Redis客户端 ---
const redis = Redis.fromEnv(); 

// --- 主处理函数 ---
export default async function handler(request, response) {
    // 从请求URL中获取参数
    const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
    const ticker = searchParams.get('ticker');

    try {
        if (ticker) {
            // --- 场景A: 请求单支股票详情 (不使用缓存) ---
            console.log(`INFO: Fetching details for single stock: ${ticker}`);
            const data = await fetchSingleStockData(ticker);
            return response.status(200).json(data);
        } else {
            // --- 场景B: 请求热力图数据 (使用缓存) ---
            console.log("INFO: Fetching heatmap data.");
            const data = await fetchHeatmapData();
            return response.status(200).json(data);
        }
    } catch (error) {
        console.error(`FATAL: Unhandled error in API handler for request: ${request.url}`, error);
        return response.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}


// --- 辅助函数1: 获取热力图数据 (带缓存) ---
async function fetchHeatmapData() {
    // 1. 尝试从缓存获取
    let cachedData = await redis.get(CACHE_KEY);
    if (cachedData) {
        console.log("SUCCESS: Serving heatmap data from Upstash Redis cache.");
        return cachedData;
    }

    // 2. 缓存未命中，从Finnhub获取
    console.log("INFO: Heatmap cache miss. Fetching fresh data from Finnhub...");
    const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM', 'V', 'JNJ', 'XOM', 'PG', 'LLY', 'AVGO', 'HD', 'MA'];
    
    const stockPromises = tickers.map(t => fetchApiDataForTicker(t));
    const freshData = (await Promise.all(stockPromises)).filter(Boolean);

    // 3. 存入缓存
    if (freshData.length > 0) {
        await redis.set(CACHE_KEY, freshData, { ex: CACHE_TTL_SECONDS });
        console.log(`SUCCESS: Fetched and stored ${freshData.length} stocks in Upstash Redis cache.`);
    }
    return freshData;
}

// --- 辅助函数2: 获取单支股票数据 (不带缓存) ---
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
    
    return { profile, quote };
}

// --- 辅助函数3: 获取单个ticker的API数据 (用于热力图) ---
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

        if (!profile || !quote || typeof profile.marketCapitalization === 'undefined') return null;
        return { ticker, name_zh: profile.name.split(' ')[0], sector: profile.finnhubIndustry, market_cap: profile.marketCapitalization, change_percent: quote.dp };
    } catch (error) {
        console.error(`Error fetching data for ticker ${ticker}:`, error);
        return null; // 单个失败不影响其他
    }
}