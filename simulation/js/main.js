function openPart(evt, name) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
      tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
      tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(name).style.display = "block";
    evt.currentTarget.className += " active";
}

function startup() {
    document.getElementById("default").click();
}

window.onload = startup;

function getOutput() {
    const Nt = parseFloat(document.getElementById("Nt").value);
    const Nr = parseFloat(document.getElementById("Nr").value);
    const SNR = parseFloat(document.getElementById("SNR").value);
    const R = parseFloat(document.getElementById("R").value);

    if (isNaN(Nt) || isNaN(Nr) || isNaN(SNR) || isNaN(R)) {
        alert("Please enter valid numbers for all inputs.");
        return;
    }

    const m = R / Math.log2(SNR);
    const d = (Nt - m) * (Nr - m);

    document.getElementById("observations").innerHTML = `
        <p><strong>m:</strong> ${m.toFixed(2)}</p>
        <p><strong>d:</strong> ${d.toFixed(2)}</p>
    `;
}

function getOutput2() {
    const Nt = parseFloat(document.getElementById("Nt2").value);
    const Nr = parseFloat(document.getElementById("Nr2").value);
    const SNR = parseFloat(document.getElementById("SNR2").value);
    const Pe = parseFloat(document.getElementById("Pe").value);

    if (isNaN(Nt) || isNaN(Nr) || isNaN(SNR) || isNaN(Pe)) {
        alert("Please enter valid numbers for all inputs.");
        return;
    }

    const d = -Math.log2(Pe) / Math.log2(SNR);
    const m = d / Nt;

    document.getElementById("observations2").innerHTML = `
        <p><strong>d:</strong> ${d.toFixed(2)}</p>
        <p><strong>m:</strong> ${m.toFixed(2)}</p>
    `;
}
