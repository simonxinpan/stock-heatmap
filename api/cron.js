// api/cron.js
import { Redis } from '@upstash/redis';
import { industryStockList, sectorDictionary, fullTickerNameMap, sectorNames } from '../../lib/stock-data';

const CACHE_KEY_PREFIX = 'stock_heatmap_v_final_final_boss'; // 使用一个全新的、代表胜利的缓存键
const CACHE_TTL_SECONDS = 3600 * 24; // 缓存24小时

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// 我们将用Redis来记录上次更新到哪个行业了
const CRON_STATE_KEY = 'cron_job_state_v2'; // 使用新的状态键

export default async function handler(request, response) {
    // 【调试模式】暂时移除安全检查，确保100%执行
    console.log(`CRON JOB TRIGGERED AT ${new Date().toISOString()}`);

    try {
        // 1. 获取上次任务的状态
        let state = await redis.get(CRON_STATE_KEY);
        if (!state) {
            state = { lastUpdatedIndex: -1 };
        }
        
        // 2. 决定这次要更新哪些行业
        let currentIndex = state.lastUpdatedIndex;
        const sectorsToUpdate = [];
        // 每次Cron Job只处理3个行业，确保不会超时
        for (let i = 0; i < 3; i++) {
            currentIndex++;
            if (currentIndex >= sectorNames.length) {
                currentIndex = 0; // 如果到了末尾，从头开始
            }
            sectorsToUpdate.push(sectorNames[currentIndex]);
        }

        console.log(`This run will update sectors: ${sectorsToUpdate.join(', ')}`);

        // 3. 如果是新的一轮循环，顺便更新一下首页
        if (currentIndex < 3) {
            console.log("-> Updating HOMEPAGE data as part of a new cycle...");
            const homepageStockList = [];
            for (const sector in industryStockList) {
                homepageStockList.push(...industryStockList[sector].slice(0, 5));
            }
            await updateCacheForList('homepage', homepageStockList);
        }

        // 4. 更新选定的行业
        for (const sectorName of sectorsToUpdate) {
            console.log(`  --> Processing sector: ${sectorName}`);
            await updateCacheForList(`sector_${sectorName.replace(/[^a-zA-Z0-9]/g, '_')}`, industryStockList[sectorName]);
        }

        // 5. 保存本次任务的状态，以便下次继续
        await redis.set(CRON_STATE_KEY, { lastUpdatedIndex: currentIndex });

        console.log(`CRON JOB FINISHED SUCCESSFULLY.`);
        return response.status(200).json({ status: 'OK', updated: sectorsToUpdate });

    } catch (error) {
        console.error("CRON JOB FAILED:", error);
        return response.status(500).json({ status: 'error', message: error.message });
    }
}

async function updateCacheForList(key, stockList) {
    const fullKey = `${CACHE_KEY_PREFIX}_${key}`;
    const tickers = stockList.map(s => s.ticker);
    const batchSize = 20;
    const delay = 1500;
    let fetchedData = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        const batchPromises = batch.map(t => fetchApiDataForTicker(t));
        const batchResult = (await Promise.all(batchPromises)).filter(Boolean);
        fetchedData.push(...batchResult);
        if (i + batchSize < tickers.length) await new Promise(resolve => setTimeout(resolve, delay));
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
        await redis.set(fullKey, JSON.stringify(processedData), {ex: CACHE_TTL_SECONDS});
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
        const [quote, profile] = await Promise.all([quoteRes.json(), quoteRes.json()]);
        if (!profile || typeof profile.marketCapitalization === 'undefined' || profile.marketCapitalization === 0) return null;
        return { ticker, market_cap: profile.marketCapitalization, change_percent: quote.dp };
    } catch (error) {
        return null;
    }
}