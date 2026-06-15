/**
 * Gateloga Google Sheets Database Webhook.
 * Handles row insertion and dynamic schema bootstrapping on empty sheets.
 * Active Web App URL:
 * https://script.google.com/macros/s/AKfycbzDQpIGC2GltWESNPtuUxFi2u7sL5l0TMYJpoaXNEhdE3vcr7Ee72lBmwA1XoO9UfLVOw/exec
 */
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
      } else if (incomingData.rows.length > 0) {
        // Bootstrap schema headers on a brand-new empty sheet
        schemaHeaders = Object.keys(incomingData.rows[0]);
        if (incomingData.imageUrl) schemaHeaders.push("Image Backup Link");
        if (incomingData.docName) schemaHeaders.push("Batch Name");
        schemaHeaders = [...new Set(schemaHeaders)];
        activeSheet.getRange(1, 1, 1, schemaHeaders.length).setValues([schemaHeaders]);
        activeSheet.getRange(1, 1, 1, schemaHeaders.length).setFontWeight("bold");
      }

      incomingData.rows.forEach((record) => {
        // Inject image link and doc batch metadata directly into the record keys
        if (incomingData.imageUrl) {
          record["Image Backup Link"] = incomingData.imageUrl;
        }
        if (incomingData.docName) {
          record["Batch Name"] = incomingData.docName;
        }

        // Map record object to spreadsheet columns
        let rowData = schemaHeaders.map(header => record[header] || "");
        activeSheet.appendRow(rowData);
      });
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "ERR", detail: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    processLock.releaseLock();
  }
}