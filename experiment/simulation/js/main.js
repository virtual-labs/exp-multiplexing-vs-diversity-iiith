// --- General UI Functions ---
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
    if (document.getElementById("default")) {
       document.getElementById("default").click();
    }
}

window.onload = startup;

// --- Application State and Global Variables ---
let txElements = [];
let rxElements = [];
let tradeoffPoints = [];
let channelMatrixH = [];
let svdResult = null;

let isOptimizedDiagramView = false;
let lastCalculatedMultiplexingGain_r = 0;

// --- DOM Element References ---
const txAntennasInput = document.getElementById('txAntennas');
const rxAntennasInput = document.getElementById('rxAntennas');
const modeSelect = document.getElementById('mode');
const fixedValueInput = document.getElementById('fixedValue');
const fixedValueLabel = document.getElementById('fixedValueLabel');
const generateButton = document.getElementById('generateButton');
const optimizeButton = document.getElementById('optimizeButton');

const systemDiagramCard = document.getElementById('systemDiagramCard');
const tradeoffCurveCard = document.getElementById('tradeoffCurveCard');
const channelMatrixCard = document.getElementById('channelMatrixCard');
const svdResultsCard = document.getElementById('svdResultsCard');

const maxDiversitySpan = document.getElementById('maxDiversity');
const maxMultiplexingSpan = document.getElementById('maxMultiplexing');
const operatingRSpan = document.getElementById('operatingR');
const operatingDSpan = document.getElementById('operatingD');
const explanation1 = document.getElementById('explanation1');
const explanation2 = document.getElementById('explanation2');

const signalCanvas = document.getElementById('signalCanvas');
const tradeoffChartEl = document.getElementById('tradeoffChart');
const tradeoffCtx = tradeoffChartEl.getContext('2d');


// --- Event Listeners ---
generateButton.addEventListener('click', function () {
    isOptimizedDiagramView = false;
    // Hide SVD/Optimization results from previous runs
    svdResultsCard.style.display = 'none';
    channelMatrixCard.style.display = 'block';
    optimizeButton.textContent = "Optimize System";
    optimizeButton.onclick = optimizeSystemConnections;
    updateSystem();
    systemDiagramCard.style.display = 'block';
    tradeoffCurveCard.style.display = 'block';
    optimizeButton.style.display = 'inline-block';
});

optimizeButton.addEventListener('click', optimizeSystemConnections);

modeSelect.addEventListener('change', function() {
    updateFixedValueLabel();
    isOptimizedDiagramView = false;
    updateSystem();
});

txAntennasInput.addEventListener('change', () => {
    isOptimizedDiagramView = false;
    updateFixedValueLabel();
    updateSystem();
});

rxAntennasInput.addEventListener('change', () => {
    isOptimizedDiagramView = false;
    updateFixedValueLabel();
    updateSystem();
});

window.addEventListener('resize', function() {
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(() => {
        // Redraw canvas and chart on resize
        if (systemDiagramCard.style.display !== 'none') {
            updateSystemDiagramVisualization();
        }
        if (tradeoffCurveCard.style.display !== 'none') {
            renderTradeoffChart();
        }
    }, 150);
});


// --- Core Logic ---

/**
 * Initializes the application state and UI.
 */
function init() {
    updateFixedValueLabel();
    isOptimizedDiagramView = false;
    updateSystem(); // Initial call to setup default view
    systemDiagramCard.style.display = 'block';
    tradeoffCurveCard.style.display = 'block';
    channelMatrixCard.style.display = 'block';
    optimizeButton.style.display = 'inline-block';
}

/**
 * Main function to update all components of the simulation.
 */
function updateSystem() {
    const Nt = parseInt(txAntennasInput.value);
    const Nr = parseInt(rxAntennasInput.value);
    const mode = modeSelect.value;
    const fixedValue = parseFloat(fixedValueInput.value);

    // Only generate a new matrix if not in the optimized view
    if (!isOptimizedDiagramView) {
        generateAndDisplayChannelMatrix(Nr, Nt);
    }
    
    renderAntennas(Nt, Nr);
    calculateTradeoffCurve(Nt, Nr, mode, fixedValue);
    updateExplanation(Nt, Nr, mode, fixedValue);
    renderTradeoffChart();
    updateSystemDiagramVisualization();
}

/**
 * Handles the "Optimize" button click. Performs SVD and updates the view.
 */
function optimizeSystemConnections() {
    if (channelMatrixH.length === 0) {
        alert("Please generate a channel first.");
        return;
    }
    
    isOptimizedDiagramView = true;
    svdResultsCard.style.display = 'block';
    
    // --- 1. Calculate the target number of multiplexing streams ---
    const Nt = parseInt(txAntennasInput.value);
    const Nr = parseInt(rxAntennasInput.value);
    const mode = modeSelect.value;
    let fixedVal = parseFloat(fixedValueInput.value);
    let numMuxStreams;

    if (mode === 'multiplexing') {
        numMuxStreams = Math.max(0, Math.min(fixedVal, Math.min(Nt, Nr)));
    } else { // Diversity mode
        let d_val = fixedVal;
        const max_d = Nt * Nr;
        d_val = Math.max(0, Math.min(d_val, max_d));
        const term_under_sqrt = Math.pow(Nt - Nr, 2) + 4 * d_val;
        if (d_val > max_d || term_under_sqrt < 0) {
            numMuxStreams = 0;
        } else {
            numMuxStreams = ((Nt + Nr) - Math.sqrt(term_under_sqrt)) / 2;
        }
    }
    numMuxStreams = Math.round(Math.max(0, Math.min(numMuxStreams, Math.min(Nt, Nr))));
    lastCalculatedMultiplexingGain_r = numMuxStreams;
    
    // --- 2. Perform SVD on the channel matrix ---
    performSVD(channelMatrixH);
    
    // --- 3. Display SVD results and metrics ---
    displaySVDResults(svdResult, numMuxStreams);
    
    // --- 4. Update the diagram to show eigenbeams ---
    updateSystemDiagramVisualization();
    
    // --- 5. Change button to "Return to Channel View" ---
    optimizeButton.textContent = "Return to Channel View";
    optimizeButton.onclick = () => {
        isOptimizedDiagramView = false;
        svdResultsCard.style.display = 'none';
        optimizeButton.textContent = "Optimize System";
        optimizeButton.onclick = optimizeSystemConnections;
        updateSystem(); // Redraw the original channel view
    };
}


// --- Drawing and Rendering Functions ---

/**
 * Updates the main system diagram canvas based on the current view mode.
 */
function updateSystemDiagramVisualization() {
    const canvas = signalCanvas;
    if (!canvas.parentElement) return;
    
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (isOptimizedDiagramView && svdResult) {
        drawOptimizedConnections(txElements, rxElements, ctx, svdResult, lastCalculatedMultiplexingGain_r);
    } else {
        drawChannelConnections(txElements, rxElements, ctx);
    }
}

/**
 * Renders the antenna elements in the DOM.
 */
function renderAntennas(numTx, numRx) {
    const txColumn = document.getElementById('txColumn');
    const rxColumn = document.getElementById('rxColumn');
    txColumn.innerHTML = '';
    rxColumn.innerHTML = '';
    txElements = [];
    rxElements = [];

    for (let i = 0; i < numTx; i++) {
        const antenna = document.createElement('div');
        antenna.className = 'antenna';
        txColumn.appendChild(antenna);
        txElements.push(antenna);
    }
    for (let i = 0; i < numRx; i++) {
        const antenna = document.createElement('div');
        antenna.className = 'antenna';
        rxColumn.appendChild(antenna);
        rxElements.push(antenna);
    }
}

/**
 * Draws all potential channel paths (all-to-all connections).
 */
function drawChannelConnections(currentTxElements, currentRxElements, ctx) {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    currentTxElements.forEach((tx) => {
        currentRxElements.forEach((rx) => {
            drawConnection(tx, rx, ctx);
        });
    });
    ctx.setLineDash([]);
}

/**
 * Draws the SVD-optimized eigenbeams.
 */
function drawOptimizedConnections(currentTxElements, currentRxElements, ctx, svd, numMuxStreams) {
    if (!svd || !svd.S) return;

    const singularValues = svd.S;
    const rank = singularValues.filter(s => s > 1e-9).length;
    const max_s = singularValues[0] > 1e-9 ? singularValues[0] : 1;
    const baseSNR_dB = 10; // Assume a base SNR of 10dB for calculations

    // Render antennas for the number of active streams (rank)
    renderAntennas(rank, rank);
    
    // Use a timeout to allow DOM to update before drawing connections
    setTimeout(() => {
        // Recalculate canvas size after antenna re-render
        signalCanvas.width = signalCanvas.parentElement.offsetWidth;
        signalCanvas.height = signalCanvas.parentElement.offsetHeight;
        ctx.clearRect(0, 0, signalCanvas.width, signalCanvas.height);

        for (let i = 0; i < rank; i++) {
            if (i >= txElements.length || i >= rxElements.length) continue;
            
            const tx = txElements[i];
            const rx = rxElements[i];
            const s_i = singularValues[i];

            const streamSNR_dB = baseSNR_dB + 10 * Math.log10(s_i * s_i);
            
            if (i < numMuxStreams) { // Multiplexing Stream
                ctx.strokeStyle = '#ff8c00'; // Orange
                ctx.lineWidth = Math.max(1.5, 6 * (s_i / max_s));
                ctx.setLineDash([]);
                
                const streamCapacity = Math.log2(1 + Math.pow(10, streamSNR_dB / 10));
                drawConnection(tx, rx, ctx, `Mux ${i+1}: ${streamCapacity.toFixed(1)} bps/Hz | ${streamSNR_dB.toFixed(1)} dB`, '#ff8c00');

            } else { // Diversity Stream
                ctx.strokeStyle = '#3b82f6'; // Blue
                ctx.lineWidth = Math.max(1.0, 4 * (s_i / max_s));
                ctx.setLineDash([4, 4]);

                drawConnection(tx, rx, ctx, `Div ${i+1}: ${streamSNR_dB.toFixed(1)} dB`, '#3b82f6');
            }
        }
        ctx.setLineDash([]);
    }, 100);
}

/**
 * Helper function to draw a line between two DOM elements on a canvas.
 */
function drawConnection(tx, rx, ctx, label = null, labelColor = '#333') {
    if (!tx || !rx) return;
    const canvasRect = ctx.canvas.getBoundingClientRect();
    const txRect = tx.getBoundingClientRect();
    const rxRect = rx.getBoundingClientRect();

    const txX = txRect.left + txRect.width / 2 - canvasRect.left;
    const txY = txRect.top + txRect.height / 2 - canvasRect.top;
    const rxX = rxRect.left + rxRect.width / 2 - canvasRect.left;
    const rxY = rxRect.top + rxRect.height / 2 - canvasRect.top;

    ctx.beginPath();
    ctx.moveTo(txX, txY);
    ctx.lineTo(rxX, rxY);
    ctx.stroke();
    
    if (label) {
        ctx.fillStyle = labelColor;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, (txX + rxX) / 2, txY - 8);
    }
}


// --- Calculation and Data Logic ---

/**
 * Generates a random complex channel matrix and displays it.
 */
function generateAndDisplayChannelMatrix(nr, nt) {
    const realPart = numeric.random([nr, nt]);
    const imagPart = numeric.random([nr, nt]);
    channelMatrixH = [];
    for (let i = 0; i < nr; i++) {
        channelMatrixH[i] = [];
        for (let j = 0; j < nt; j++) {
            const scale = 1 / Math.sqrt(2);
            channelMatrixH[i][j] = {
                re: realPart[i][j] * scale,
                im: imagPart[i][j] * scale
            };
        }
    }
    displayComplexMatrix(channelMatrixH, "channelMatrixContainer");
}

/**
 * Performs Singular Value Decomposition on a complex matrix H.
 */
function performSVD(H) {
    if (!H || H.length === 0) {
        svdResult = null;
        return;
    }
    try {
        const HH_hermitian = multiplyComplexMatrices(conjugateTranspose(H), H);
        
        const realMatrix = HH_hermitian.map(row => row.map(cell => cell.re));
        
        const eigenResult = numeric.eig(realMatrix);
        const eigenValues = eigenResult.lambda.x;
        
        const singularValues = eigenValues
            .map(val => Math.sqrt(Math.max(0, val)))
            .sort((a, b) => b - a);
            
        svdResult = { S: singularValues };
    } catch (e) {
        console.error("SVD calculation failed:", e);
        svdResult = null;
    }
}

/**
 * Calculates and populates the theoretical DMT curve data.
 */
function calculateTradeoffCurve(Nt, Nr, mode, fixedValue) {
    const minAntennas = Math.min(Nt, Nr);
    const points = [];
    for (let r_iter = 0; r_iter <= minAntennas; r_iter += 0.05) {
        r_iter = parseFloat(r_iter.toFixed(2));
        const d_val = (Nt - r_iter) * (Nr - r_iter);
        points.push({ multiplexingGain: r_iter, diversityGain: Math.max(0, d_val) });
    }
    tradeoffPoints = points;

    maxDiversitySpan.textContent = (Nt * Nr).toFixed(1);
    maxMultiplexingSpan.textContent = minAntennas.toFixed(1);

    if (mode === 'multiplexing') {
        let r_op = Math.max(0, Math.min(fixedValue, minAntennas));
        operatingRSpan.textContent = r_op.toFixed(1);
        const diversityGain = (Nt - r_op) * (Nr - r_op);
        operatingDSpan.textContent = Math.max(0, diversityGain).toFixed(1);
    } else {
        let d_op = Math.max(0, Math.min(fixedValue, Nt * Nr));
        operatingDSpan.textContent = d_op.toFixed(1);
        const term_under_sqrt = Math.pow(Nt - Nr, 2) + 4 * d_op;
        let r_calc = (term_under_sqrt < 0) ? 0 : ((Nt + Nr) - Math.sqrt(term_under_sqrt)) / 2;
        r_calc = Math.max(0, Math.min(r_calc, minAntennas));
        operatingRSpan.textContent = r_calc.toFixed(1);
    }
}


// --- UI Update and Display Functions ---

/**
 * Updates the text explanations based on the current parameters.
 */
function updateExplanation(Nt, Nr, mode, fixedValue) {
    const minAntennas = Math.min(Nt, Nr);
    const maxDiversityVal = Nt * Nr;
    
    explanation1.textContent = `The diversity-multiplexing tradeoff (DMT) shows the fundamental relationship between reliability (diversity) and data rate (multiplexing) in a ${Nt}×${Nr} MIMO system. The maximum theoretical diversity is ${maxDiversityVal.toFixed(1)} and the maximum multiplexing gain is ${minAntennas.toFixed(1)}.`;

    const r_op = parseFloat(operatingRSpan.textContent);
    const d_op = parseFloat(operatingDSpan.textContent);

    if (mode === 'multiplexing') {
        explanation2.textContent = `For a target multiplexing gain r = ${r_op.toFixed(1)}, the best achievable diversity gain is d = ${d_op.toFixed(1)}.`;
    } else {
        explanation2.textContent = `For a target diversity gain d = ${d_op.toFixed(1)}, the best achievable multiplexing gain is r = ${r_op.toFixed(1)}.`;
    }
}

/**
 * Updates the label for the fixed value input based on the selected mode.
 */
function updateFixedValueLabel() {
    const Nt = parseInt(txAntennasInput.value);
    const Nr = parseInt(rxAntennasInput.value);
    if (modeSelect.value === 'multiplexing') {
        fixedValueLabel.textContent = 'Fixed Rate (R)';
        fixedValueInput.min = '0';
        fixedValueInput.max = Math.min(Nt, Nr).toString();
        fixedValueInput.step = '0.1';
    } else {
        fixedValueLabel.textContent = 'Fixed Diversity Gain (d)';
        fixedValueInput.min = '0';
        fixedValueInput.max = (Nt * Nr).toString();
        fixedValueInput.step = '0.1';
    }
    // Clamp value to new min/max
    const currentVal = parseFloat(fixedValueInput.value);
    const minVal = parseFloat(fixedValueInput.min);
    const maxVal = parseFloat(fixedValueInput.max);
    if (currentVal < minVal) fixedValueInput.value = minVal;
    if (currentVal > maxVal) fixedValueInput.value = maxVal;
}

/**
 * Renders the DMT curve on its canvas.
 */
function renderTradeoffChart() {
    if (tradeoffPoints.length === 0) return;
    tradeoffChartEl.width = tradeoffChartEl.parentElement.clientWidth;
    tradeoffChartEl.height = 350;
    const width = tradeoffChartEl.width;
    const height = tradeoffChartEl.height;
    const padding = 50;
    tradeoffCtx.clearRect(0, 0, width, height);

    const Nt = parseInt(txAntennasInput.value);
    const Nr = parseInt(rxAntennasInput.value);
    const maxMultiplexingOnAxis = Math.max(1, Math.min(Nt, Nr));
    const maxDiversityOnAxis = Math.max(1, Nt * Nr);
    
    // Draw Axes
    tradeoffCtx.strokeStyle = '#333';
    tradeoffCtx.lineWidth = 1;
    tradeoffCtx.beginPath();
    tradeoffCtx.moveTo(padding, padding);
    tradeoffCtx.lineTo(padding, height - padding);
    tradeoffCtx.lineTo(width - padding, height - padding);
    tradeoffCtx.stroke();
    
    // Draw Labels and Ticks (simplified for brevity, original logic is complex but fine)
     tradeoffCtx.fillStyle = '#333';
     tradeoffCtx.font = '12px Arial';
     tradeoffCtx.textAlign = 'center';
     tradeoffCtx.fillText('Multiplexing Gain (r)', width / 2, height - 15);
     tradeoffCtx.save();
     tradeoffCtx.translate(15, height / 2);
     tradeoffCtx.rotate(-Math.PI / 2);
     tradeoffCtx.fillText('Diversity Gain (d)', 0, 0);
     tradeoffCtx.restore();

    // Draw Curve
    tradeoffCtx.strokeStyle = '#3b82f6';
    tradeoffCtx.lineWidth = 2.5;
    tradeoffCtx.beginPath();
    tradeoffPoints.forEach((point, i) => {
        const x = padding + (point.multiplexingGain / maxMultiplexingOnAxis) * (width - 2 * padding);
        const y = height - padding - (point.diversityGain / maxDiversityOnAxis) * (height - 2 * padding);
        if (i === 0) tradeoffCtx.moveTo(x, y);
        else tradeoffCtx.lineTo(x, y);
    });
    tradeoffCtx.stroke();

    // Draw Operating Point
    const operatingR = parseFloat(operatingRSpan.textContent);
    const operatingD = parseFloat(operatingDSpan.textContent);
    const opX = padding + (operatingR / maxMultiplexingOnAxis) * (width - 2 * padding);
    const opY = height - padding - (operatingD / maxDiversityOnAxis) * (height - 2 * padding);
    tradeoffCtx.fillStyle = '#ef4444';
    tradeoffCtx.beginPath();
    tradeoffCtx.arc(opX, opY, 6, 0, 2 * Math.PI);
    tradeoffCtx.fill();
}

/**
 * Displays the SVD results (Sigma matrix and key metrics).
 */
function displaySVDResults(svd, numMuxStreams) {
    if (!svd || !svd.S) return;
    
    const singularValues = svd.S;
    const rank = singularValues.filter(s => s > 1e-9).length;
    const baseSNR_dB = 10;
    
    // Create Sigma matrix for display
    const Sigma = Array(singularValues.length).fill(0).map(() => Array(singularValues.length).fill(0));
    singularValues.forEach((s, i) => Sigma[i][i] = s);
    
    displayMatrix(Sigma, "sigmaMatrixContainer", true);
    
    // Calculate total capacity from multiplexing streams
    let totalCapacity = 0;
    for (let i = 0; i < Math.min(rank, numMuxStreams); i++) {
        const s_i = singularValues[i];
        const streamSNR_linear = Math.pow(10, baseSNR_dB / 10) * s_i * s_i;
        totalCapacity += Math.log2(1 + streamSNR_linear);
    }
    
    document.getElementById("rankOutput").textContent = rank;
    document.getElementById("capacityOutput").textContent = `${totalCapacity.toFixed(2)} bps/Hz`;
    
    const analysisText = `SVD decomposes the ${channelMatrixH.length}×${channelMatrixH[0].length} channel into ${rank} independent sub-channels (eigenbeams). 
                         Based on your target, ${numMuxStreams} streams are used for high-rate multiplexing, achieving a total capacity of ${totalCapacity.toFixed(2)} bps/Hz. 
                         The remaining ${rank - numMuxStreams} streams provide diversity gain.`;
    document.getElementById("svdAnalysisText").textContent = analysisText;
}


// --- Matrix Math and Display Helpers ---

/**
 * Displays a complex matrix in a formatted HTML table.
 */
function displayComplexMatrix(matrix, containerId) {
    const container = document.getElementById(containerId);
    let tableHTML = '<table class="matrix">';
    matrix.forEach(row => {
        tableHTML += '<tr>';
        row.forEach(cell => {
            const sign = cell.im >= 0 ? '+' : '';
            tableHTML += `<td>${cell.re.toFixed(2)} ${sign} ${cell.im.toFixed(2)}j</td>`;
        });
        tableHTML += '</tr>';
    });
    tableHTML += '</table>';
    container.innerHTML = tableHTML;
}

/**
 * Displays a real-valued matrix in a formatted HTML table.
 */
function displayMatrix(matrix, containerId, highlightDiagonal = false) {
    const container = document.getElementById(containerId);
    let tableHTML = '<table class="matrix">';
    matrix.forEach((row, i) => {
        tableHTML += '<tr>';
        row.forEach((cell, j) => {
            const isDiagonal = highlightDiagonal && i === j;
            tableHTML += `<td class="${isDiagonal ? 'highlight' : ''}">${cell.toFixed(2)}</td>`;
        });
        tableHTML += '</tr>';
    });
    tableHTML += '</table>';
    container.innerHTML = tableHTML;
}

function conjugateTranspose(matrix) {
    const result = [];
    for (let j = 0; j < matrix[0].length; j++) {
        result[j] = [];
        for (let i = 0; i < matrix.length; i++) {
            result[j][i] = {
                re: matrix[i][j].re,
                im: -matrix[i][j].im
            };
        }
    }
    return result;
}

function multiplyComplexMatrices(A, B) {
    const result = [];
    for (let i = 0; i < A.length; i++) {
        result[i] = [];
        for (let j = 0; j < B[0].length; j++) {
            result[i][j] = { re: 0, im: 0 };
            for (let k = 0; k < A[0].length; k++) {
                const realPart = A[i][k].re * B[k][j].re - A[i][k].im * B[k][j].im;
                const imagPart = A[i][k].re * B[k][j].im + A[i][k].im * B[k][j].re;
                result[i][j].re += realPart;
                result[i][j].im += imagPart;
            }
        }
    }
    return result;
}

// --- Initialize the Application ---
init();