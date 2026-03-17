require('dotenv').config();
const { getImageKitUrl } = require('./src/utils/imageProcessor');
console.log("process.env.IMAGEKIT_ID:", `'${process.env.IMAGEKIT_ID}'`);

const testUrl = "https://image.tmdb.org/t/p/w500/z09QAf8WbZncbitewNk6lKYMZsh.jpg";
const options = { posterShape: 'landscape', logoUrl: 'https://image.tmdb.org/t/p/w500/testlogo.png' };

const result = getImageKitUrl(testUrl, options, process.env.IMAGEKIT_ID);
console.log("Resulting URL:", result);

const noCustomId = getImageKitUrl(testUrl, options);
console.log("No custom ID passed:", noCustomId);
