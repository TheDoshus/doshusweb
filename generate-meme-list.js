const fs = require('fs');
const path = require('path');

// Configuration
const memesDir = './public/memes';
const outputFile = './public/memes/meme-list.json';

// Read the memes directory
fs.readdir(memesDir, (err, files) => {
    if (err) {
        console.error('❌ Error reading directory:', err);
        console.error('Make sure the ./public/memes folder exists!');
        return;
    }

    // Filter only image AND video files
    const imageFiles = files.filter(file =>
        /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/i.test(file)
    );

    if (imageFiles.length === 0) {
        console.warn('⚠️  No image files found in the memes directory!');
        console.warn('Add some .jpg, .png, or .gif files to ./public/memes/');
        return;
    }

    // Create array of paths
    const memePaths = imageFiles.map(file => `/memes/${file}`);

    // Write to JSON file
    fs.writeFile(outputFile, JSON.stringify(memePaths, null, 2), err => {
        if (err) {
            console.error('❌ Error writing file:', err);
        } else {
            console.log('✅ Successfully generated meme list!');
            console.log(`�� Found ${memePaths.length} images:`);
            memePaths.forEach((path, index) => {
                console.log(`   ${index + 1}. ${path}`);
            });
            console.log(`
�� Saved to: ${outputFile}`);
        }
    });
});
