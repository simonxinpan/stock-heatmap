import { Redis } from '@upstash/redis';
import { fullTickerNameMap } from '../../lib/stock-data';

// 必须和 api/cron.js 中使用的前缀完全一致
const CACHE_KEY_PREFIX = 'stock_heatmap_sp500_v_cron_final';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(request, response) {
    const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
    const ticker = searchParams.get('ticker');
    const sector = searchParams.get('sector');

    // 个股详情页的逻辑保持不变，因为它需要实时数据
    if (ticker) {
        try {
            const data = await fetchSingleStockData(ticker);
            return response.status(200).json(data);
        } catch (error) {
             return response.status(500).json({ error: error.message });
        }
    }

    let cacheKey;
    if (sector) {
        const decodedSector = decodeURIComponent(sector);
        cacheKey = `${CACHE_KEY_PREFIX}_sector_${decodedSector.replace(/[^a-zA-Z0-9]/g, '_')}`;
    } else {
        cacheKey = `${CACHE_KEY_PREFIX}_homepage`;
    }
    
    try {
        console.log(`Frontend request: Attempting to read from cache key: ${cacheKey}`);
        const cachedData = await redis.get(cacheKey);

        if (cachedData) {
            console.log(`Frontend request: Cache HIT! Serving data for ${cacheKey}`);
            return response.status(200).json(cachedData); // Vercel KV/Redis直接返回JS对象
        } else {
            console.error(`Frontend request: Cache MISS for ${cacheKey}. This means the cron job hasn't run successfully yet.`);
            // 返回一个特定的状态码和友好的错误信息
            return response.status(404).json({ error: '数据正在后台生成中，请在几分钟后刷新页面重试。' });
        }
    } catch (error) {
        console.error(`API Handler Error:`, error.message);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}

// 个股详情页的API请求
async function fetchSingleStockData(ticker) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) throw new Error('FINNHUB_API_KEY is not configured.');
    
    const [profileRes, quoteRes] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`),
        fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`)
    ]);

    if (!profileRes.ok || !quoteRes.ok) throw new Error(`Failed to fetch details for ${ticker}`);

    const [profile, quote] = await Promise.all([profileRes.json(), quoteRes.json()]);
    
    const description = `(自动生成) ${profile.name} 是一家总部位于 ${profile.country || '未知'} 的公司，属于 ${profile.finnhubIndustry || '未知'} 行业，于 ${profile.ipo || '未知日期'} 上市。`;
    const nameZh = fullTickerNameMap.get(ticker) || profile.name;
    
    return { profile: { ...profile, description, name_zh: nameZh }, quote };
}