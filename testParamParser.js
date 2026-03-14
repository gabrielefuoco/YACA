const { safeJsonParse } = require('./src/utils/jsonParser');

const testCases = [
    {
        name: 'Perfect JSON',
        input: '{"vibe": "test"}',
        expected: { vibe: 'test' }
    },
    {
        name: 'Markdown code block',
        input: 'Here is the JSON: ```json\n{"vibe": "md"}\n```',
        expected: { vibe: 'md' }
    },
    {
        name: 'Trailing comma',
        input: '{"vibe": "trailing",}',
        expected: { vibe: 'trailing' }
    },
    {
        name: 'Comments',
        input: '{\n// this is a comment\n"vibe": "comment"\n/* multi \n line */\n}',
        expected: { vibe: 'comment' }
    },
    {
        name: 'Extra text around',
        input: 'Sure! Here are the queries: [{"vibe": "wrapped"}] I hope you like them.',
        expected: [{ vibe: 'wrapped' }]
    },
    {
        name: 'Malformed but fixable',
        input: ' { "queries": [ { "vibe": "fixable", } ] } ',
        expected: { queries: [{ vibe: 'fixable' }] }
    }
];

let passed = 0;
testCases.forEach(tc => {
    const result = safeJsonParse(tc.input);
    const success = JSON.stringify(result) === JSON.stringify(tc.expected);
    console.log(`[${success ? 'PASS' : 'FAIL'}] ${tc.name}`);
    if (!success) {
        console.log(`  Expected: ${JSON.stringify(tc.expected)}`);
        console.log(`  Got:      ${JSON.stringify(result)}`);
    } else {
        passed++;
    }
});

console.log(`\nResult: ${passed}/${testCases.length} tests passed.`);
process.exit(passed === testCases.length ? 0 : 1);
