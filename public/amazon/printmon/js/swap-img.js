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
		'themes I cooked up — come see ✨',
		'psst… the theme vault is this way 🌌',
		'fresh palette drops in the gallery',
		'your coworkers keep requesting themes. peek the results',
		'tap the orb. cosmic printmons await',
		'I recolor this whole page on request, you know',
		'need a new vibe for the barcode chaos?',
		'my gallery is stocked and ready to go',
		'feeling this base? there\'s plenty more',
		'want to see what else I can generate?',
		'grab a new theme. on the house 😉',
		'ruminating on new color schemes… wanna see? 🤔',
		'*reefing through the theme vault* oh hey, didn\'t see you there',
		'this page? yeah I painted it. more where that came from',
		'psst. the gallery misses you',
		'legally obligated to mention I make themes now',
		'you scan barcodes, I scan color wheels. we are not the same 💅',
		'caught you looking 👀 the gallery\'s one tap away',
		'plotting my next theme drop as we speak'
	];
	tip.textContent = "Zephyy: " + quips[Math.floor(Math.random() * quips.length)];

	// Whorl avatar — same glyph her chat orb wears on doshus.net (the chat
	// stack isn't loaded on printmon, so the SVG is inlined here).
	var core = document.querySelector('.zephyy-orb-dock .sitewide-orb-core');
	if (core && !core.querySelector('.zp-orb-glyph')) {
		var glyph = document.createElement('span');
		glyph.className = 'zp-orb-glyph';
		glyph.innerHTML =
			'<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
			'<defs><linearGradient id="pmOrbGrad" x1="0" y1="0" x2="1" y2="1">' +
			'<stop offset="0%" stop-color="#ffffff" stop-opacity="0.98"/>' +
			'<stop offset="50%" stop-color="#d8f0ff" stop-opacity="0.9"/>' +
			'<stop offset="100%" stop-color="#ffffff" stop-opacity="0.75"/>' +
			'</linearGradient></defs>' +
			'<circle cx="32" cy="32" r="29" stroke="#ffffff" stroke-opacity="0.2" stroke-width="0.8" fill="none"/>' +
			'<g class="whorl-outer"><path d="M 32 9 A 23 23 0 1 1 12 44" stroke="url(#pmOrbGrad)" stroke-width="3.2" stroke-linecap="round" opacity="0.85"/><circle cx="32" cy="9" r="2.0" fill="#ffffff" opacity="0.9"/></g>' +
			'<g class="whorl-mid"><path d="M 45 40 A 15 15 0 1 1 32 17" stroke="url(#pmOrbGrad)" stroke-width="3.4" stroke-linecap="round" opacity="0.9"/><circle cx="45" cy="40" r="1.8" fill="#ffffff" opacity="0.95"/></g>' +
			'<g class="whorl-inner"><path d="M 25 36 A 8 8 0 1 1 39 36" stroke="url(#pmOrbGrad)" stroke-width="3.8" stroke-linecap="round" opacity="0.98"/><circle cx="25" cy="36" r="1.6" fill="#ffffff" opacity="0.98"/></g>' +
			'<circle cx="32" cy="32" r="3.6" fill="#ffffff" class="whorl-center"/></svg>';
		core.appendChild(glyph);
	}

	// Docked orb (inside the horizontal scroll strip): the strip's scroller
	// clips the tip, so lift it out with position:fixed while shown.
	var orb = tip.closest('.zephyy-orb-sitewide-wrapper');
	if (orb && orb.closest('.zephyy-orb-dock')) {
		var touchTimer;
		var place = function() {
			var r = orb.getBoundingClientRect();
			// Show + fix BEFORE measuring: the tip is display-gated in CSS and
			// a hidden box measures 0 wide. Opacity/visibility are set here too —
			// the CSS hover fallback is mouse-only now, so touch relies on this.
			tip.style.display = 'block';
			tip.style.opacity = '1';
			tip.style.visibility = 'visible';
			tip.style.position = 'fixed';
			tip.style.bottom = 'auto';
			tip.style.transition = 'none'; // else transform animates from the CSS fallback, sliding the tip sideways
			tip.style.transform = 'none'; // Clear the CSS transform
			// Above the orb, centered and clamped fully on-screen at real size
			var tr = tip.getBoundingClientRect();
			tip.style.top = Math.max(8, r.top - tr.height - 8) + 'px';
			var left = r.left + r.width / 2 - tr.width / 2;
			left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
			tip.style.left = left + 'px';
		};
		var reset = function() {
			tip.style.display = '';
			tip.style.opacity = '';
			tip.style.visibility = '';
			tip.style.position = '';
			tip.style.bottom = '';
			tip.style.top = '';
			tip.style.left = '';
			tip.style.transition = '';
			tip.style.transform = '';
		};
		orb.addEventListener('mouseenter', place);
		orb.addEventListener('focus', place);
		// Touch: mouseenter/mouseleave are unreliable on mobile, so show on
		// touchstart and clear on a short timer after the finger lifts
		// (a tap navigates to the gallery anyway; this covers scroll-touches).
		orb.addEventListener('touchstart', function() {
			clearTimeout(touchTimer);
			place();
		}, { passive: true });
		var touchEnd = function() {
			clearTimeout(touchTimer);
			touchTimer = setTimeout(reset, 1600);
		};
		orb.addEventListener('touchend', touchEnd, { passive: true });
		orb.addEventListener('touchcancel', touchEnd, { passive: true });
		orb.addEventListener('mouseleave', reset);
		orb.addEventListener('blur', reset);
	}
})();
