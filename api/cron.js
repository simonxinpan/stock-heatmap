// api/cron.js
import { Redis } from '@upstash/redis';
import { industryStockList, sectorDictionary, fullTickerNameMap } from '../../lib/stock-data';

const CACHE_KEY_PREFIX = 'stock_heatmap_v_final_perfect'; // 使用一个全新的、代表胜利的缓存键
const CACHE_TTL_SECONDS = 3600;

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(request, response) {
    // 【调试模式】暂时移除安全检查，确保100%执行
    console.log(`CRON JOB TRIGGERED AT ${new Date().toISOString()}`);

    try {
        console.log("-> Task: Updating ALL stock data caches...");
        
        // 1. 准备首页数据
        const homepageStockList = [];
        for (const sector in industryStockList) {
            homepageStockList.push(...industryStockList[sector].slice(0, 5));
        }
        await updateCacheForList('homepage', homepageStockList);
        
        // 2. 准备所有行业数据
        for (const sectorName in industryStockList) {
            await updateCacheForList(`sector_${sectorName.replace(/[^a-zA-Z0-9]/g, '_')}`, industryStockList[sectorName]);
        }

        console.log(`CRON JOB FINISHED SUCCESSFULLY.`);
        return response.status(200).json({ status: 'OK' });

    } catch (error) {
        console.error("CRON JOB FAILED:", error);
        return response.status(500).json({ status: 'error', message: error.message });
    }
}

async function updateCacheForList(key, stockList) {
    const fullKey = `${CACHE_KEY_PREFIX}_${key}`;
    console.log(`    - Processing key: ${fullKey}`);
    
    const tickers = stockList.map(s => s.ticker);
    const batchSize = 20;
    const delay = 1500;
    let fetchedData = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        const batchPromises = batch.map(t => fetchApiDataForTicker(t));
        const batchResult = (await Promise.all(batchPromises)).filter(Boolean);
        fetchedData.push(...batchResult);
        if (i + batchSize < tickers.length) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    const processedData = fetchedData.map(stock => {
        let masterSectorName = "Other";
        for (const sector in industryStockList) {
            if (industryStockList[sector].some(s => s.ticker === stock.ticker)) {
                masterSectorName = sector;
                break;
            }
        }
        return {
            ...stock,
            name_zh: fullTickerNameMap.get(stock.ticker) || stock.name_zh,
            sector: sectorDictionary[masterSectorName] || masterSectorName,
            original_sector: masterSectorName,
        };
    });

    if (processedData.length > 0) {
        await redis.set(fullKey, JSON.stringify(processedData), { ex: CACHE_TTL_SECONDS });
        console.log(`    - SUCCESS: Cached ${processedData.length} stocks for ${fullKey}`);
    }
}

async function fetchApiDataForTicker(ticker) {
    try {
        const apiKey = process.env.FINNHUB_API_KEY;
        const [quoteRes, profileRes] = await Promise.all([
            fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`),
            fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`)
        ]);

        if (!quoteRes.ok || !profileRes.ok) return null;

        const [quote, profile] = await Promise.all([quoteRes.json(), profileRes.json()]);

        if (!profile || typeof profile.marketCapitalization === 'undefined' || profile.marketCapitalization === 0) {
           return null;
        }

        return { 
            ticker: ticker,
            market_cap: profile.marketCapitalization,
            change_percent: quote.dp,
        };
    } catch (error) {
        console.warn(`Error fetching data for ${ticker}: ${error.message}`);
        return null;
    }
}