// /api/stocks.js - Vercel Serverless Function (Diagnostic Version)

export default async function handler(request, response) {
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
        return response.status(500).json({ error: 'API Key not configured on server.' });
    }

    const finnhubBaseUrl = 'https://finnhub.io/api/v1';

    try {
        const fetchFromFinnhub = async (endpoint) => {
            const url = `${finnhubBaseUrl}${endpoint}&token=${apiKey}`;
            const apiResponse = await fetch(url);
            if (!apiResponse.ok) {
                // 将Finnhub返回的原始错误信息传递出去，方便调试
                const errorBody = await apiResponse.text();
                console.error("Finnhub API Error:", errorBody);
                throw new Error(`Finnhub API error: ${apiResponse.statusText}`);
            }
            return await apiResponse.json();
        };

        // ======================= 诊断性修改 =======================
        // 我们不再调用 /index/constituents
        // 而是直接使用一个硬编码的股票列表来测试
        console.log("Using hardcoded ticker list for diagnostics...");
        const tickers = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 
            'TSLA', 'META', 'JPM', 'V', 'JNJ'
        ];
        // ======================= 修改结束 =======================

        const stockPromises = tickers.map(async (ticker) => {
            try {
                // 我们仍然尝试获取profile和quote，因为这通常是免费的
                const [profile, quote] = await Promise.all([
                    fetchFromFinnhub(`/stock/profile2?symbol=${ticker}`),
                    fetchFromFinnhub(`/quote?symbol=${ticker}`)
                ]);

                if (!profile || !quote || !profile.marketCapitalization) {
                    return null;
                }

                return {
                    ticker: profile.ticker,
                    name_zh: profile.name.split(' ')[0],
                    sector: profile.finnhubIndustry,
                    market_cap: profile.marketCapitalization,
                    change_percent: quote.dp,
                };
            } catch (error) {
                console.error(`Error fetching diagnostic data for ${ticker}:`, error);
                return null;
            }
        });

        const allStockData = (await Promise.all(stockPromises)).filter(Boolean);

        if (allStockData.length === 0) {
            // 如果所有股票都获取失败，说明可能是密钥真的有问题
            throw new Error("Failed to fetch data for all test tickers. Please double check your API Key.");
        }

        response.status(200).json(allStockData);

    } catch (error) {
        console.error('Server-side error in /api/stocks (diagnostic):', error);
        response.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}