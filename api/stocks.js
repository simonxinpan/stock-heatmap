import { Redis } from '@upstash/redis';
import { fullTickerNameMap } from '../../lib/stock-data'; // 引入公共数据

const CACHE_KEY_PREFIX = 'stock_heatmap_sp500_v3_deduped'; // 必须和 api/cron.js 中使用的前缀保持一致

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
            // 获取个股详情的逻辑保持不变，因为它总是需要实时查询
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
        
        // 【核心改变】只从Redis读取数据
        const cachedData = await redis.get(cacheKey);

        if (cachedData) {
            console.log(`Serving data from cache for key: ${cacheKey}`);
            // Vercel KV/Redis 返回的是一个对象，可以直接用，如果存的是字符串则需要 JSON.parse
            return response.status(200).json(typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData);
        } else {
            // 如果缓存中没有数据，说明后台任务还没跑完，给前台一个友好的提示
            console.warn(`Cache miss for key: ${cacheKey}. The cron job might not have run yet.`);
            return response.status(404).json({ error: '数据正在后台预热中，请稍后再试。' });
        }

    } catch (error) {
        console.error(`API Handler Error:`, error);
        return response.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}

// 个股详情页仍然需要实时获取
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