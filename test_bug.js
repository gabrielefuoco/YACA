// Test to demonstrate the bug

// Scenario:
// 1. User enters AI prompt: "Horror movies"
// 2. AI returns: filters with_genres: "27" (horror genre)
// 3. handleAiGenerate is called:
//    - Creates blocks from AI filters via filtersToBlock()
//    - Sets previewFilters = queries[0] (the RAW AI response filters)
// 4. User manually edits the first block: adds genre "18" (drama)
// 5. User clicks "Generate Preview"
// 6. BUG: handleManualPreview builds filters from the UPDATED block[0]
//    - buildFiltersFromBlock(blocks[0]) gets correct manual filters with both genres
//    - BUT previewFilters still contains the original queries[0] from AI!
//    - The issue is that when manually editing a block after AI generation,
//    - the previewFilters state is NOT automatically updated to reflect block changes
//    - It only gets updated when handleManualPreview() is explicitly called
// 7. The PosterRow receives the stale previewFilters from the AI response

console.log("BUG IDENTIFICATION:");
console.log("- Line 184: setPreviewFilters(queries[0]) sets ORIGINAL AI filters");
console.log("- Line 218: handleManualPreview() rebuilds from blocks[0]");
console.log("- But there's NO automatic sync between blocks changes and previewFilters");
console.log("- User might manually edit blocks but the preview doesn't update unless handleManualPreview() is called");
