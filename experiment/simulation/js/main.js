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
// --- DOM Element References (CORRECTED) ---
const txAntennasInput = document.getElementById('txAntennas');
const rxAntennasInput = document.getElementById('rxAntennas');
const modeSelect = document.getElementById('mode');
const generateButton = document.getElementById('generateButton');
const optimizeButton = document.getElementById('optimizeButton');

// New control elements
const snrValueInput = document.getElementById('snrValue');
const rateValueInput = document.getElementById('rateValue');
const errorProbValueInput = document.getElementById('errorProbValue');
const snrControl = document.getElementById('snrControl');
const rateControl = document.getElementById('rateControl');
const errorProbControl = document.getElementById('errorProbControl');
const systemCapacitySpan = document.getElementById('systemCapacity');

// Display elements
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

// Add reference to regenerate button
const regenerateButton = document.getElementById('regenerateButton');

// Add event listener for regenerate button
regenerateButton.addEventListener('click', function () {
    isOptimizedDiagramView = false;
    svdResultsCard.style.display = 'none';
    optimizeButton.textContent = "Optimize System";
    optimizeButton.onclick = optimizeSystemConnections;
    
    // Only regenerate the channel matrix, keep everything else
    const Nt = parseInt(txAntennasInput.value);
    const Nr = parseInt(rxAntennasInput.value);
    generateAndDisplayChannelMatrix(Nr, Nt);
    updateSystemDiagramVisualization();
});

// Add event listeners for new controls
snrValueInput.addEventListener('change', () => {
    isOptimizedDiagramView = false;
    updateSystem();
});

rateValueInput.addEventListener('change', () => {
    isOptimizedDiagramView = false;
    updateSystem();
});

errorProbValueInput.addEventListener('change', () => {
    isOptimizedDiagramView = false;
    updateSystem();
});


// --- Event Listeners ---
generateButton.addEventListener('click', function () {
    isOptimizedDiagramView = false;
    svdResultsCard.style.display = 'none';
    channelMatrixCard.style.display = 'block';
    optimizeButton.textContent = "Optimize System";
    optimizeButton.onclick = optimizeSystemConnections;
    updateSystem();
    systemDiagramCard.style.display = 'block';
    tradeoffCurveCard.style.display = 'block';
    optimizeButton.style.display = 'inline-block';
    regenerateButton.style.display = 'inline-block'; // Show regenerate button
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

// --- Updated init() function ---
function init() {
    updateFixedValueLabel();
    isOptimizedDiagramView = false;
    // Hide system diagram initially
    systemDiagramCard.style.display = 'none';
    tradeoffCurveCard.style.display = 'none';
    channelMatrixCard.style.display = 'none';
    optimizeButton.style.display = 'none';
}

// --- Updated generateButton event listener ---
generateButton.addEventListener('click', function () {
    isOptimizedDiagramView = false;
    // Hide SVD/Optimization results from previous runs
    svdResultsCard.style.display = 'none';
    channelMatrixCard.style.display = 'block';
    optimizeButton.textContent = "Optimize System";
    optimizeButton.onclick = optimizeSystemConnections;
    updateSystem();
    // Show system diagram and other components after generating channel
    systemDiagramCard.style.display = 'block';
    tradeoffCurveCard.style.display = 'block';
    optimizeButton.style.display = 'inline-block';
});

/**
 * Main function to update all components of the simulation.
 */
function updateSystem() {
    const Nt = parseInt(txAntennasInput.value);
    const Nr = parseInt(rxAntennasInput.value);
    const mode = modeSelect.value;

    // Only generate a new matrix if not in the optimized view
    if (!isOptimizedDiagramView) {
        generateAndDisplayChannelMatrix(Nr, Nt);
    }
    
    renderAntennas(Nt, Nr);
    calculateTradeoffCurve(Nt, Nr, mode, 0); // fixedValue not used anymore
    updateExplanation(Nt, Nr, mode, 0);
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
    
    // Get the calculated r value from the trade-off calculation
    const r_op = parseFloat(operatingRSpan.textContent);
    const numMuxStreams = Math.floor(r_op);
    lastCalculatedMultiplexingGain_r = numMuxStreams;
    
    // Perform SVD (for completeness, though we're using calculated values)
    performSVD(channelMatrixH);
    
    // Display results
    displaySVDResults(svdResult, numMuxStreams);
    
    // Update diagram
    updateSystemDiagramVisualization();
    
    // Change button functionality
    optimizeButton.textContent = "Return to Channel View";
    optimizeButton.onclick = () => {
        isOptimizedDiagramView = false;
        svdResultsCard.style.display = 'none';
        optimizeButton.textContent = "Optimize System";
        optimizeButton.onclick = optimizeSystemConnections;
        updateSystem();
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
 * Draws the SVD-optimized eigenbeams with animation.
 */
function drawOptimizedConnections(currentTxElements, currentRxElements, ctx, svd, numMuxStreams) {
    if (!svd || !svd.S) return;

    const singularValues = svd.S;
    const rank = singularValues.filter(s => s > 1e-9).length;
    const Nt = parseInt(txAntennasInput.value);
    const Nr = parseInt(rxAntennasInput.value);
    const snr_dB = parseFloat(snrValueInput.value);
    const snr_linear = Math.pow(10, snr_dB / 10);

    // Clear and redraw with actual antenna counts
    renderAntennas(Nt, Nr);
    
    setTimeout(() => {
        signalCanvas.width = signalCanvas.parentElement.offsetWidth;
        signalCanvas.height = signalCanvas.parentElement.offsetHeight;
        
        // Animation parameters
        let animationProgress = 0;
        const animationDuration = 1000; // 1 second
        const startTime = Date.now();
        
        function animate() {
            const elapsed = Date.now() - startTime;
            animationProgress = Math.min(elapsed / animationDuration, 1);
            
            // Easing function for smooth animation
            const easeProgress = animationProgress < 0.5 
                ? 2 * animationProgress * animationProgress 
                : 1 - Math.pow(-2 * animationProgress + 2, 2) / 2;
            
            ctx.clearRect(0, 0, signalCanvas.width, signalCanvas.height);
            
            // Draw diversity connections (fading out)
            const remainingTxStart = numMuxStreams;
            const remainingRxStart = numMuxStreams;
            const remainingTx = txElements.slice(remainingTxStart);
            const remainingRx = txElements.slice(remainingRxStart);
            
            ctx.globalAlpha = 1 - easeProgress * 0.3; // Fade to 70% opacity
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            
            remainingTx.forEach((tx, i) => {
                remainingRx.forEach((rx, j) => {
                    drawConnection(tx, rx, ctx, null, '#3b82f6');
                });
            });
            
            // Draw multiplexing connections (fading in)
            ctx.globalAlpha = easeProgress;
            ctx.setLineDash([]);
            
            for (let i = 0; i < Math.min(numMuxStreams, Math.min(txElements.length, rxElements.length)); i++) {
                const tx = txElements[i];
                const rx = rxElements[i];
                
                ctx.strokeStyle = '#ff8c00';
                ctx.lineWidth = 3;
                
                const streamCapacity = Math.log2(1 + snr_linear);
                drawConnection(tx, rx, ctx, `Mux ${i+1}: ${streamCapacity.toFixed(1)} bps/Hz`, '#ff8c00');
            }
            
            // Add diversity label (fading in)
            if (remainingTx.length > 0 && remainingRx.length > 0) {
                ctx.globalAlpha = easeProgress;
                const centerTx = remainingTx[Math.floor(remainingTx.length / 2)];
                const centerRx = remainingRx[Math.floor(remainingRx.length / 2)];
                const diversityGain = remainingTx.length * remainingRx.length;
                ctx.setLineDash([4, 4]);
                drawConnection(centerTx, centerRx, ctx, `Diversity: d=${diversityGain}`, '#3b82f6');
            }
            
            ctx.globalAlpha = 1.0;
            ctx.setLineDash([]);
            
            // Continue animation
            if (animationProgress < 1) {
                requestAnimationFrame(animate);
            }
        }
        
        animate();
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
 * Performs Singular Value Decomposition on a complex matrix H using math.js.
 */
/**
 * Performs Singular Value Decomposition on a complex matrix H.
 */
function performSVD(H) {
    if (!H || H.length === 0) {
        svdResult = null;
        return;
    }
    try {
        // Compute H^H * H (Hermitian of H times H)
        const HH_hermitian = multiplyComplexMatrices(conjugateTranspose(H), H);
        
        // Extract real part for eigenvalue decomposition
        const realMatrix = HH_hermitian.map(row => row.map(cell => cell.re));
        
        // Get eigenvalues
        const eigenResult = numeric.eig(realMatrix);
        const eigenValues = eigenResult.lambda.x;
        
        // Singular values are square roots of eigenvalues, sorted descending
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

    let r_op, d_op, systemCapacity = 0;
    const snr_dB = parseFloat(snrValueInput.value) || 10; // Default fallback
    const snr_linear = Math.pow(10, snr_dB / 10);

    if (mode === 'multiplexing') {
        // Calculate r from R = r * log2(1 + SNR)
        const targetRate = parseFloat(rateValueInput.value) || 2; // Default fallback
        r_op = targetRate / Math.log2(1 + snr_linear);
        r_op = Math.max(0, Math.min(r_op, minAntennas));
        d_op = (Nt - r_op) * (Nr - r_op);
        d_op = Math.max(0, d_op);
        systemCapacity = r_op * Math.log2(1 + snr_linear);
    } else {
        // Calculate d from P_e proportional to 1/(SNR)^d
        const targetErrorProb = parseFloat(errorProbValueInput.value) || 0.01; // Default fallback
        // d = log(P_e) / log(1/SNR) = -log(P_e) / log(SNR)
        d_op = -Math.log(targetErrorProb) / Math.log(snr_linear);
        d_op = Math.max(0, Math.min(d_op, Nt * Nr));
        
        // Solve for r from d = (Nt - r) * (Nr - r)
        // This is a quadratic: r^2 - (Nt + Nr)r + (Nt*Nr - d) = 0
        const a = 1;
        const b = -(Nt + Nr);
        const c = Nt * Nr - d_op;
        const discriminant = b * b - 4 * a * c;
        
        if (discriminant >= 0) {
            const r1 = (-b + Math.sqrt(discriminant)) / (2 * a);
            const r2 = (-b - Math.sqrt(discriminant)) / (2 * a);
            // Choose the smaller positive root (more conservative)
            r_op = Math.max(0, Math.min(Math.min(r1, r2), minAntennas));
        } else {
            r_op = 0;
        }
        
        // Recalculate d with the computed r
        d_op = (Nt - r_op) * (Nr - r_op);
        systemCapacity = r_op * Math.log2(1 + snr_linear);
    }

    operatingRSpan.textContent = r_op.toFixed(2);
    operatingDSpan.textContent = d_op.toFixed(2);
    systemCapacitySpan.textContent = systemCapacity.toFixed(2);
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

// --- Updated updateFixedValueLabel function ---
function updateFixedValueLabel() {
    const Nt = parseInt(txAntennasInput.value);
    const Nr = parseInt(rxAntennasInput.value);
    
    if (modeSelect.value === 'multiplexing') {
        snrControl.style.display = 'block';
        rateControl.style.display = 'block';
        errorProbControl.style.display = 'none';
    } else {
        snrControl.style.display = 'block';
        rateControl.style.display = 'none';
        errorProbControl.style.display = 'block';
    }
}

/**
 * Renders the DMT curve on its canvas with proper ticks and labels.
 */
function renderTradeoffChart() {
    if (tradeoffPoints.length === 0) return;
    tradeoffChartEl.width = tradeoffChartEl.parentElement.clientWidth;
    tradeoffChartEl.height = 350;
    const width = tradeoffChartEl.width;
    const height = tradeoffChartEl.height;
    const padding = 60;
    tradeoffCtx.clearRect(0, 0, width, height);

    const Nt = parseInt(txAntennasInput.value);
    const Nr = parseInt(rxAntennasInput.value);
    const maxMultiplexingOnAxis = Math.max(1, Math.min(Nt, Nr));
    const maxDiversityOnAxis = Math.max(1, Nt * Nr);
    
    // Draw DMT formula at the top
    tradeoffCtx.fillStyle = '#666';
    tradeoffCtx.font = '14px Arial';
    tradeoffCtx.textAlign = 'center';
    tradeoffCtx.fillText(`DMT: d = (Nt - r)(Nr - r) = (${Nt} - r)(${Nr} - r)`, width / 2, 20);
    
    // Draw Axes
    tradeoffCtx.strokeStyle = '#333';
    tradeoffCtx.lineWidth = 2;
    tradeoffCtx.beginPath();
    tradeoffCtx.moveTo(padding, padding);
    tradeoffCtx.lineTo(padding, height - padding);
    tradeoffCtx.lineTo(width - padding, height - padding);
    tradeoffCtx.stroke();
    
    // Draw X-axis ticks and labels (Multiplexing Gain)
    const numXTicks = Math.min(maxMultiplexingOnAxis, 8);
    const xTickInterval = maxMultiplexingOnAxis / numXTicks;
    tradeoffCtx.fillStyle = '#333';
    tradeoffCtx.font = '11px Arial';
    tradeoffCtx.textAlign = 'center';
    tradeoffCtx.strokeStyle = '#333';
    tradeoffCtx.lineWidth = 1;
    
    for (let i = 0; i <= numXTicks; i++) {
        const value = i * xTickInterval;
        const x = padding + (value / maxMultiplexingOnAxis) * (width - 2 * padding);
        
        // Draw tick
        tradeoffCtx.beginPath();
        tradeoffCtx.moveTo(x, height - padding);
        tradeoffCtx.lineTo(x, height - padding + 5);
        tradeoffCtx.stroke();
        
        // Draw label
        tradeoffCtx.fillText(value.toFixed(1), x, height - padding + 18);
    }
    
    // Draw Y-axis ticks and labels (Diversity Gain)
    const numYTicks = Math.min(Math.ceil(maxDiversityOnAxis / 2), 8);
    const yTickInterval = maxDiversityOnAxis / numYTicks;
    tradeoffCtx.textAlign = 'right';
    tradeoffCtx.textBaseline = 'middle';
    
    for (let i = 0; i <= numYTicks; i++) {
        const value = i * yTickInterval;
        const y = height - padding - (value / maxDiversityOnAxis) * (height - 2 * padding);
        
        // Draw tick
        tradeoffCtx.beginPath();
        tradeoffCtx.moveTo(padding, y);
        tradeoffCtx.lineTo(padding - 5, y);
        tradeoffCtx.stroke();
        
        // Draw label
        tradeoffCtx.fillText(value.toFixed(0), padding - 10, y);
    }
    
    // Draw axis labels
    tradeoffCtx.textAlign = 'center';
    tradeoffCtx.textBaseline = 'alphabetic';
    tradeoffCtx.fillStyle = '#333';
    tradeoffCtx.font = '13px Arial';
    tradeoffCtx.fillText('Multiplexing Gain (r)', width / 2, height - 10);
    
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