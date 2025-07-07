import { Redis } from '@upstash/redis';

// --- 配置 ---
const CACHE_KEY = 'stock_market_data';
const CACHE_TTL_SECONDS = 300; // 缓存5分钟 (5 * 60)

// --- 初始化Upstash Redis客户端 ---
// Redis.fromEnv() 会自动从Vercel的环境变量中读取连接信息
// (UPSTASH_REDIS_REST_URL 和 UPSTASH_REDIS_REST_TOKEN)
const redis = Redis.fromEnv(); 

// --- Vercel Serverless Function 主处理函数 ---
export default async function handler(request, response) {
    try {
        // 1. 尝试从缓存获取数据
        let cachedData = await redis.get(CACHE_KEY);

        if (cachedData) {
            console.log("SUCCESS: Serving data from Upstash Redis cache.");
            // 如果缓存命中，直接返回数据
            return response.status(200).json(cachedData);
        }

        // 2. 如果缓存未命中，则从Finnhub获取新数据
        console.log("INFO: Cache miss. Fetching fresh data from Finnhub...");
        const apiKey = process.env.FINNHUB_API_KEY;
        if (!apiKey) {
            throw new Error('FINNHUB_API_KEY environment variable is not configured.');
        }

        const fetchFromFinnhub = async (endpoint) => {
            const url = `https://finnhub.io/api/v1${endpoint}&token=${apiKey}`;
            const res = await fetch(url);
            if (!res.ok) {
                console.error(`Finnhub API error for ${url}: ${res.statusText}`);
                throw new Error(`Finnhub API error: ${res.statusText}`);
            }
            return res.json();
        };

        // 使用一个安全的、不会触发速率限制的股票列表
        const tickers = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 
            'JPM', 'V', 'JNJ', 'XOM', 'PG', 'LLY', 'AVGO', 'HD', 'MA'
        ];
        
        const stockPromises = tickers.map(async (t) => {
            try {
                const [profile, quote] = await Promise.all([
                    fetchFromFinnhub(`/stock/profile2?symbol=${t}`),
                    fetchFromFinnhub(`/quote?symbol=${t}`)
                ]);
                // 确保关键数据存在
                if (!profile || !quote || typeof profile.marketCapitalization === 'undefined') {
                    return null;
                }
                return { 
                    ticker: t, 
                    name_zh: profile.name.split(' ')[0], 
                    sector: profile.finnhubIndustry, 
                    market_cap: profile.marketCapitalization, 
                    change_percent: quote.dp 
                };
            } catch (error) {
                console.error(`Error fetching individual data for ${t}:`, error);
                return null; // 单个股票失败不影响整体
            }
        });

        const freshData = (await Promise.all(stockPromises)).filter(Boolean); // 过滤掉所有失败的结果(null)

        // 3. 将获取到的新数据存入缓存
        if (freshData.length > 0) {
            await redis.set(CACHE_KEY, freshData, { ex: CACHE_TTL_SECONDS });
            console.log(`SUCCESS: Fetched and stored ${freshData.length} stocks in Upstash Redis cache.`);
        } else {
            console.warn("WARN: No fresh data was fetched from Finnhub to cache.");
        }
        
        // 4. 将新数据返回给用户
        return response.status(200).json(freshData);

    } catch (error) {
        console.error('FATAL: Server-side error in API route:', error);
        return response.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}
