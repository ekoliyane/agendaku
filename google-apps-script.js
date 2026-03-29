// ============================================
// AgendaKu — Google Apps Script Backend
// ============================================
// INSTRUKSI:
// 1. Buka spreadsheet: https://docs.google.com/spreadsheets/d/1whJkYM9NR7Zd-0ZToVJjZZ9OvYQ5QACcQbonZbQCSCI
// 2. Klik Extensions → Apps Script
// 3. Hapus semua kode di editor, paste semua kode ini
// 4. Klik Deploy → New Deployment
//    - Type: Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 5. Klik Deploy, copy URL-nya
// 6. Paste URL ke file app.js (variabel API_URL)
// ============================================

const SHEET_NAME = 'Tasks';

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['id', 'date', 'text', 'priority', 'notes', 'link', 'done', 'carryOver', 'originalId', 'fromDate', 'createdAt']);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  }
  return sheet;
}

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  
  try {
    const action = e.parameter.action;
    let result;
    
    switch (action) {
      case 'getTasks':
        result = getTasks(e.parameter.date);
        break;
      case 'getAllTasks':
        result = getAllTasks();
        break;
      case 'addTask':
        result = addTask(JSON.parse(e.postData.contents));
        break;
      case 'updateTask':
        result = updateTask(JSON.parse(e.postData.contents));
        break;
      case 'deleteTask':
        result = deleteTask(e.parameter.id);
        break;
      default:
        result = { error: 'Unknown action' };
    }
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function getTasks(date) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { tasks: [] };
  
  const headers = data[0];
  const tasks = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = {};
    headers.forEach((h, j) => { row[h] = data[i][j]; });
    // Convert done/carryOver to boolean
    row.done = row.done === true || row.done === 'TRUE' || row.done === 'true';
    row.carryOver = row.carryOver === true || row.carryOver === 'TRUE' || row.carryOver === 'true';
    if (row.date === date) {
      tasks.push(row);
    }
  }
  
  return { tasks };
}

function getAllTasks() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { dates: {} };
  
  const headers = data[0];
  const dates = {};
  
  for (let i = 1; i < data.length; i++) {
    const row = {};
    headers.forEach((h, j) => { row[h] = data[i][j]; });
    row.done = row.done === true || row.done === 'TRUE' || row.done === 'true';
    row.carryOver = row.carryOver === true || row.carryOver === 'TRUE' || row.carryOver === 'true';
    
    if (!dates[row.date]) dates[row.date] = [];
    dates[row.date].push(row);
  }
  
  return { dates };
}

function addTask(task) {
  const sheet = getOrCreateSheet();
  sheet.appendRow([
    task.id,
    task.date,
    task.text,
    task.priority,
    task.notes || '',
    task.link || '',
    task.done || false,
    task.carryOver || false,
    task.originalId || '',
    task.fromDate || '',
    task.createdAt || Date.now()
  ]);
  return { success: true, task };
}

function updateTask(task) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === task.id) {
      const row = i + 1;
      if (task.text !== undefined) sheet.getRange(row, 3).setValue(task.text);
      if (task.notes !== undefined) sheet.getRange(row, 5).setValue(task.notes);
      if (task.link !== undefined) sheet.getRange(row, 6).setValue(task.link);
      if (task.done !== undefined) sheet.getRange(row, 7).setValue(task.done);
      return { success: true };
    }
  }
  return { error: 'Task not found' };
}

function deleteTask(id) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: 'Task not found' };
}
