// /api/stocks.js - Vercel Serverless Function

// 这是一个在服务器端运行的函数，它接收请求，然后去调用Finnhub
export default async function handler(request, response) {
    // 从Vercel的环境变量中安全地获取API密钥
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
        return response.status(500).json({ error: 'API Key not configured on server.' });
    }

    const finnhubBaseUrl = 'https://finnhub.io/api/v1';
    const stockCount = 60; // 定义获取股票的数量

    try {
        // --- 封装一个安全的Finnhub fetch函数 ---
        const fetchFromFinnhub = async (endpoint) => {
            const url = `${finnhubBaseUrl}${endpoint}&token=${apiKey}`;
            const apiResponse = await fetch(url);
            if (!apiResponse.ok) {
                // 如果API返回错误，直接抛出异常
                throw new Error(`Finnhub API error: ${apiResponse.statusText}`);
            }
            return await apiResponse.json();
        };

        // 1. 获取标普500成分股
        const constituentsData = await fetchFromFinnhub('/index/constituents?symbol=^GSPC');
        if (!constituentsData || !constituentsData.constituents) {
            throw new Error('Could not fetch S&P 500 constituents.');
        }
        const tickers = constituentsData.constituents.slice(0, stockCount);

        // 2. 并发获取所有股票的详细数据
        const stockPromises = tickers.map(async (ticker) => {
            try {
                const [profile, quote] = await Promise.all([
                    fetchFromFinnhub(`/stock/profile2?symbol=${ticker}`),
                    fetchFromFinnhub(`/quote?symbol=${ticker}`)
                ]);

                if (!profile || !quote || !profile.marketCapitalization) {
                    return null; // 如果数据不完整，则跳过此股票
                }

                // 3. 组装成前端需要的数据格式
                return {
                    ticker: profile.ticker,
                    name_zh: profile.name.split(' ')[0], // 尝试取公司名的第一个单词作为简称
                    sector: profile.finnhubIndustry,
                    market_cap: profile.marketCapitalization,
                    change_percent: quote.dp,
                };
            } catch (error) {
                console.error(`Error fetching data for ${ticker}:`, error);
                return null; // 单个股票获取失败不影响其他股票
            }
        });

        const allStockData = (await Promise.all(stockPromises)).filter(Boolean); // 过滤掉所有null的结果

        // 4. 将成功获取的数据返回给前端
        response.status(200).json(allStockData);

    } catch (error) {
        console.error('Server-side error in /api/stocks:', error);
        response.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}