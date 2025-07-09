// 这个文件只负责获取并返回最新的报价数据，非常轻量且不使用缓存
export default async function handler(request, response) {
    // 检查请求方法，确保是POST
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
        return response.status(500).json({ error: 'API key is not configured.' });
    }

    try {
        // 从请求体中获取需要查询的股票代码列表
        const { tickers } = request.body;
        if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
            return response.status(400).json({ error: 'Tickers array is required in the request body.' });
        }

        const quotePromises = tickers.map(ticker => 
            fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`)
                .then(res => {
                    if (!res.ok) throw new Error(`Finnhub API error for ${ticker}: ${res.statusText}`);
                    return res.json();
                })
                .then(quote => ({ ticker, dp: quote.dp })) // 只返回需要的字段：代码和日涨跌幅
        );
        
        const quotes = await Promise.all(quotePromises);
        
        return response.status(200).json(quotes);

    } catch (error) {
        console.error('Error fetching real-time quotes:', error);
        return response.status(500).json({ error: 'Failed to fetch real-time quotes.' });
    }
}