import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Read raw binary request body stream
        const chunks: any[] = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const base64Data = buffer.toString('base64');
        const mimeType = req.headers['content-type'] || 'image/jpeg';

        // Retrieve server-side private environment key
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the Vercel server environment.' });
        }

        const modelEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const directives = `
            You are a high-precision data extraction engine.
            Analyze the provided document.
            Generate strictly valid JSON.
            Requirements:
            - Identify columns dynamically.
            - Extract all rows.
            - Output format: {"page_metadata":{}, "columns":[], "rows":[{}]}
        `;

        const response = await fetch(modelEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: directives },
                        { inline_data: { mime_type: mimeType, data: base64Data } }
                    ]
                }],
                generationConfig: { responseMimeType: 'application/json' }
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            return res.status(response.status).json(errData);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        
        // Sanitize any triple-backtick JSON blocks
        let cleaned = text.replace(/```json/gi, '');
        cleaned = cleaned.replace(/```/gi, '');
        cleaned = cleaned.trim();
        
        return res.status(200).json(JSON.parse(cleaned));

    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
export {};
