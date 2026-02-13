(function() {
    // 1. List your Spotify Playlist IDs here
    const playlistIds = [
        '7oanTkXtuVwcAUx882IQqD', // WTF Doshus
        '1lHiEucVsKf04tip7VetOo', // Gimme Music
        '0s3TtgkY01p1L8PRqUggVV', // Spaceland
        '1YnNTk8GPvXPDJdzktSwwJ',  // TIME2005
        '6BIUohSTfEaLfuFlWvtAVd',  // kODAK
        '1Z5J2B3Y218mcndyLLLOCN',  // Doshus   
        '4BCpeg24zmnImrDSEVfEm0',  // Meme   
        '0dtsgsCgovlqVMCf5DNraj',  // Chill   
        '1BC12paN2yVqj81zHzB2B1',  // Espanol   
        '2HrlpE0Cu2fXDubcHaBpsF'  // Rave Favs
    ];

    // 2. Pick a random index from the array
    const randomIndex = Math.floor(Math.random() * playlistIds.length);
    const selectedId = playlistIds[randomIndex];

    // 3. Target the iframe and update the source
    // Note: The URL format must be https://open.spotify.com/embed/playlist/ID
    const iframe = document.getElementById('spotify-embed');
    iframe.src = `https://open.spotify.com/embed/playlist/${selectedId}`;
})();

// Random meme/video loader - Auto-loads from JSON
async function loadRandomMeme() {
    try {
        const response = await fetch('/memes/meme-list.json');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const memeFiles = await response.json();

        // Get the container element
        const memeContainer = document.getElementById('meme-container');

        if (memeContainer && memeFiles.length > 0) {
            // Pick a random file
            const randomIndex = Math.floor(Math.random() * memeFiles.length);
            const randomFile = memeFiles[randomIndex];

            // Check if it's a video or image
            const isVideo = /\.(mp4|webm|mov)$/i.test(randomFile);

            // Clear the container
            memeContainer.innerHTML = '';

            if (isVideo) {
                // Create video element
                const video = document.createElement('video');
                video.src = randomFile;
                video.autoplay = true;
                video.loop = true;
                video.muted = true; // Muted for autoplay to work
                video.playsInline = true; // For mobile
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                video.style.borderRadius = '10px';

                video.onerror = function() {
                    console.error('Failed to load video:', this.src);
                    memeContainer.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/d/d1/Image_not_available.png?20210219185637" alt="Error">';
                };

                memeContainer.appendChild(video);
                console.log(`🎬 Loaded random video: ${randomFile}`);
            } else {
                // Create image element
                const img = document.createElement('img');
                img.src = randomFile;
                img.alt = 'Random Meme';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '10px';

                img.onerror = function() {
                    console.error('Failed to load image:', this.src);
                    this.src = 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Image_not_available.png?20210219185637';
                };

                memeContainer.appendChild(img);
                console.log(`🎲 Loaded random meme: ${randomFile}`);
            }
        } else if (memeFiles.length === 0) {
            console.warn('⚠️  No memes found in meme-list.json');
        }

    } catch (error) {
        console.error('❌ Error loading memes:', error);

        const memeContainer = document.getElementById('meme-container');
        if (memeContainer) {
            memeContainer.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/d/d1/Image_not_available.png?20210219185637" alt="Loading">';
        }
    }
}

window.addEventListener('DOMContentLoaded', loadRandomMeme);