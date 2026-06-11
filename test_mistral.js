require('dotenv').config();
const { generateTmdbFiltersFromPrompt } = require('./src/ai/router');

async function test() {
    const mistralKey = process.env.MISTRAL_API_KEY;
    const { Mistral } = require('@mistralai/mistralai');
    const client = new Mistral({ apiKey: mistralKey });
    const { buildAiPrompt } = require('./src/ai/prompts');
    const response = await client.chat.complete({
        model: "mistral-small-latest",
        messages: [
            { role: "system", content: buildAiPrompt('multi_query') },
            { role: "user", content: `QUERY: "film horror italiani anni 80"` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
    });
    console.log("RAW MISTRAL OUTPUT:", response.choices[0].message.content);
    const res = await generateTmdbFiltersFromPrompt("film horror italiani anni 80", mistralKey, 'multi_query');
    console.log(JSON.stringify(res, null, 2));
}

test().catch(console.error);
