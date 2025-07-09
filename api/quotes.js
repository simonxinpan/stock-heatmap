// /api/quotes.js

// Vercel环境下，我们不需要额外的body-parser，可以直接使用request.json()
// 但为了兼容本地开发和确保健壮性，我们采用最通用的方式

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
        return response.status(500).json({ error: 'API key is not configured.' });
    }

    try {
        // *** 关键修正：使用 request.json() 来异步解析请求体 ***
        const { tickers } = await request.json(); 
        
        if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
            return response.status(400).json({ error: 'Tickers array is required in the request body.' });
        }

        const quotePromises = tickers.map(ticker => 
            fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`)
                .then(res => {
                    if (!res.ok) throw new Error(`Finnhub API error for ${ticker}: ${res.statusText}`);
                    return res.json();
                })
                .then(quote => ({ ticker, dp: quote.dp }))
        );
        
        const quotes = await Promise.all(quotePromises);
        
        return response.status(200).json(quotes);

    } catch (error) {
        console.error('Error in /api/quotes:', error);
        // 返回更详细的错误信息，方便调试
        return response.status(500).json({ 
            error: 'Failed to fetch real-time quotes.',
            details: error.message 
        });
    }
}