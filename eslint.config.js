const js = require("@eslint/js");

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                require: "readonly",
                module: "readonly",
                exports: "readonly",
                process: "readonly",
                console: "readonly",
                __dirname: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                Promise: "readonly",
                URL: "readonly",
                Buffer: "readonly",
                Date: "readonly",
                Map: "readonly",
                Set: "readonly",
                JSON: "readonly",
                Math: "readonly",
                parseInt: "readonly",
                parseFloat: "readonly",
                encodeURIComponent: "readonly",
                decodeURIComponent: "readonly",
                describe: "readonly",
                it: "readonly",
                expect: "readonly",
                beforeEach: "readonly",
                afterEach: "readonly",
                beforeAll: "readonly",
                afterAll: "readonly",
                jest: "readonly",
            }
        },
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
            "no-console": "off",
            "no-undef": "error",
            "eqeqeq": ["error", "always"],
            "no-var": "error",
            "prefer-const": "warn"
        }
    },
    {
        ignores: ["node_modules/", "coverage/"]
    }
];
