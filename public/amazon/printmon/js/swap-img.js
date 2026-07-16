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
	if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
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

// ZEPHYY GALLERY ORB — rotate the tooltip quip each page load
(function() {
	var tip = document.querySelector('.zephyy-orb-tip');
	if (!tip) return;
	var quips = [
		'skins I cooked up — come see ✨',
		'psst… the theme vault is this way 🌌',
		'fresh palette drops in the gallery',
		'your coworkers keep requesting skins. peek the results',
		'tap the orb. cosmic printmons await',
		'I recolor this whole page on request, you know',
		'need a new vibe for the barcode chaos?',
		'my gallery is stocked and ready to go',
		'feeling this base? there\'s plenty more',
		'want to see what else I can generate?',
		'grab a new skin. on the house 😉'
	];
	tip.textContent = "Zephyy: " + quips[Math.floor(Math.random() * quips.length)];

	// Docked orb (inside the horizontal scroll strip): the strip's scroller
	// clips the tip, so lift it out with position:fixed while shown.
	var orb = tip.closest('.zephyy-orb-sitewide-wrapper');
	if (orb && orb.closest('.zephyy-orb-dock')) {
		var place = function() {
			var r = orb.getBoundingClientRect();
			tip.style.position = 'fixed';
			tip.style.bottom = 'auto';
			tip.style.top = (r.bottom + 8) + 'px';
			tip.style.left = Math.max(8, r.left + r.width / 2 - 105) + 'px';
			tip.style.transform = 'none'; // Clear the CSS transform
		};
		var reset = function() {
			tip.style.position = '';
			tip.style.top = '';
			tip.style.left = '';
			tip.style.transform = '';
		};
		orb.addEventListener('mouseenter', place);
		orb.addEventListener('focus', place);
		orb.addEventListener('mouseleave', reset);
		orb.addEventListener('blur', reset);
	}
})();
