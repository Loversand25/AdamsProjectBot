// admin.js
const fs = require('fs');
const path = require('path');

const ADMIN_IDS = ['7782756234']; // Replace with your real Telegram user ID

function isAdmin(userId) {
return ADMIN_IDS.includes(userId.toString());
}

function listAllSites() {
const dir = path.join(__dirname, 'sites');
if (!fs.existsSync(dir)) return [];
return fs.readdirSync(dir);
}

function readSiteHTML(siteFolder) {
const filePath = path.join(__dirname, 'sites', siteFolder, 'index.html');
if (!fs.existsSync(filePath)) return null;
return fs.readFileSync(filePath, 'utf8');
}

function updateSiteHTML(siteFolder, newHTML) {
const filePath = path.join(__dirname, 'sites', siteFolder, 'index.html');
fs.writeFileSync(filePath, newHTML, 'utf8');
}

module.exports = { isAdmin, listAllSites, readSiteHTML, updateSiteHTML };


