// firebase.js
const admin = require('firebase-admin');
const path = require('path');

// Load your service account JSON
const serviceAccount = require(path.resolve(__dirname, 'firebase-key.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://adamsprojectbot-default-rtdb.firebaseio.com'
});

const db = admin.database();

async function saveWebsiteData(uid, data) {
  await db.ref(`websites/${uid}`).push(data);
}

async function getUserWebsites(uid) {
  const snapshot = await db.ref(`websites/${uid}`).once('value');
  return snapshot.val() || {};
}

async function getWallet(uid) {
  const snapshot = await db.ref(`wallets/${uid}`).once('value');
  return snapshot.val() || 0;
}

async function setWallet(uid, amount) {
  await db.ref(`wallets/${uid}`).set(amount);
}

async function addToWallet(uid, amount) {
  const current = await getWallet(uid);
  const newBalance = current + amount;
  await setWallet(uid, newBalance);
  return newBalance;
}

async function deductFromWallet(uid, amount) {
  const current = await getWallet(uid);
  const newBalance = current - amount;
  if (newBalance < 0) throw new Error('Insufficient funds');
  await setWallet(uid, newBalance);
  return newBalance;
}

module.exports = {
  db,
  saveWebsiteData,
  getUserWebsites,
  getWallet,
  setWallet,
  addToWallet,
  deductFromWallet
};
