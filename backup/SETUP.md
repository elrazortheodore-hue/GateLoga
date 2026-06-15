# Gateloga Ingestion Platform: Deployment & Configuration Guide

This document outlines the strict 10-step protocol for deploying the scanner platform. The architecture separates the frontend ingestion portal from the database backend, utilizing environment variables to secure sensitive routing and API credentials.

## Phase 1: Database & Webhook Infrastructure

### Step 1: Initialize the Database
1. Navigate to Google Sheets and create a new, blank spreadsheet named `Gateloga Database`.
2. Do not manually add column headers; the system's dynamic schema engine will generate them upon receiving the first payload.
3. Note the long string of characters in the URL (the Sheet ID) for later use.

### Step 2: Inject the Webhook Logic
1. From the spreadsheet menu, select **Extensions > Apps Script**.
2. Delete any default code in the editor.
3. Paste the following schema-handling script:

\`\`\`javascript
function doPost(e) {
  const processLock = LockService.getScriptLock();
  processLock.tryLock(10000); 

  try {
    const activeSheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const incomingData = JSON.parse(e.postData.contents);
    
    if (incomingData.rows && Array.isArray(incomingData.rows)) {
      let columnCount = activeSheet.getLastColumn();
      let schemaHeaders = [];
      if (columnCount > 0) {
        schemaHeaders = activeSheet.getRange(1, 1, 1, columnCount).getValues()[0];
      }

      incomingData.rows.forEach(record => {
        Object.keys(record).forEach(field => {
          if (!schemaHeaders.includes(field)) {
            schemaHeaders.push(field);
            activeSheet.getRange(1, schemaHeaders.length).setValue(field);
            activeSheet.getRange(1, schemaHeaders.length).setFontWeight("bold");
          }
        });

        const compiledRow = new Array(schemaHeaders.length).fill("");
        Object.entries(record).forEach(([field, val]) => {
          const indexPosition = schemaHeaders.indexOf(field);
          compiledRow[indexPosition] = typeof val === 'object' ? JSON.stringify(val) : val; 
        });

        activeSheet.appendRow(compiledRow);
      });
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "ACK" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "ERR", detail: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    processLock.releaseLock();
  }
}
\`\`\`
4. Save the project as `Gateloga Webhook`.

### Step 3: Deploy the Cloud Endpoint
1. Click the **Deploy** button in the top right and select **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. **Crucial Settings:**
   * **Execute as:** `Me` (Your Google Account).
   * **Who has access:** `Anyone` (This is required to allow cross-origin POST requests from your frontend).
4. Click **Deploy**, authorize the permissions, and copy the **Web app URL**. Keep this secure.
https://script.google.com/macros/s/AKfycbwDXpr0QlQc_zkGXwFITDREnCKqBCSlOyBetKVf1pp5FMAi-tfhUQ0voiUw2e0crINqEw/exec

---

## Phase 2: Local Project Scaffolding & Security

### Step 4: Scaffold the Application
To enable `.env` file reading for static HTML, initialize a lightweight Vite project. Open your terminal and execute:

\`\`\`bash
npm create vite@latest gateloga-scanner -- --template vanilla
cd gateloga-scanner
npm install
\`\`\`

### Step 5: Establish Environment Variables
1. Create a file named `.env` in the root of your new directory.
2. Define your sensitive credentials. *Note: Vite requires the `VITE_` prefix to expose variables to the client-side code.*

\`\`\`env
# .env (DO NOT COMMIT THIS FILE TO GIT)
VITE_WEBHOOK_URL="YOUR_COPIED_APPS_SCRIPT_WEB_APP_URL"
VITE_DATABASE_URL="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit"
\`\`\`
https://github.com/elrazortheodore-hue/GateLoga
---

## Phase 3: Frontend Implementation

### Step 6: Configure the Routing Portal
This handles the `/sheets` redirection logic.
1. Inside your project, create a new directory: `public/sheets/`.
2. Create `public/sheets/index.html` and paste the redirection code:

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gateloga | Database Routing</title>
<style>
  body { background: #000; color: #fff; font-family: monospace; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
  .pulse { animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
</head>
<body>
  <div class="pulse">Establishing Secure Connection...</div>
  <script type="module" src="/src/redirect.js"></script>
</body>
</html>
\`\`\`

### Step 7: Define Redirection Logic
1. Create `src/redirect.js`.
2. Extract the environment variable and trigger the redirect:

\`\`\`javascript
// src/redirect.js
const targetDatabase = import.meta.env.VITE_DATABASE_URL;

window.onload = () => {
  setTimeout(() => {
    window.location.replace(targetDatabase);
  }, 800);
};
\`\`\`

### Step 8: Implement the Core Scanner Interface
1. Open the primary `index.html` file in the root directory.
2. Replace its contents with the comprehensive Scanner UI markup (from the previous configuration).
3. Ensure the main script block at the bottom references an external module instead of inline logic:

\`\`\`html
<script type="module" src="/src/main.js"></script>
\`\`\`

### Step 9: Inject Variables into the Processing Engine
1. Open `src/main.js`.
2. Paste the entire JavaScript logic for the scanner here (camera controls, canvas baking, UI toggles).
3. At the very top of `src/main.js`, inject the secure webhook variable:

\`\`\`javascript
// src/main.js
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL;

// ... [Rest of the scanner JavaScript logic] ...
\`\`\`

---

## Phase 4: Production Deployment

### Step 10: Define Vercel Rules and Deploy
1. Create a `vercel.json` file in the root directory to enforce clean routing.

\`\`\`json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "rewrites": [
    {
      "source": "/sheets",
      "destination": "/sheets/index.html"
    }
  ]
}
\`\`\`

2. Initialize Git, commit your code (ensure `.env` is in your `.gitignore`), and push to GitHub.
3. Log into the Vercel Dashboard and import the repository.
4. **Crucial Deployment Step:** Before hitting "Deploy", navigate to the **Environment Variables** section in the Vercel setup screen.
5. Add your keys exactly as they appear in your local setup:
   * Key: `VITE_WEBHOOK_URL` | Value: `https://script.google.com/...`
   * Key: `VITE_DATABASE_URL` | Value: `https://docs.google.com/spreadsheets/...`
6. Execute the deployment. Vercel will compile the application, securely bake the variables into the static output, and deploy it to the edge network.