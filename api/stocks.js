// /api/stocks.js - Vercel Serverless Function (V2.0 - Multi-purpose)

export default async function handler(request, response) {
    const apiKey = process.env.FINNHUB_API_KEY;
    const { searchParams } = new URL(request.url, `https://${request.headers.host}`);
    const ticker = searchParams.get('ticker');

    if (!apiKey) {
        return response.status(500).json({ error: 'API Key not configured on server.' });
    }

    const finnhubBaseUrl = 'https://finnhub.io/api/v1';

    const fetchFromFinnhub = async (endpoint) => {
        const url = `${finnhubBaseUrl}${endpoint}&token=${apiKey}`;
        const apiResponse = await fetch(url);
        if (!apiResponse.ok) throw new Error(`Finnhub API error: ${apiResponse.statusText}`);
        return await apiResponse.json();
    };

    try {
        if (ticker) {
            // --- 场景2: 获取单支股票详情 ---
            const [profile, quote] = await Promise.all([
                fetchFromFinnhub(`/stock/profile2?symbol=${ticker}`),
                fetchFromFinnhub(`/quote?symbol=${ticker}`)
            ]);
            
            response.status(200).json({ profile, quote });

        } else {
            // --- 场景1: 获取主页热力图数据 ---
            const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM', 'V', 'JNJ', 'XOM', 'PG'];
            
            const stockPromises = tickers.map(async (t) => {
                try {
                    const [profile, quote] = await Promise.all([
                        fetchFromFinnhub(`/stock/profile2?symbol=${t}`),
                        fetchFromFinnhub(`/quote?symbol=${t}`)
                    ]);
                    if (!profile || !quote || profile.marketCapitalization === undefined) return null;
                    return {
                        ticker: profile.ticker,
                        name_zh: profile.name.split(' ')[0],
                        sector: profile.finnhubIndustry,
                        market_cap: profile.marketCapitalization,
                        change_percent: quote.dp,
                    };
                } catch (error) {
                    return null;
                }
            });

            const allStockData = (await Promise.all(stockPromises)).filter(Boolean);
            response.status(200).json(allStockData);
        }
    } catch (error) {
        console.error('Server-side error:', error);
        response.status(500).json({ error: error.message });
    }
}