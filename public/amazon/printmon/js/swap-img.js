document.addEventListener('DOMContentLoaded', function() {
	var modal = document.getElementById('modal');
	var modalImg = document.getElementById("modal-image");
	var closeBtn = document.getElementsByClassName("close")[0];

	// Get all image buttons
	var imgButtons = document.getElementsByClassName('image-button');

	// Attach click event to each button
	for (var i = 0; i < imgButtons.length; i++) {
		imgButtons[i].onclick = function() {
			modal.style.display = "block";
			modalImg.src = this.getAttribute('data-fullimage');
			}
	}
	// Close the modal when clicking on 'x'
	closeBtn.onclick = function() {
		modal.style.display = "none";
	}
	// Close the modal when clicking outside the image
	window.onclick = function(event) {
		if (event.target == modal) {
			modal.style.display = "none";
		}
	}
});

function toggleDropdown() {
    document.getElementById("myDropdown").classList.toggle("show");
}

// Close the dropdown if the user clicks outside of it
window.onclick = function(event) {
    if (!event.target.matches('.dropbtn2')) {
        var dropdowns = document.getElementsByClassName("dropdown2-content");
        for (var i = 0; i < dropdowns.length; i++) {
            var openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
}