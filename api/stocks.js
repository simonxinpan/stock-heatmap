// /api/stocks.js
import { Redis } from '@upstash/redis';

const CACHE_KEY_FULL = 'stock_heatmap_data_v-complete-rebuild-final'; // 新的缓存键
const CACHE_TTL_FULL = 900; // 完整数据缓存15分钟

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// 保持您最全的字典
const sectorDictionary = { "Energy": "能源", "Materials": "原材料", "Industrials": "工业", "Consumer Discretionary": "非必需消费品", "Consumer Staples": "必需消费品", "Health Care": "医疗健康", "Financials": "金融", "Information Technology": "信息技术", "Technology": "信息技术", "Communication Services": "通讯服务", "Communications": "通讯服务", "Utilities": "公用事业", "Real Estate": "房地产", "Aerospace & Defense": "航空航天与国防", "Aerospace": "航空航天", "Airlines": "航空公司", "Automobiles & Components": "汽车", "Automobiles": "汽车", "Banks": "银行业", "Banking": "银行业", "Beverages": "饮料", "Capital Goods": "资本品", "Commercial & Professional Services": "商业服务", "Consumer goods": "消费品", "Consumer products": "消费品", "Diversified Financials": "多元化金融", "Financial Services": "金融服务", "Food & Staples Retailing": "食品零售", "Food, Beverage & Tobacco": "食品与烟草", "Health Care Equipment & Services": "医疗设备与服务", "Hotels, Restaurants & Leisure": "酒店与休闲", "Household & Personal Products": "家庭与个人用品", "Insurance": "保险", "Machinery": "机械", "Media & Entertainment": "媒体与娱乐", "Media": "媒体", "Pharmaceuticals, Biotechnology & Life Sciences": "制药与生物科技", "Pharmaceuticals": "制药", "Retailing": "零售业", "Retail": "零售业", "Road & Rail": "陆路运输", "Semiconductors & Semiconductor Equipment": "半导体", "Semiconductors": "半导体", "Software & Services": "软件与服务", "Technology Hardware & Equipment": "技术硬件", "Telecommunication Services": "电信服务", "Telecommunication": "电信服务", "Textiles, Apparel & Luxury Goods": "纺织品与服装", "Textiles": "纺织品", "Transportation": "交通运输" };
const nameDictionary = { 'AAPL': '苹果', 'MSFT': '微软', 'GOOGL': '谷歌', 'AMZN': '亚马逊', 'NVDA': '英伟达', 'TSLA': '特斯拉', 'META': 'Meta', 'BRK-B': '伯克希尔', 'LLY': '礼来', 'V': 'Visa', 'JPM': '摩根大通', 'XOM': '埃克森美孚', 'WMT': '沃尔玛', 'UNH': '联合健康', 'MA': '万事达', 'JNJ': '强生', 'PG': '宝洁', 'ORCL': '甲骨文', 'HD': '家得宝', 'AVGO': '博通', 'MRK': '默克', 'CVX': '雪佛龙', 'PEP': '百事', 'COST': '好市多', 'ADBE': 'Adobe', 'KO': '可口可乐', 'BAC': '美国银行', 'CRM': '赛富时', 'MCD': "麦当劳", 'PFE': '辉瑞', 'NFLX': '奈飞', 'AMD': '超威半导体', 'DIS': '迪士尼', 'INTC': '英特尔', 'NKE': '耐克', 'CAT': '卡特彼勒', 'BA': '波音', 'CSCO': '思科', 'T': 'AT&T', 'UBER': '优步', 'PYPL': 'PayPal', 'QCOM': '高通', 'SBUX': '星巴克', 'IBM': 'IBM', 'GE': '通用电气', 'F': '福特汽车', 'GM': '通用汽车', 'DAL': '达美航空', 'UAL': '联合航空', 'AAL': '美国航空', 'MAR': '万豪国际', 'HLT': '希尔顿', 'BKNG': '缤客', 'EXPE': '亿客行', 'CCL': '嘉年华邮轮' };


// *** 全新重构的主处理函数 ***
export default async function handler(request, response) {
    const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
    const ticker = searchParams.get('ticker');
    const mode = searchParams.get('mode'); // 新增参数，用于区分请求类型

    try {
        if (mode === 'quotes') {
            // "霓虹灯计划"的实时报价请求
            const tickers = Object.keys(nameDictionary);
            const data = await fetchRealTimeQuotes(tickers);
            return response.status(200).json(data);
        } else if (ticker) {
            // 个股详情页请求
            const data = await fetchSingleStockData(ticker);
            return response.status(200).json(data);
        } else {
            // 首次加载的完整数据请求
            const data = await fetchHeatmapData();
            return response.status(200).json(data);
        }
    } catch (error) {
        return response.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}

// *** 新增：只获取实时报价的轻量级函数 ***
async function fetchRealTimeQuotes(tickers) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) throw new Error("API key not configured.");

    const quotePromises = tickers.map(ticker => 
        fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`)
            .then(res => res.ok ? res.json() : null)
            .then(quote => quote ? { ticker, dp: quote.dp } : null)
    );
    
    // 使用 Promise.allSettled 确保即使部分API失败，也不会导致整个请求崩溃
    const results = await Promise.allSettled(quotePromises);
    const quotes = results
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);
        
    return quotes;
}


async function fetchHeatmapData() {
    try {
        let cachedData = await redis.get(CACHE_KEY_FULL);
        if (cachedData) return cachedData;
    } catch (e) { console.error("Redis GET error:", e.message); }

    const tickers = Object.keys(nameDictionary);
    const allStockData = [];
    for (let i = 0; i < tickers.length; i += 15) {
        const batch = tickers.slice(i, i + 15);
        const batchPromises = batch.map(t => fetchApiDataForTicker(t));
        const batchResult = (await Promise.all(batchPromises)).filter(Boolean);
        allStockData.push(...batchResult);
        if (i + 15 < tickers.length) await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (allStockData.length > 0) {
        try {
            await redis.set(CACHE_KEY_FULL, allStockData, { ex: CACHE_TTL_FULL });
        } catch(e) { console.error("Redis SET error:", e.message); }
    }
    return allStockData;
}

async function fetchApiDataForTicker(ticker) {
    try {
        const apiKey = process.env.FINNHUB_API_KEY;
        if (!apiKey) throw new Error("API key not configured.");
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
        if (!profile || !quote || typeof profile.marketCapitalization === 'undefined' || profile.marketCapitalization === 0) return null;
        const englishSector = profile.finnhubIndustry;
        return { ticker, name_zh: nameDictionary[ticker] || profile.name.split(' ')[0], sector: sectorDictionary[englishSector] || englishSector, market_cap: profile.marketCapitalization, change_percent: quote.dp };
    } catch (error) { return null; }
}

async function fetchSingleStockData(ticker) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) throw new Error("API key not configured.");
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
    return { profile: { ...profile, description }, quote };
}