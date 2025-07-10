import { Redis } from '@upstash/redis';
import { industryStockList, sectorDictionary, homepageTickers } from '../../lib/stock-data';

// --- 配置 ---
const CACHE_KEY_PREFIX = 'stock_heatmap_sp500_v3_deduped'; // 必须和 api/stocks.js 中使用的前缀保持一致
const CACHE_TTL_SECONDS = 3600; // 缓存1小时，因为是定时任务更新

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// --- 主处理函数 ---
export default async function handler(request, response) {
    // 安全校验：确保只有Vercel的Cron服务能触发这个任务
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return response.status(401).json({ error: 'Unauthorized' });
    }

    console.log("Cron job started: Pre-populating stock data cache...");
    
    try {
        // 1. 更新首页数据
        console.log("Updating homepage data...");
        await updateCacheForList('homepage', homepageTickers);
        
        // 2. 遍历并更新所有行业的数据
        for (const sectorName in industryStockList) {
            console.log(`Updating data for sector: ${sectorName}...`);
            const stocksInSector = industryStockList[sectorName].map(s => ({...s, sector: sectorName}));
            await updateCacheForList(`sector_${sectorName.replace(/[^a-zA-Z0-9]/g, '_')}`, stocksInSector);
        }

        console.log("Cron job finished successfully. All caches updated.");
        return response.status(200).json({ status: 'ok', message: 'All caches updated.' });

    } catch (error) {
        console.error("Cron job failed:", error);
        return response.status(500).json({ status: 'error', message: error.message });
    }
}

// --- 数据获取与缓存的核心逻辑 ---
async function updateCacheForList(key, stockList) {
    const fullKey = `${CACHE_KEY_PREFIX}_${key}`;
    const tickers = stockList.map(s => s.ticker);
    const batchSize = 25;
    const delay = 1200;
    let allStockData = [];

    // 分批从Finnhub获取数据
    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        console.log(` -> Fetching batch ${Math.floor(i / batchSize) + 1} for key: ${key}`);
        const batchPromises = batch.map(t => fetchApiDataForTicker(t));
        const batchResult = (await Promise.all(batchPromises)).filter(Boolean);
        allStockData.push(...batchResult);
        if (i + batchSize < tickers.length) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // 为每个股票数据添加正确的行业中文名
    const fullTickerNameMap = new Map(Object.values(industryStockList).flat().map(s => [s.ticker, s.name_zh]));
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

    // 将处理好的数据存入Redis
    if (allStockData.length > 0) {
        await redis.set(fullKey, JSON.stringify(allStockData), { ex: CACHE_TTL_SECONDS });
        console.log(` -> Successfully cached ${allStockData.length} stocks for key: ${fullKey}`);
    } else {
        console.log(` -> No data fetched for key: ${fullKey}. Cache not updated.`);
    }
}

// 从Finnhub获取单个股票的数据
async function fetchApiDataForTicker(ticker) {
    try {
        const apiKey = process.env.FINNHUB_API_KEY;
        if (!apiKey) throw new Error('FINNHUB_API_KEY is not configured.');

        const fetchFromFinnhub = async (endpoint) => {
            const url = `https://finnhub.io/api/v1${endpoint}&token=${apiKey}`;
            const res = await fetch(url);
            if (!res.ok) {
                // Log and return null on failure, so one failure doesn't stop the whole cron job
                console.warn(`Finnhub API error for ${ticker}: ${res.statusText}`);
                return null;
            }
            return res.json();
        };

        const [profile, quote] = await Promise.all([
            fetchFromFinnhub(`/stock/profile2?symbol=${ticker}`),
            fetchFromFinnhub(`/quote?symbol=${ticker}`)
        ]);

        if (!profile || !quote || typeof profile.marketCapitalization === 'undefined') return null;
        
        return { 
            ticker, 
            market_cap: profile.marketCapitalization, 
            change_percent: quote.dp,
            logo: profile.logo
        };
    } catch (error) {
        console.error(`Error fetching data for ticker ${ticker}:`, error.message);
        return null; // 确保单个股票的失败不会中断整个任务
    }
}