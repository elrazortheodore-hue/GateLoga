/**
 * Google Apps Script Webhook receiver.
 * Intercepts HTTP POST requests, injects metadata (Cloudinary backups, batch stamps),
 * and dynamically appends rows to the spreadsheet.
 * 
 * Deployment Instructions:
 * 1. Open target Google Sheet.
 * 2. Extensions > Apps Script.
 * 3. Overwrite editor code with the javascript logic below.
 * 4. Deploy as Web App: Execute as "Me", Access: "Anyone".
 */

function doPost(e: GoogleAppsScript.Events.DoPost) {
  const processLock = LockService.getScriptLock();
  processLock.tryLock(10000); 

  try {
    const activeSheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const incomingData = JSON.parse(e.postData.contents);
    
    if (incomingData.rows && Array.isArray(incomingData.rows)) {
      let columnCount = activeSheet.getLastColumn();
      let schemaHeaders: string[] = [];
      if (columnCount > 0) {
        schemaHeaders = activeSheet.getRange(1, 1, 1, columnCount).getValues()[0] as string[];
      }

      incomingData.rows.forEach((record: Record<string, any>) => {
        // Inject image link and doc batch metadata directly into the record keys
        if (incomingData.imageUrl) {
          record["Image Backup Link"] = incomingData.imageUrl;
        }
        if (incomingData.docName) {
          record["Batch Name"] = incomingData.docName;
        }
        if (typeof incomingData.pageIndex === 'number') {
          record["Page Number"] = incomingData.pageIndex + 1;
        }

        // Dynamically add new columns to the header schema if they don't exist
        Object.keys(record).forEach(field => {
          if (!schemaHeaders.includes(field)) {
            schemaHeaders.push(field);
            activeSheet.getRange(1, schemaHeaders.length).setValue(field);
            activeSheet.getRange(1, schemaHeaders.length).setFontWeight("bold");
          }
        });

        // Compile row cells according to header positions
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
      
  } catch (err: any) {
    return ContentService.createTextOutput(JSON.stringify({ status: "ERR", detail: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    processLock.releaseLock();
  }
}
