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
let txElements = [];
let rxElements = [];
let tradeoffPoints = [];

// DOM elements
const form = document.getElementById('parametersForm');
const txAntennasInput = document.getElementById('txAntennas');
const rxAntennasInput = document.getElementById('rxAntennas');
const snrInput = document.getElementById('snr');
const modeSelect = document.getElementById('mode');
const fixedValueInput = document.getElementById('fixedValue');
const fixedValueLabel = document.getElementById('fixedValueLabel');

// Output elements
const maxDiversitySpan = document.getElementById('maxDiversity');
const maxMultiplexingSpan = document.getElementById('maxMultiplexing');
const operatingRSpan = document.getElementById('operatingR');
const operatingDSpan = document.getElementById('operatingD');
const explanation1 = document.getElementById('explanation1');
const explanation2 = document.getElementById('explanation2');

// Canvas elements
const tradeoffChart = document.getElementById('tradeoffChart');
let tradeoffCtx = null;

// Initialize with proper canvas handling
function init() {
    // Ensure we have the canvas element
    if (tradeoffChart) {
        // Set explicit dimensions
        tradeoffChart.width = tradeoffChart.parentElement.clientWidth || 300;
        tradeoffChart.height = 250;
        tradeoffCtx = tradeoffChart.getContext('2d');
    }
    
    // Add event listeners
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            updateSystem();
        });
    }
    
    if (modeSelect) {
        modeSelect.addEventListener('change', function() {
            updateFixedValueLabel();
        });
    }
    
    // Initial render
    updateSystem();
    
    // Handle window resize
    window.addEventListener('resize', function() {
        if (tradeoffChart) {
            tradeoffChart.width = tradeoffChart.parentElement.clientWidth || 300;
            renderTradeoffChart();
        }
        
        const signalCanvas = document.getElementById('signalCanvas');
        if (signalCanvas) {
            signalCanvas.width = signalCanvas.parentElement.clientWidth;
            signalCanvas.height = signalCanvas.parentElement.clientHeight;
            drawChannelConnections(txElements, rxElements, signalCanvas.getContext('2d'));
        }
    });
}

function updateFixedValueLabel() {
    if (modeSelect.value === 'multiplexing') {
        fixedValueLabel.textContent = 'Fixed Rate (R)';
        fixedValueInput.min = '0.1';
        fixedValueInput.max = '8';
    } else {
        fixedValueLabel.textContent = 'Error Probability (Pe)';
        fixedValueInput.min = '0.0001';
        fixedValueInput.max = '0.1';
    }
}

// Make sure updateSystem is robust against missing elements
function updateSystem() {
    try {
        // Get input values
        const txAntennas = parseInt(txAntennasInput?.value || 2);
        const rxAntennas = parseInt(rxAntennasInput?.value || 2);
        const snr = parseFloat(snrInput?.value || 10);
        const mode = modeSelect?.value || 'multiplexing';
        const fixedValue = parseFloat(fixedValueInput?.value || 2);
        
        // Render antennas
        renderAntennas(txAntennas, rxAntennas);
        
        // Calculate tradeoff curve
        calculateTradeoffCurve(txAntennas, rxAntennas, snr, mode, fixedValue);
        
        // Update explanation text
        updateExplanation(txAntennas, rxAntennas, mode, fixedValue);
    } catch (error) {
        console.error("Error in updateSystem:", error);
    }
}

function calculateTradeoffCurve(txAntennas, rxAntennas, snr, mode, fixedValue) {
    // The diversity-multiplexing tradeoff is approximated by the Zheng-Tse formula
    // for MIMO channels: d(r) = (Nt - r)(Nr - r) for 0 ≤ r ≤ min(Nt, Nr)
    // where d is diversity gain and r is multiplexing gain
    
    const minAntennas = Math.min(txAntennas, rxAntennas);
    const points = [];
    
    // Calculate points along the curve
    for (let r = 0; r <= minAntennas; r += 0.1) {
        const d = (txAntennas - r) * (rxAntennas - r);
        points.push({ multiplexingGain: r, diversityGain: d });
    }
    
    tradeoffPoints = points;
    
    // Update key points
    maxDiversitySpan.textContent = points.length > 0 ? points[0].diversityGain.toFixed(1) : 'N/A';
    maxMultiplexingSpan.textContent = points.length > 0 ? points[points.length - 1].multiplexingGain.toFixed(1) : 'N/A';
    
    if (mode === 'multiplexing') {
        operatingRSpan.textContent = fixedValue;
        // Find corresponding diversity gain
        const diversityGain = (txAntennas - fixedValue) * (rxAntennas - fixedValue);
        operatingDSpan.textContent = diversityGain > 0 ? diversityGain.toFixed(1) : '0.0';
    } else {
        operatingDSpan.textContent = fixedValue;
        // Approximate corresponding multiplexing gain
        // Solving for r: (Nt-r)(Nr-r) = d
        const r = minAntennas - Math.sqrt(fixedValue);
        operatingRSpan.textContent = r > 0 ? r.toFixed(1) : '0.0';
    }
    
    // Render the chart
    renderTradeoffChart();
}

// Enhanced renderTradeoffChart function with error handling
function renderTradeoffChart() {
    if (!tradeoffCtx || tradeoffPoints.length === 0) return;
    
    const width = tradeoffChart.width;
    const height = tradeoffChart.height;
    const padding = 40;
    
    // Clear canvas
    tradeoffCtx.clearRect(0, 0, width, height);
    
    // Draw background
    tradeoffCtx.fillStyle = '#ffffff';
    tradeoffCtx.fillRect(0, 0, width, height);
    
    // Find max values for scaling
    const maxMultiplexing = Math.max(...tradeoffPoints.map(p => p.multiplexingGain));
    const maxDiversity = Math.max(...tradeoffPoints.map(p => p.diversityGain));
    
    // Draw axes with error handling
    try {
        // Draw axes
        tradeoffCtx.strokeStyle = '#000';
        tradeoffCtx.lineWidth = 2;
        tradeoffCtx.beginPath();
        
        // X-axis
        tradeoffCtx.moveTo(padding, height - padding);
        tradeoffCtx.lineTo(width - padding, height - padding);
        
        // Y-axis
        tradeoffCtx.moveTo(padding, height - padding);
        tradeoffCtx.lineTo(padding, padding);
        
        tradeoffCtx.stroke();
        
        // Draw labels
        tradeoffCtx.fillStyle = '#000';
        tradeoffCtx.font = '12px Arial';
        tradeoffCtx.textAlign = 'center';
        
        // X-axis label
        tradeoffCtx.fillText('Multiplexing Gain (r)', width / 2, height - 10);
        
        // Y-axis label
        tradeoffCtx.save();
        tradeoffCtx.translate(15, height / 2);
        tradeoffCtx.rotate(-Math.PI / 2);
        tradeoffCtx.fillText('Diversity Gain (d)', 0, 0);
        tradeoffCtx.restore();
        
        // Draw curve
        tradeoffCtx.strokeStyle = '#3b82f6';
        tradeoffCtx.lineWidth = 2;
        tradeoffCtx.beginPath();
        
        tradeoffPoints.forEach((point, i) => {
            const x = padding + (point.multiplexingGain / maxMultiplexing) * (width - 2 * padding);
            const y = height - padding - (point.diversityGain / maxDiversity) * (height - 2 * padding);
            
            if (i === 0) {
                tradeoffCtx.moveTo(x, y);
            } else {
                tradeoffCtx.lineTo(x, y);
            }
        });
        
        tradeoffCtx.stroke();
        
        // Draw axis ticks and values
        tradeoffCtx.fillStyle = '#000';
        tradeoffCtx.textAlign = 'center';
        tradeoffCtx.textBaseline = 'top';
        
        // X-axis ticks
        for (let i = 0; i <= Math.ceil(maxMultiplexing); i++) {
            const x = padding + (i / maxMultiplexing) * (width - 2 * padding);
            tradeoffCtx.fillText(i.toString(), x, height - padding + 5);
            
            tradeoffCtx.beginPath();
            tradeoffCtx.moveTo(x, height - padding - 3);
            tradeoffCtx.lineTo(x, height - padding + 3);
            tradeoffCtx.stroke();
        }
        
        // Y-axis ticks
        tradeoffCtx.textAlign = 'right';
        tradeoffCtx.textBaseline = 'middle';
        
        for (let i = 0; i <= Math.ceil(maxDiversity); i += Math.ceil(maxDiversity / 5)) {
            const y = height - padding - (i / maxDiversity) * (height - 2 * padding);
            tradeoffCtx.fillText(i.toString(), padding - 5, y);
            
            tradeoffCtx.beginPath();
            tradeoffCtx.moveTo(padding - 3, y);
            tradeoffCtx.lineTo(padding + 3, y);
            tradeoffCtx.stroke();
        }
        
        // Draw operating point
        const mode = modeSelect.value;
        const fixedValue = parseFloat(fixedValueInput.value);
        const txAntennas = parseInt(txAntennasInput.value);
        const rxAntennas = parseInt(rxAntennasInput.value);
        
        let operatingPoint = { multiplexingGain: 0, diversityGain: 0 };
        
        if (mode === 'multiplexing') {
            const diversityGain = (txAntennas - fixedValue) * (rxAntennas - fixedValue);
            operatingPoint = { 
                multiplexingGain: fixedValue, 
                diversityGain: Math.max(0, diversityGain) 
            };
        } else {
            const minAntennas = Math.min(txAntennas, rxAntennas);
            const r = minAntennas - Math.sqrt(fixedValue);
            operatingPoint = { 
                multiplexingGain: Math.max(0, r), 
                diversityGain: fixedValue 
            };
        }
        
        const opX = padding + (operatingPoint.multiplexingGain / maxMultiplexing) * (width - 2 * padding);
        const opY = height - padding - (operatingPoint.diversityGain / maxDiversity) * (height - 2 * padding);
        
        tradeoffCtx.fillStyle = '#ef4444';
        tradeoffCtx.beginPath();
        tradeoffCtx.arc(opX, opY, 5, 0, 2 * Math.PI);
        tradeoffCtx.fill();
    } catch (error) {
        console.error("Error drawing tradeoff chart:", error);
    }
}

function renderAntennas(txCount, rxCount) {
    const txColumn = document.getElementById("txColumn");
    const rxColumn = document.getElementById("rxColumn");
    const canvas = document.getElementById("signalCanvas");
    const ctx = canvas.getContext("2d");
    
    // Set canvas dimensions
    const container = document.querySelector('.system-diagram');
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    
    // Clear previous content
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    txColumn.innerHTML = "";
    rxColumn.innerHTML = "";
    txElements = [];
    rxElements = [];
    
    // Create antenna elements
    for (let i = 0; i < txCount; i++) {
        let div = createAntennaElement();
        txColumn.appendChild(div);
        txElements.push(div);
    }
    
    for (let i = 0; i < rxCount; i++) {
        let div = createAntennaElement();
        rxColumn.appendChild(div);
        rxElements.push(div);
    }
    
    // Wait for elements to be positioned in the DOM
    setTimeout(() => {
        drawChannelConnections(txElements, rxElements, ctx);
    }, 100);
}

function createAntennaElement() {
    const div = document.createElement("div");
    div.className = "antenna";
    
    // Add hover effect
    div.addEventListener('mouseenter', function() {
        this.classList.add('active');
    });
    
    div.addEventListener('mouseleave', function() {
        this.classList.remove('active');
    });
    
    return div;
}

function drawChannelConnections(txElements, rxElements, ctx) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.strokeStyle = "rgba(100, 100, 100, 0.6)";
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;

    // Draw connections for all antenna pairs
    for (let i = 0; i < txElements.length; i++) {
        for (let j = 0; j < rxElements.length; j++) {
            drawLine(txElements[i], rxElements[j], ctx);
        }
    }
}

function drawLine(tx, rx, ctx) {
    const txRect = tx.getBoundingClientRect();
    const rxRect = rx.getBoundingClientRect();
    
    const canvasRect = ctx.canvas.getBoundingClientRect();
    const txX = txRect.left + txRect.width/2 - canvasRect.left;
    const txY = txRect.top + txRect.height/2 - canvasRect.top;
    const rxX = rxRect.left + rxRect.width/2 - canvasRect.left;
    const rxY = rxRect.top + rxRect.height/2 - canvasRect.top;
    
    ctx.beginPath();
    ctx.moveTo(txX, txY);
    ctx.lineTo(rxX, rxY);
    ctx.stroke();
}

function updateExplanation(txAntennas, rxAntennas, mode, fixedValue) {
    const maxDiversity = txAntennas * rxAntennas;
    const maxMultiplexing = Math.min(txAntennas, rxAntennas);
    
    explanation1.textContent = `The diversity-multiplexing tradeoff (DMT) shows the fundamental relationship between reliability (diversity gain) and data rate (multiplexing gain) in MIMO wireless systems. For a ${txAntennas}×${rxAntennas} MIMO system, the maximum diversity gain is ${maxDiversity} and the maximum multiplexing gain is ${maxMultiplexing}.`;
    
    if (mode === 'multiplexing') {
        const diversityGain = (txAntennas - fixedValue) * (rxAntennas - fixedValue);
        explanation2.textContent = `With fixed multiplexing gain r = ${fixedValue}, the achievable diversity gain is approximately ${diversityGain > 0 ? diversityGain.toFixed(1) : '0.0'}.`;
    } else {
        const r = maxMultiplexing - Math.sqrt(fixedValue);
        explanation2.textContent = `With fixed diversity gain d = ${fixedValue}, we can achieve a multiplexing gain of approximately ${r > 0 ? r.toFixed(1) : '0.0'}.`;
    }
}

// Add a special init function that runs on window load
window.onload = function() {
    startup();
    
    // Make sure DOM is fully loaded before initializing
    setTimeout(init, 100);
    
    // A backup init attempt after a longer delay 
    // in case the first one missed elements
    setTimeout(function() {
        console.log("Running backup initialization");
        if (!tradeoffCtx) init();
    }, 500);
};

// Initialize the application
document.addEventListener('DOMContentLoaded', init);