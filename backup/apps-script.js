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