// 【重要】这个文件是后台定时任务，独立于前台API运行

import { Redis } from '@upstash/redis';
import { industryStockList, sectorDictionary, fullTickerNameMap } from '../../lib/stock-data';

// --- 配置 ---
const CACHE_KEY_PREFIX = 'stock_heatmap_sp500_v_cron_final'; // 使用一个全新的、明确的缓存前缀
const CACHE_TTL_SECONDS = 3600; // 缓存1小时

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// --- 主处理函数 ---
export default async function handler(request, response) {
    // 【重大修改】为了确保100%执行，暂时移除所有安全检查。
    
    // 【强力日志】在函数开始时立刻记录，这是最重要的日志！
    console.log(`CRON JOB TRIGGERED AT ${new Date().toISOString()}`);

    try {
        console.log("-> Task 1: Updating HOMEPAGE data...");
        await updateCacheForList('homepage', industryStockList); // 使用完整的列表来生成首页，更准确
        
        console.log("-> Task 2: Starting to update ALL SECTOR data...");
        for (const sectorName in industryStockList) {
            console.log(`  --> Processing sector: ${sectorName}`);
            const stocksInSector = industryStockList[sectorName];
            await updateCacheForList(`sector_${sectorName.replace(/[^a-zA-Z0-9]/g, '_')}`, stocksInSector);
        }

        console.log(`CRON JOB FINISHED SUCCESSFULLY AT ${new Date().toISOString()}. All caches updated.`);
        // 返回一个明确的成功响应
        return response.status(200).json({ status: 'OK', message: 'All caches populated successfully.' });

    } catch (error) {
        console.error("CRON JOB FAILED:", error);
        return response.status(500).json({ status: 'error', message: error.message });
    }
}


async function updateCacheForList(key, stockListToProcess) {
    const fullKey = `${CACHE_KEY_PREFIX}_${key}`;
    console.log(`    - Updating cache for key: ${fullKey}`);
    
    // 如果是首页，只取每个行业的前5个
    let stocksToFetch = [];
    if (key === 'homepage') {
        for (const sector in stockListToProcess) {
            stocksToFetch.push(...stockListToProcess[sector].slice(0, 5));
        }
    } else {
        stocksToFetch = stockListToProcess;
    }
    const tickers = stocksToFetch.map(s => s.ticker);
    
    const batchSize = 20;
    const delay = 1500;
    let fetchedData = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        console.log(`      - Fetching batch ${Math.floor(i / batchSize) + 1}...`);
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
        console.log(`    - SUCCESS: Cached ${processedData.length} stocks for key: ${fullKey}`);
    } else {
        console.warn(`    - WARNING: No data fetched for key: ${fullKey}.`);
    }
}

async function fetchApiDataForTicker(ticker) {
    try {
        const apiKey = process.env.FINNHUB_API_KEY;
        if (!apiKey) throw new Error('FINNHUB_API_KEY is not configured.');
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`);
        if (!res.ok) {
            console.warn(`      ! Finnhub API Error for ${ticker}: ${res.statusText}`);
            return null;
        }
        const quote = await res.json();
        
        // 我们只需要 quote 数据来更新热力图，profile数据可以简化
        // 从 fullTickerNameMap 获取静态数据
        const profileData = {
            ticker: ticker,
            name_zh: fullTickerNameMap.get(ticker) || ticker,
            market_cap: quote.c * 1000000000, // 这是一个估算，因为finnhub的quote不直接给市值
            logo: `https://static.finnhub.io/logo/${ticker.split('.')[0]}.png` // 猜测logo地址
        };

        return {
            ticker: profileData.ticker,
            name_zh: profileData.name_zh,
            market_cap: profileData.market_cap,
            change_percent: quote.dp,
            logo: profileData.logo
        };

    } catch (error) {
        console.error(`      ! CRITICAL ERROR fetching ticker ${ticker}:`, error.message);
        return null;
    }
}