import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase, saveDatabase, verifyAdminPasscode } from './_db_helper.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-passcode');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const passcode = req.headers['x-admin-passcode'] as string | undefined;
        if (!verifyAdminPasscode(passcode)) {
            return res.status(401).json({ error: 'Unauthorized: Invalid passcode.' });
        }

        const { uploadId } = req.body;
        if (!uploadId) {
            return res.status(400).json({ error: 'Missing uploadId in request body.' });
        }

        // Fetch database state
        const db = await getDatabase();
        if (!db.uploads) db.uploads = [];

        const uploadIndex = db.uploads.findIndex((u: any) => u.id === uploadId);
        if (uploadIndex === -1) {
            return res.status(404).json({ error: 'Upload item not found in database.' });
        }

        const upload = db.uploads[uploadIndex];

        // Retrieve server-side private environment key
        const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the Vercel server environment.' });
        }

        // 1. Download image from Cloudinary
        const imageRes = await fetch(upload.imageUrl);
        if (!imageRes.ok) {
            throw new Error(`Failed to download image from Cloudinary: ${imageRes.statusText}`);
        }
        const arrayBuffer = await imageRes.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = imageRes.headers.get('content-type') || 'image/jpeg';

        // 2. Call Gemini API
        const modelEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const directives = `
            You are a high-precision OCR data extraction engine.
            Extract all logbook entries from the provided page image.
            Identify columns dynamically.
            Return strictly valid JSON.
            Output format MUST be exactly:
            {"columns": ["Column1", "Column2", ...], "rows": [{"Column1": "value", "Column2": "value"}, ...]}
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
            throw new Error(errData.error?.message || 'Gemini API processing failed.');
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        
        // Sanitize any triple-backtick JSON blocks
        let cleaned = text.replace(/```json/gi, '');
        cleaned = cleaned.replace(/```/gi, '');
        cleaned = cleaned.trim();
        
        const ocrResult = JSON.parse(cleaned);

        // 3. Update database state
        upload.status = 'processed';
        upload.columns = ocrResult.columns || [];
        upload.extractedRows = ocrResult.rows || [];
        upload.extracted_count = (ocrResult.rows || []).length;
        upload.error_message = '';

        await saveDatabase(db);

        return res.status(200).json({ success: true, upload });

    } catch (error: any) {
        console.error('Process error:', error);
        
        // Log failure in database so the admin page gets updated state
        try {
            const db = await getDatabase();
            if (db.uploads) {
                const upload = db.uploads.find((u: any) => u.id === req.body.uploadId);
                if (upload) {
                    upload.status = 'failed';
                    upload.error_message = error.message || 'Processing failed.';
                    await saveDatabase(db);
                }
            }
        } catch (dbErr) {
            console.error('Failed to update error status in DB:', dbErr);
        }

        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
