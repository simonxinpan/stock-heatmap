import { Redis } from '@upstash/redis';
import { fullTickerNameMap } from '../../lib/stock-data';

const CACHE_KEY_PREFIX = 'stock_heatmap_sp500_v_final_debug'; // 必须和 api/cron.js 中使用的前缀保持一致

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(request, response) {
    const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
    const ticker = searchParams.get('ticker');
    const sector = searchParams.get('sector');

    try {
        if (ticker) {
            const data = await fetchSingleStockData(ticker);
            return response.status(200).json(data);
        }

        let cacheKey;
        if (sector) {
            const decodedSector = decodeURIComponent(sector);
            cacheKey = `${CACHE_KEY_PREFIX}_sector_${decodedSector.replace(/[^a-zA-Z0-9]/g, '_')}`;
        } else {
            cacheKey = `${CACHE_KEY_PREFIX}_homepage`;
        }
        
        console.log(`Frontend request: Attempting to read from cache key: ${cacheKey}`);
        const cachedData = await redis.get(cacheKey);

        if (cachedData) {
            console.log(`Frontend request: Cache HIT! Serving data for ${cacheKey}`);
            // Redis/Vercel KV 返回的是一个对象，可以直接用，如果存的是字符串则需要 JSON.parse
            return response.status(200).json(typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData);
        } else {
            console.error(`Frontend request: Cache MISS! No data found for ${cacheKey}. This indicates the cron job hasn't run successfully yet.`);
            return response.status(404).json({ error: '数据正在后台生成中，请在几分钟后刷新页面重试。' });
        }

    } catch (error) {
        console.error(`API Handler Error:`, error);
        return response.status(500).json({ error: error.message || 'An internal server error occurred.' });
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
    const nameZh = fullTickerNameMap.get(ticker) || profile.name;
    
    return { profile: { ...profile, description, name_zh: nameZh }, quote };
}