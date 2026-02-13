// Function to set a random wallpaper
function setRandomWallpaper() {
const randomIndex = Math.floor(Math.random() * wallpapers.length);
const wallpaperUrl = wallpapers[randomIndex];
// Check if the wallpaper URL is a video (based on file extension)
const isVideo = wallpaperUrl.endsWith('.mp4') || wallpaperUrl.endsWith('.webm');
if (isVideo) {
	// Create a video element for the wallpaper
	const videoElement = document.createElement('video');
	videoElement.src = wallpaperUrl;
	videoElement.autoplay = true;
	videoElement.loop = true;
	videoElement.muted = true;
	videoElement.style.position = 'fixed';
	videoElement.style.top = 0;
	videoElement.style.left = 0;
	videoElement.style.width = '100%';
	videoElement.style.height = '100%';
	videoElement.style.objectFit = 'fill';
	videoElement.style.zIndex = '-1'; // Ensure video is behind other content

	// Append the video element to the body
	document.body.appendChild(videoElement);
	} 
else {
	// For image wallpapers, just set it as the background image
	document.body.style.backgroundImage = `url('${wallpaperUrl}')`;
	document.body.style.backgroundSize = 'contain';
	document.body.style.height =  '100vh';
}
}
// Call the function to set the wallpaper
setRandomWallpaper();