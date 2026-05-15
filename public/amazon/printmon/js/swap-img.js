document.addEventListener('DOMContentLoaded', function() {
	var modal = document.getElementById('modal');
	var modalImg = document.getElementById("modal-image");
	var closeBtn = document.getElementsByClassName("close")[0];

	// Get all image buttons — only wire up if modal elements exist
	if (!modal || !modalImg) return;

	var imgButtons = document.getElementsByClassName('image-button');
	for (var i = 0; i < imgButtons.length; i++) {
		imgButtons[i].onclick = function() {
			modal.style.display = "block";
			modalImg.src = this.getAttribute('data-fullimage');
		}
	}
	// Close the modal when clicking on 'x'
	if (closeBtn) {
		closeBtn.onclick = function() {
			modal.style.display = "none";
		}
	}
	// Close the modal when clicking outside the image
	window.addEventListener('click', function(event) {
		if (event.target == modal) {
			modal.style.display = "none";
		}
	});
});

function toggleDropdown() {
	var dd = document.getElementById("myDropdown");
	if (dd) dd.classList.toggle("show");
}

// Close the dropdown if the user clicks outside of it
window.addEventListener('click', function(event) {
	if (!event.target.matches('.dropbtn2')) {
		var dropdowns = document.getElementsByClassName("dropdown2-content");
		for (var i = 0; i < dropdowns.length; i++) {
			var openDropdown = dropdowns[i];
			if (openDropdown.classList.contains('show')) {
				openDropdown.classList.remove('show');
			}
		}
	}
});

// ARCS DOWNLOAD MODAL
function openArcsModal() {
	var m = document.getElementById('arcsDownloadModal');
	if (m) m.style.display = 'flex';
}
function closeArcsModal() {
	var m = document.getElementById('arcsDownloadModal');
	if (m) m.style.display = 'none';
}
// DOWNLOAD ALL — opens each file in a new tab with a small delay
function downloadAllArcs() {
	const files = [
	'https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/',
	'https://drive.corp.amazon.com/view/aaustinp@/Backups/DoshusTMScriptz.zip?download=true',
	'https://drive.corp.amazon.com/view/aaustinp@/Backups/Bookmarks.json?download=true'
	];
	files.forEach(function(url, index) {
		setTimeout(function() {
			window.open(url, '_blank');
		}, index * 300);
	});
}
