const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const axios = require('axios');
const { NETLIFY_AUTH_TOKEN } = require('./secrets');
const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');

async function deployToNetlify(templateFolder, siteName = '') {
  const zipPath = path.join(__dirname, 'site.zip');

  // Zip the template folder
  const zip = new AdmZip();
  zip.addLocalFolder(templateFolder);
  zip.writeZip(zipPath);

  const form = new FormData();
  form.append('file', fs.createReadStream(zipPath));
  if (siteName) form.append('name', siteName);

  try {
    const response = await axios.post(
      'https://api.netlify.com/api/v1/sites',
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${NETLIFY_AUTH_TOKEN}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    const deployUrl = response.data.ssl_url || response.data.url;
    fs.unlinkSync(zipPath); // clean up
    return { success: true, url: deployUrl };

  } catch (error) {
    // Capture full error message
    const errorMsg = error.response?.data || error.message;
    console.error('❌ Netlify deploy error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

module.exports = { deployToNetlify };
