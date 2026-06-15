# Gateloga Ingestion Platform

A high-performance, purely client-side digitization pipeline utilizing the Gemini API to parse physical documents into structured JSON arrays, subsequently streaming the output directly into a dynamic Google Sheets database.

## System Architecture

The platform operates across three isolated components:
1.  **Ingestion Interface:** A lightweight, dependency-free HTML/JS application functioning as the primary scanning node.
2.  **Processing Engine:** Serverless execution via Google's Gemini 2.5 Flash model for visual data extraction and schema mapping.
3.  **Storage Webhook:** A Google Apps Script endpoint that intercepts HTTP POST requests, recalculates spreadsheet columns dynamically, and commits new rows.

## Operational Setup

### Database Configuration
1. Initialize a new Google Spreadsheet.
2. Navigate to `Extensions > Apps Script`.
3. Overwrite the default file with the contents of `apps-script.js`.
4. Deploy the script as a Web App, ensuring execution is set to `Me` and access rights are set to `Anyone`.
5. Note the generated Web App URL.

### Frontend Deployment
1. Inject the Web App URL into the `WEBHOOK_URL` constant within `public/index.html`.
2. Input the direct spreadsheet URL into the `DATABASE_URL` constant within `public/sheets/index.html`.
3. Push the repository to Vercel or your preferred static hosting infrastructure.

## Design Protocol
The user interface adheres to a rigid, information-dense brutalist aesthetic utilizing glassmorphism and strictly monospace/sans-serif typography combos for optimal readability in high-glare environments.