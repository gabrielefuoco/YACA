const express = require('express');
const app = express();
const path = require('path');

app.get('/test', (req, res) => {
    const filePath = 'C:\\Users\\gabri\\APP\\Streaming\\YACA\\.cache\\badges\\tt0252985_ITA_undefined_21.jpg';
    res.sendFile(filePath, { maxAge: 86400000 }, (err) => {
        if (err) {
            console.error('SendFile Error:', err);
            if (!res.headersSent) {
                res.status(500).send(err.message);
            }
        } else {
            console.log('Sent successfully');
        }
    });
});

app.listen(7001, () => {
    console.log('Test server listening on 7001');
});
