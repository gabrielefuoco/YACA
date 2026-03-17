const { getImageKitUrl } = require('../src/utils/imageProcessor');

const testCases = [
    {
        name: 'Standard Portrait',
        url: 'https://image.tmdb.org/t/p/w500/sh79SjayS59vegh6fP2zRnu88Dq.jpg',
        options: {},
        expected: 'w-300,h-450'
    },
    {
        name: 'Landscape without logo',
        url: 'https://image.tmdb.org/t/p/original/backdrop.jpg',
        options: { posterShape: 'landscape' },
        expected: 'w-600,h-338'
    },
    {
        name: 'Landscape with Item Logo (Dynamic)',
        url: 'https://image.tmdb.org/t/p/original/backdrop.jpg',
        options: { 
            posterShape: 'landscape',
            logoUrl: 'https://image.tmdb.org/t/p/w500/logo.png' 
        },
        expected: 'l-image,i-base64:' // Verifichiamo che ci sia l'overlay base64
    }
];

testCases.forEach(tc => {
    const result = getImageKitUrl(tc.url, tc.options, 'test_ik');
    console.log(`Test: ${tc.name}`);
    console.log(`URL: ${result}`);
    if (result.includes(tc.expected)) {
        console.log('✅ Success\n');
    } else {
        console.log('❌ Failed\n');
    }
});
