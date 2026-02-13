    /* Dropdown button menu script for iFrames */
    document.getElementById('dropdown-menu1').addEventListener('change', function() {
        var iframe = document.getElementById('frame1');
        iframe.src = this.value;
    });
    document.getElementById('dropdown-menu2').addEventListener('change', function() {
        var iframe = document.getElementById('frame2');
        iframe.src = this.value;
    });
    document.getElementById('dropdown-menu3').addEventListener('change', function() {
        var iframe = document.getElementById('frame3');
        iframe.src = this.value;
    });
    document.getElementById('dropdown-menu4').addEventListener('change', function() {
        var iframe = document.getElementById('frame4');
        iframe.src = this.value;
    });

    window.addEventListener('scroll', function() {
        const sections = document.querySelectorAll('iframe');
        const navDots = document.querySelectorAll('.nav-dots a');
        let currentIndex = -1;
        sections.forEach((section, index) => {
            const rect = section.getBoundingClientRect();
            if (rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2) {
                currentIndex = index;
                }
            });
    navDots.forEach((dot, index) => {
        if (index === currentIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
});
function openIframeInNewTab(iframeId) {
    var iframe = document.getElementById(iframeId);
    if (iframe) {
        var url = iframe.src;
        window.open(url, '_blank');
    } else {
        alert('There has been a glitch in the matrix.. Try refreshing the page or get a new mobile IDK..');
    }
}