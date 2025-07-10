// api/stocks.js
import { Redis } from '@upstash/redis';
import { fullTickerNameMap } from '../../lib/stock-data';

const CACHE_KEY_PREFIX = 'stock_heatmap_v_final_perfect'; // 与cron.js保持一致

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(request, response) {
    const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
    const ticker = searchParams.get('ticker');
    const sector = searchParams.get('sector');

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
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
            return response.status(200).json(cachedData);
        } else {
            return response.status(404).json({ error: '数据正在后台生成中，请在几分钟后刷新页面重试。' });
        }
    } catch (error) {
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}

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