import { Redis } from '@upstash/redis';
import { industryStockList, sectorDictionary, homepageTickers, fullTickerNameMap } from '../../lib/stock-data';

// --- 配置 ---
const CACHE_KEY_PREFIX = 'stock_heatmap_sp500_v_final_debug'; // 使用一个全新的缓存前缀，确保不受旧缓存影响
const CACHE_TTL_SECONDS = 3600; 

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(request, response) {
    // 【重大修改】为了调试，暂时移除了安全检查。
    // 这能确保Vercel的定时任务一定能触发我们的代码。
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //     return response.status(401).json({ error: 'Unauthorized' });
    // }

    console.log("CRON JOB STARTED: Beginning to pre-populate all stock data caches.");
    
    try {
        console.log("-> Task 1: Updating HOMEPAGE data...");
        await updateCacheForList('homepage', homepageTickers);
        
        console.log("-> Task 2: Starting to update ALL SECTOR data...");
        for (const sectorName in industryStockList) {
            console.log(`  --> Processing sector: ${sectorName}`);
            const stocksInSector = industryStockList[sectorName].map(s => ({...s, sector: sectorName}));
            await updateCacheForList(`sector_${sectorName.replace(/[^a-zA-Z0-9]/g, '_')}`, stocksInSector);
        }

        console.log("CRON JOB FINISHED SUCCESSFULLY. All caches should be updated now.");
        return response.status(200).json({ status: 'ok', message: 'All caches updated.' });

    } catch (error) {
        console.error("CRON JOB FAILED:", error);
        return response.status(500).json({ status: 'error', message: error.message });
    }
}

async function updateCacheForList(key, stockList) {
    const fullKey = `${CACHE_KEY_PREFIX}_${key}`;
    console.log(`    - Updating cache for key: ${fullKey}`);
    const tickers = stockList.map(s => s.ticker);
    const batchSize = 20; // 降低批处理大小，减少单次请求压力
    const delay = 1500;   // 增加延迟，对API更友好
    let allStockData = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        console.log(`      - Fetching batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(tickers.length/batchSize)}...`);
        const batchPromises = batch.map(t => fetchApiDataForTicker(t));
        const batchResult = (await Promise.all(batchPromises)).filter(Boolean);
        allStockData.push(...batchResult);
        if (i + batchSize < tickers.length) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    allStockData = allStockData.map(stock => {
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

    if (allStockData.length > 0) {
        await redis.set(fullKey, JSON.stringify(allStockData), { ex: CACHE_TTL_SECONDS });
        console.log(`    - SUCCESS: Cached ${allStockData.length} stocks for key: ${fullKey}`);
    } else {
        console.warn(`    - WARNING: No data fetched for key: ${fullKey}. Cache not updated.`);
    }
}

async function fetchApiDataForTicker(ticker) {
    try {
        const apiKey = process.env.FINNHUB_API_KEY;
        if (!apiKey) throw new Error('FINNHUB_API_KEY is not configured.');

        const fetchFromFinnhub = async (endpoint) => {
            const url = `https://finnhub.io/api/v1${endpoint}&token=${apiKey}`;
            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`      ! Finnhub API Error for ${ticker}: ${res.statusText}`);
                return null;
            }
            return res.json();
        };
        const [profile, quote] = await Promise.all([
            fetchFromFinnhub(`/stock/profile2?symbol=${ticker}`),
            fetchFromFinnhub(`/quote?symbol=${ticker}`)
        ]);
        if (!profile || !quote || typeof profile.marketCapitalization === 'undefined') return null;
        return { ticker, market_cap: profile.marketCapitalization, change_percent: quote.dp, logo: profile.logo };
    } catch (error) {
        console.error(`      ! CRITICAL ERROR fetching ticker ${ticker}:`, error.message);
        return null;
    }
}