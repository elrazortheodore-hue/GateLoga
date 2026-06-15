/**
 * Gateloga Google Sheets Database Webhook.
 * Handles resilient row insertion, concurrency locking, and self-healing schemas.
 * Active Web App URL:
 * https://script.google.com/macros/s/AKfycbzDQpIGC2GltWESNPtuUxFi2u7sL5l0TMYJpoaXNEhdE3vcr7Ee72lBmwA1XoO9UfLVOw/exec
 */

function doPost(e) {
  // 1. Concurrency Control: Dual-Locking Mechanism
  var scriptLock = LockService.getScriptLock();
  var lockAcquired = false;
  var lockWarning = "";

  try {
    lockAcquired = scriptLock.tryLock(10000); // Wait up to 10 seconds
  } catch (lockErr) {
    lockWarning = "ScriptLock acquisition exception: " + lockErr.toString();
  }

  // Fallback to Document Lock if Script Lock failed
  var docLock = null;
  if (!lockAcquired) {
    try {
      docLock = LockService.getDocumentLock();
      lockAcquired = docLock.tryLock(10000);
      if (lockAcquired) {
        lockWarning = (lockWarning ? lockWarning + " | " : "") + "Fallback: Document lock acquired.";
      }
    } catch (docLockErr) {
      lockWarning = (lockWarning ? lockWarning + " | " : "") + "DocLock acquisition exception: " + docLockErr.toString();
    }
  }

  if (!lockAcquired) {
    lockWarning = (lockWarning ? lockWarning + " | " : "") + "Concurrency warning: Execution proceeding WITHOUT lock safety.";
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    // Validate that the request contains post data
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Empty request received: postData.contents is undefined.");
    }

    var incomingData = JSON.parse(e.postData.contents);

    // Validate payload shape
    if (!incomingData || !incomingData.rows || !Array.isArray(incomingData.rows)) {
      throw new Error("Invalid schema structure: 'rows' array is required in payload.");
    }

    // 2. Resilient Target Sheet Resolution
    var targetSheet = getTargetSheet(ss);

    // 3. Dynamic Self-Healing Schema Expansion
    var columnCount = targetSheet.getLastColumn();
    var schemaHeaders = [];

    if (columnCount > 0) {
      // Fetch existing headers from Row 1
      schemaHeaders = targetSheet.getRange(1, 1, 1, columnCount).getValues()[0].map(function(h) {
        return String(h).trim();
      });
    }

    // Inject metadata fields into each record to construct the complete dataset schema
    incomingData.rows.forEach(function(record) {
      if (incomingData.imageUrl) {
        record["Image Backup Link"] = incomingData.imageUrl;
      }
      if (incomingData.docName) {
        record["Batch Name"] = incomingData.docName;
      }
    });

    // Determine all keys present in the incoming batch
    var incomingKeys = [];
    incomingData.rows.forEach(function(row) {
      Object.keys(row).forEach(function(key) {
        if (incomingKeys.indexOf(key) === -1) {
          incomingKeys.push(key);
        }
      });
    });

    if (columnCount === 0) {
      // Bootstrap brand-new sheet headers
      schemaHeaders = incomingKeys;
      if (schemaHeaders.length > 0) {
        targetSheet.getRange(1, 1, 1, schemaHeaders.length).setValues([schemaHeaders]);
        targetSheet.getRange(1, 1, 1, schemaHeaders.length).setFontWeight("bold");
        columnCount = schemaHeaders.length;
      }
    } else {
      // Check for schema drift: identify keys in payload not present in sheet columns
      var newHeaders = [];
      incomingKeys.forEach(function(key) {
        if (schemaHeaders.indexOf(key) === -1) {
          newHeaders.push(key);
        }
      });

      if (newHeaders.length > 0) {
        // Self-heal: append new headers dynamically to the end
        var startCol = columnCount + 1;
        targetSheet.getRange(1, startCol, 1, newHeaders.length).setValues([newHeaders]);
        targetSheet.getRange(1, startCol, 1, newHeaders.length).setFontWeight("bold");
        
        schemaHeaders = schemaHeaders.concat(newHeaders);
        columnCount = schemaHeaders.length;
      }
    }

    // 4. Batch Row Insertion
    incomingData.rows.forEach(function(record) {
      var rowData = schemaHeaders.map(function(header) {
        return record[header] !== undefined ? record[header] : "";
      });
      targetSheet.appendRow(rowData);
    });

    // Auto-resize columns for readability
    if (columnCount > 0) {
      try {
        targetSheet.autoResizeColumns(1, columnCount);
      } catch (autoErr) {
        // Ignore auto-resize errors on isolated environments
      }
    }

    // Write successful audit trail entry
    writeAuditLog(ss, "SUCCESS", incomingData.rows.length, incomingData.docName, incomingData.imageUrl, lockWarning || "None");

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "SUCCESS", 
      rowsSynced: incomingData.rows.length,
      warnings: lockWarning || undefined,
      echoed: incomingData,
      rawPostData: e.postData.contents
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // 5. Catch-All Isolation and Fallback Backup Sheet Serialization
    console.error("Critical error in webhook execution: " + err.toString());
    
    // Save raw POST body to the fallback sheet
    var rawPayload = "";
    if (e && e.postData && e.postData.contents) {
      rawPayload = e.postData.contents;
    }
    
    saveToFallbackSheet(ss, rawPayload, err.toString());
    writeAuditLog(ss, "FAIL", 0, "Unknown", "Unknown", "Critical execution error: " + err.toString());

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "ERR", 
      detail: err.toString(),
      backup_saved: true 
    })).setMimeType(ContentService.MimeType.JSON);

  } finally {
    // Release locks safely
    if (lockAcquired) {
      try {
        scriptLock.releaseLock();
      } catch (e) {}
      if (docLock) {
        try {
          docLock.releaseLock();
        } catch (e) {}
      }
    }
  }
}

/**
 * Resolves the primary target sheet named "Gateloga_Database", with fallback checks on "Logs" and "Logbook".
 * If none exist, it creates the tab and returns it.
 */
function getTargetSheet(ss) {
  var targetName = "Gateloga_Database";
  var sheet = ss.getSheetByName(targetName);
  if (sheet) return sheet;

  var fallbackNames = ["Logs", "Logbook"];
  for (var i = 0; i < fallbackNames.length; i++) {
    var name = fallbackNames[i];
    sheet = ss.getSheetByName(name);
    if (sheet) return sheet;
  }

  try {
    sheet = ss.insertSheet(targetName);
  } catch (err) {
    sheet = ss.getActiveSheet();
  }
  return sheet;
}

/**
 * Writes raw post payloads to a fail-safe backup sheet when main sheet insertion crashes.
 */
function saveToFallbackSheet(ss, rawPayload, errorMessage) {
  try {
    var backupName = "Gateloga_Failed_Payloads";
    var backupSheet = ss.getSheetByName(backupName);
    if (!backupSheet) {
      backupSheet = ss.insertSheet(backupName);
      backupSheet.getRange(1, 1, 1, 3).setValues([["Timestamp", "Error Message", "Raw Payload"]]);
      backupSheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    }
    var timestamp = new Date().toISOString();
    backupSheet.appendRow([timestamp, errorMessage, rawPayload]);
    try {
      backupSheet.autoResizeColumns(1, 3);
    } catch (e) {}
  } catch (fallbackErr) {
    console.error("Critical fallback database logging failure: " + fallbackErr.toString());
  }
}

/**
 * Writes an entry to the Gateloga audit log spreadsheet tab.
 */
function writeAuditLog(ss, status, rowCount, batchName, imageUrl, warnings) {
  try {
    var auditName = "Gateloga_Audit_Logs";
    var auditSheet = ss.getSheetByName(auditName);
    if (!auditSheet) {
      auditSheet = ss.insertSheet(auditName);
      auditSheet.getRange(1, 1, 1, 6).setValues([["Timestamp", "Status", "Row Count", "Batch Name", "Image URL", "Warnings"]]);
      auditSheet.getRange(1, 1, 1, 6).setFontWeight("bold");
    }
    var timestamp = new Date().toISOString();
    auditSheet.appendRow([
      timestamp, 
      status, 
      rowCount, 
      batchName || "N/A", 
      imageUrl || "N/A", 
      warnings || "None"
    ]);
    try {
      auditSheet.autoResizeColumns(1, 6);
    } catch (e) {}
  } catch (auditErr) {
    console.error("Failed to append to audit log: " + auditErr.toString());
  }
}
