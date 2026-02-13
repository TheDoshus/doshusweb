var webuiport = 5965;
var empId = "";
var firstRun = true;
function genId() {
	var id = "";
	for (var i = 0; i < 10; i++)
		id += Math.floor(Math.random() * 9);
	return id;
}
function getStatus(url, funcvalid, funcinvalid) {
	var xmlhttp;
		xmlhttp = new XMLHttpRequest();
																							//aaustinp wass here :)
	xmlhttp.onreadystatechange = function () {
		if (xmlhttp.readyState == 4) {
			if (xmlhttp.responseText == "valid")
				funcvalid();
			else
				funcinvalid();
		}
	};
	try {
		xmlhttp.open("GET", url, true);
		xmlhttp.send();
	}
	catch (e) {
		funcinvalid();
	}
}
function asciihex(str) {
	var text = "";

	for (var i = 0, l = str.length; i < l; i++) {
		var hex = Number(str.charCodeAt(i)).toString(16);
		text += hex;
	}
	return text;
}
//Fail Notification
function printFailed() {
	alert("Failed to print the barcode!\nIDK why.. is your printer on? It just be like dat sometimes.");
}
function quietPrintFailed() {
	console.log("Failed to print the barcode!\nIDK why.. is your printer on? It just be like dat sometimes.");
}
function trimTextField(barcode, text) {
	if (document.getElementById("nowhitespace").checked) {
		barcode = barcode.trim();
		text = text.trim();
	}
}
function printlabel() {
	var barcode = document.getElementById("barcodedata").value;
	var text = document.getElementById("displaytext").value;
	trimTextField(barcode, text);
	getStatus(
		"http://localhost:" + webuiport + "/printer?action=print&type=barcode&" +
		"data=" + asciihex(barcode) +
		"&text=" + asciihex(text) +
		"&quantity=" + document.getElementById("quantity").value +
		"&badgeid=" + empId +
		"&seq=" + genId(),
		function () { },
		printFailed
	);
	document.getElementById('barcodedata').select();
}
function printSticker(printString) {
	trimTextField(printString, printString);
	getStatus(
		"http://localhost:" + webuiport + "/printer?action=print&type=barcode&" +
		"data=" + asciihex(printString) +
		"&text=" + asciihex(printString) +
		"&quantity=" + document.getElementById("quantity").value +
		"&badgeid=" + empId +
		"&seq=" + genId(),
		function () { },
		printFailed
	);
}
function focusElement(id) {
	document.getElementById(id).value = "";
	document.getElementById(id).focus();
}
function KeyCheck(e) {
	//listen for scanner prefix [CR]
	if (e.keyCode == 13) {
		if (document.activeElement == document.getElementById('barcodedata') && document.getElementById("jumptoq").checked) {
			setTimeout(function () { focusElement("quantity"); }, 10);
		}
		else if (document.activeElement == document.getElementById('barcodedata')) {
			if (document.getElementById("printafter").checked) printlabel();
			else document.getElementById('barcodedata').select();
		}
		else if (document.activeElement == document.getElementById('quantity') && document.getElementById("jumptoq").checked && document.getElementById("printafter").checked) {
			printlabel();
			setTimeout(function () { focusElement("barcodedata"); }, 10);
		}
	}
}
function printQuantitySticker() {
    var inputValue = document.getElementById("quantitySticker").value.trim();
    
    if (inputValue === "" || inputValue === "0" || inputValue === "1") {
        printSticker("ASIN STICKERING");
    } else if (isNaN(inputValue)) {
        alert("We only accept numbers here pal.");
    } else {
        var text = "ASIN STICKERING [" + inputValue + "]";
        printSticker(text);
    }
}
function printBulk() {
	var textArea = document.getElementById("textAreaID");
	var asins = textArea.value.split('\n');
	for (var i = 0; i < asins.length; i++) {
		printSticker(asins[i], asins[i]);
	}
	textArea.value = "";
}
var getJSON = function (url, callback) {
	var xhr = new XMLHttpRequest ();
	xhr.withCredentials = true;
	xhr.open('GET', url, true);
	xhr.responseType = 'json';
	xhr.onload = function () {
		var status = xhr.status;
		if (status == 200) {
			callback(null, xhr.response);
		} else {
			callback(status);
		}
	};
	xhr.send();
};

document.addEventListener('DOMContentLoaded', function() {
    var inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
    inputs.forEach(function(input) {
        input.addEventListener('keypress', function(event) {
            if (event.keyCode === 13) {
                event.preventDefault();
                printlabel();
            }
        });
    });
});

function print(text) {
	console.log(text); // This will log "Dist. Damage" for the DD button
	// Add your actual printing logic here
}

document.getElementById('quantitySticker').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        printQuantitySticker();
    }
});

function printOpexStickerPS() {
  const opexNumber = document.getElementById('opex-number-ps').value;
  if (opexNumber.trim() !== '' && !isNaN(opexNumber)) {
    const fullText = `tsOpx${opexNumber}PS`;
    printSticker(fullText); // Uses your existing printSticker function
  } else {
    alert("yo... you supposed to put a number here or maybe the printer said no");
  }
}
function printOpexStickerShort() {
  const opexNumber = document.getElementById('opex-number-short').value;
  if (opexNumber.trim() !== '' && !isNaN(opexNumber)) {
    const fullText = `tsOpx${opexNumber}Short`;
    printSticker(fullText); // Uses your existing printSticker function
  } else {
    alert("yo... you supposed to put a number here or maybe the printer said no");
  }
}
// Add event listeners for Enter key
document.addEventListener('DOMContentLoaded', function() {
  // For the PS input field
  document.getElementById('opex-number-ps').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevent form submission if inside a form
      printOpexStickerPS();
    }
  });
  // For the Short input field
  document.getElementById('opex-number-short').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevent form submission if inside a form
      printOpexStickerShort();
    }
  });
});

// Get the input elements
const opexNumberPS = document.getElementById('opex-number-ps');
const opexNumberShort = document.getElementById('opex-number-short');
// Function to format the input with leading zero if needed
function formatWithLeadingZero(inputElement) {
  // Format function that can be reused
  const formatValue = function(element) {
    const value = element.value.trim();
    
    // If it's a single digit (1-9), add a leading zero
    if (/^[1-9]$/.test(value)) {
      element.value = '0' + value;
    }
  };

  // When Enter key is pressed
  inputElement.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      formatValue(this);
    }
  });
}

// Apply the formatting to both input fields
formatWithLeadingZero(opexNumberPS);
formatWithLeadingZero(opexNumberShort);